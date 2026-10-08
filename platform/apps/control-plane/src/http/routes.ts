import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  CreateRoomBodySchema,
  JoinRoomBodySchema,
  RoomActionBodySchema,
  TranslationSessionBodySchema,
  WebhookSubscriptionBodySchema,
  type ControlTokenClaims,
  type RoomPolicy,
  type TranslationSessionBody,
} from '@mirotalk/contracts';
import { createClient } from 'redis';
import type { RoomRepository } from '../domain/rooms.js';
import type { TokenService } from '../auth/token-service.js';
import type { LiveKitService } from '../media/livekit.js';
import type { WebhookSecretCipher } from '../integrations/webhook-crypto.js';
import type { RealtimeTranslationService } from '../integrations/realtime-translation.js';
import { bearerToken, sendError } from './errors.js';

interface RouteDeps {
  rooms: RoomRepository;
  tokens: TokenService;
  livekit: LiveKitService;
  redis: ReturnType<typeof createClient>;
  livekitUrl: string;
  publicAppUrl: string;
  adminApiKey: string;
  webhookCipher: WebhookSecretCipher;
  translation: RealtimeTranslationService;
  translatorAgentName: string;
}

export async function registerRoutes(app: FastifyInstance, deps: RouteDeps) {
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    await Promise.all([deps.redis.ping(), deps.rooms.stats()]);
    return reply.send({ status: 'ready' });
  });

  app.post('/api/v2/rooms', { schema: { body: CreateRoomBodySchema } }, async (request, reply) => {
    const body = request.body as { roomId?: string; displayName: string; policy?: Partial<RoomPolicy> };
    const roomId = body.roomId ?? crypto.randomBytes(12).toString('base64url');
    const actorId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    try {
      const room = await deps.rooms.create(roomId, actorId, body.policy ?? {});
      await deps.rooms.createSession({ id: sessionId, roomId, actorId, role: 'host' });
      await deps.livekit.ensureRoom(roomId, room.policy.maxParticipants);
      const controlToken = await deps.tokens.issue({
        actorId,
        sessionId,
        roomId,
        displayName: body.displayName,
        role: 'host',
      });
      return reply.status(201).send({
        room,
        controlToken,
        joinUrl: `${deps.publicAppUrl}/join/${encodeURIComponent(roomId)}`,
      });
    } catch (error) {
      if (isUniqueViolation(error)) return sendError(request, reply, 409, 'ROOM_EXISTS', 'Room already exists');
      throw error;
    }
  });

  app.get('/api/v2/rooms/:roomId/status', async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const room = await deps.rooms.get(roomId);
    if (!room) return sendError(request, reply, 404, 'ROOM_NOT_FOUND', 'Room does not exist');
    const participantCount = await deps.redis.hLen(`room:${roomId}:presence`);
    return { ...room, participantCount, atCapacity: participantCount >= room.policy.maxParticipants };
  });

  app.post(
    '/api/v2/rooms/:roomId/join-token',
    { schema: { body: JoinRoomBodySchema } },
    async (request, reply) => {
      const { roomId } = request.params as { roomId: string };
      const body = request.body as { displayName: string; role?: 'participant' | 'viewer' };
      const room = await deps.rooms.get(roomId);
      if (!room || room.status !== 'active') {
        return sendError(request, reply, 404, 'ROOM_NOT_ACTIVE', 'Room is not active');
      }

      const existing = await optionalClaims(request.headers.authorization, deps.tokens);
      const privileged = existing?.roomId === roomId && ['host', 'moderator'].includes(existing.role);
      if ((room.policy.locked || room.policy.joinLocked) && !privileged) {
        return sendError(request, reply, 423, 'ROOM_LOCKED', 'Room is locked');
      }
      const participantCount = await deps.redis.hLen(`room:${roomId}:presence`);
      if (participantCount >= room.policy.maxParticipants) {
        return sendError(request, reply, 409, 'ROOM_FULL', 'Room has reached its participant limit');
      }

      const actorId = existing?.sub ?? crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const role = privileged ? existing!.role : (body.role ?? 'participant');
      await deps.rooms.createSession({ id: sessionId, roomId, actorId, role });
      await deps.livekit.ensureRoom(roomId, room.policy.maxParticipants);
      const [controlToken, livekitToken] = await Promise.all([
        deps.tokens.issue({ actorId, sessionId, roomId, displayName: body.displayName, role }),
        deps.livekit.issueJoinToken({ roomId, actorId, displayName: body.displayName, role }),
      ]);
      return {
        roomId,
        actorId,
        sessionId,
        role,
        policy: room.policy,
        controlToken,
        livekit: { url: deps.livekitUrl, token: livekitToken },
      };
    },
  );

  app.post(
    '/api/v2/rooms/:roomId/translation/sessions',
    { schema: { body: TranslationSessionBodySchema } },
    async (request, reply) => {
      const { roomId } = request.params as { roomId: string };
      const claims = await requiredClaims(request.headers.authorization, deps.tokens);
      if (!claims || claims.roomId !== roomId) {
        return sendError(request, reply, 401, 'UNAUTHORIZED', 'A valid room token is required');
      }
      const body = request.body as TranslationSessionBody;
      const room = await deps.rooms.get(roomId);
      if (!room || room.status !== 'active') {
        return sendError(request, reply, 404, 'ROOM_NOT_ACTIVE', 'Room is not active');
      }
      if (!room.policy.liveTranslationAllowed) {
        return sendError(request, reply, 403, 'TRANSLATION_DISABLED', 'Live translation is disabled for this room');
      }
      if (room.policy.e2ee) {
        return sendError(request, reply, 409, 'E2EE_TRANSLATION_UNAVAILABLE', 'Cloud translation is unavailable in E2EE rooms');
      }
      if (body.sourceParticipantIdentity === claims.sub) {
        return sendError(request, reply, 400, 'INVALID_SOURCE', 'Choose a remote participant to translate');
      }
      if (!(await deps.livekit.hasParticipant(roomId, body.sourceParticipantIdentity))) {
        return sendError(request, reply, 404, 'SOURCE_NOT_FOUND', 'The source participant is no longer in the room');
      }

      const limiterKey = `translation:rate:${roomId}:${claims.sub}`;
      const count = await deps.redis.incr(limiterKey);
      if (count === 1) await deps.redis.expire(limiterKey, 60);
      if (count > 12) return sendError(request, reply, 429, 'RATE_LIMITED', 'Too many translation session requests');

      if (body.targetLanguage === 'en') {
        if (!deps.translation.configured) {
          return sendError(request, reply, 503, 'TRANSLATION_NOT_CONFIGURED', 'English live translation is not configured');
        }
        try {
          const secret = await deps.translation.createEnglishSession(claims.sub);
          return reply.status(201).send({ mode: 'browser-realtime', ...secret });
        } catch (error) {
          request.log.error({ error }, 'Could not create OpenAI realtime translation session');
          return sendError(request, reply, 502, 'TRANSLATION_PROVIDER_ERROR', 'Could not start live translation');
        }
      }

      const idempotencyKey = `translation:dispatch:${roomId}:${claims.sub}:${body.sourceParticipantIdentity}:bn`;
      const existingDispatch = await deps.redis.get(idempotencyKey);
      if (existingDispatch) return reply.status(200).send({ mode: 'agent', dispatchId: existingDispatch });
      try {
        const dispatchId = await deps.livekit.dispatchTranslator(roomId, deps.translatorAgentName, {
          roomId,
          sourceParticipantIdentity: body.sourceParticipantIdentity,
          requesterIdentity: claims.sub,
          targetLanguage: 'bn',
          consent: true,
        });
        await deps.redis.set(idempotencyKey, dispatchId, { EX: 3600 });
        return reply.status(201).send({ mode: 'agent', dispatchId });
      } catch (error) {
        request.log.error({ error }, 'Could not dispatch Bengali translator');
        return sendError(request, reply, 503, 'TRANSLATOR_UNAVAILABLE', 'Bengali interpreter worker is unavailable');
      }
    },
  );

  app.post(
    '/api/v2/rooms/:roomId/actions',
    { schema: { body: RoomActionBodySchema } },
    async (request, reply) => {
      const { roomId } = request.params as { roomId: string };
      const claims = await requiredClaims(request.headers.authorization, deps.tokens);
      if (!claims || claims.roomId !== roomId) {
        return sendError(request, reply, 401, 'UNAUTHORIZED', 'A valid room token is required');
      }
      if (!['host', 'moderator'].includes(claims.role)) {
        return sendError(request, reply, 403, 'FORBIDDEN', 'Moderator role is required');
      }
      const body = request.body as { action: string };
      if (body.action === 'end' && claims.role !== 'host') {
        return sendError(request, reply, 403, 'HOST_REQUIRED', 'Only the host can end a room');
      }
      const room = await deps.rooms.applyAction(roomId, body.action, claims.sub, claims.role);
      if (!room) return sendError(request, reply, 404, 'ROOM_NOT_FOUND', 'Room does not exist');
      return { room };
    },
  );

  app.get('/api/v2/admin/stats', async (request, reply) => {
    if (!safeEqual(request.headers['x-api-key'], deps.adminApiKey)) {
      return sendError(request, reply, 401, 'UNAUTHORIZED', 'A valid admin API key is required');
    }
    const [roomStats, totalParticipants] = await Promise.all([deps.rooms.stats(), countPresence(deps.redis)]);
    return { ...roomStats, totalParticipants };
  });

  app.post(
    '/api/v2/webhooks',
    { schema: { body: WebhookSubscriptionBodySchema } },
    async (request, reply) => {
      if (!safeEqual(request.headers['x-api-key'], deps.adminApiKey)) {
        return sendError(request, reply, 401, 'UNAUTHORIZED', 'A valid admin API key is required');
      }
      const body = request.body as { url: string; events: string[] };
      const id = crypto.randomUUID();
      const signingSecret = crypto.randomBytes(32).toString('base64url');
      await deps.rooms.createWebhook({
        id,
        url: body.url,
        events: body.events,
        encryptedSecret: deps.webhookCipher.encrypt(signingSecret),
      });
      return reply.status(201).send({ id, url: body.url, events: body.events, signingSecret });
    },
  );

  registerV1Compatibility(app, deps);
}

function registerV1Compatibility(app: FastifyInstance, deps: RouteDeps) {
  app.get('/api/v1/stats', async (request, reply) => {
    const key = request.headers.authorization;
    if (!safeEqual(key, deps.adminApiKey)) return reply.status(403).send({ error: 'Unauthorized!' });
    const [stats, totalPeers] = await Promise.all([deps.rooms.stats(), countPresence(deps.redis)]);
    return { success: true, timestamp: new Date().toISOString(), totalRooms: stats.activeRooms, totalPeers };
  });
  app.post('/isRoomActive', async (request) => {
    const roomId = String((request.body as { roomId?: string })?.roomId ?? '');
    const room = roomId ? await deps.rooms.get(roomId) : null;
    return { message: Boolean(room && room.status === 'active') };
  });
}

async function countPresence(redis: ReturnType<typeof createClient>): Promise<number> {
  let total = 0;
  for await (const entry of redis.scanIterator({ MATCH: 'room:*:presence', COUNT: 100 })) {
    const keys = Array.isArray(entry) ? entry : [entry];
    const counts = await Promise.all(keys.map((key) => redis.hLen(key)));
    total += counts.reduce((sum, count) => sum + count, 0);
  }
  return total;
}

async function optionalClaims(header: string | undefined, tokens: TokenService): Promise<ControlTokenClaims | null> {
  const token = bearerToken(header);
  if (!token) return null;
  try {
    return await tokens.verify(token);
  } catch {
    return null;
  }
}

async function requiredClaims(header: string | undefined, tokens: TokenService) {
  return optionalClaims(header, tokens);
}

function safeEqual(provided: string | string[] | undefined, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
