import crypto from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { EventEnvelope, ParticipantPresence, RoomSnapshot } from '@mirotalk/contracts';
import type { TokenService } from '../auth/token-service.js';
import type { RoomRepository } from '../domain/rooms.js';

interface GatewayOptions {
  httpServer: HttpServer;
  redisUrl: string;
  corsOrigin: string;
  tokens: TokenService;
  rooms: RoomRepository;
}

export async function createRealtimeGateway(options: GatewayOptions) {
  const io = new Server(options.httpServer, {
    path: '/control/socket.io',
    transports: ['websocket'],
    cors: { origin: options.corsOrigin, credentials: true },
    maxHttpBufferSize: 256 * 1024,
    pingTimeout: 20_000,
    pingInterval: 25_000,
  });
  const pubClient = createClient({ url: options.redisUrl });
  const subClient = pubClient.duplicate();
  const stateClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect(), stateClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      socket.data.claims = await options.tokens.verify(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const claims = socket.data.claims as Awaited<ReturnType<TokenService['verify']>>;
    const roomKey = `room:${claims.roomId}`;
    let joined = false;

    socket.on('room:join', async (input: { lastSequence?: number } = {}, acknowledge?: (value: RoomSnapshot) => void) => {
      if (joined) return;
      const room = await options.rooms.get(claims.roomId);
      if (!room || room.status !== 'active') return socket.emit('room:error', { code: 'ROOM_NOT_ACTIVE' });
      joined = true;
      await socket.join(claims.roomId);
      const presence: ParticipantPresence = {
        sessionId: claims.sessionId,
        actorId: claims.sub,
        displayName: claims.displayName,
        role: claims.role,
        joinedAt: new Date().toISOString(),
      };
      await stateClient.hSet(`${roomKey}:presence`, claims.sessionId, JSON.stringify(presence));
      await stateClient.expire(`${roomKey}:presence`, 86_400);
      const envelope = await envelopeFor(stateClient, claims.roomId, claims.sessionId, claims.sub, presence);
      socket.to(claims.roomId).emit('participant:joined', envelope);

      const snapshot = await getSnapshot(stateClient, claims.roomId, Number(input.lastSequence ?? 0));
      socket.emit('room:snapshot', snapshot);
      acknowledge?.(snapshot);
    });

    socket.on('collaboration:operation', async (payload: unknown, acknowledge?: (value: EventEnvelope) => void) => {
      if (!joined) return socket.emit('room:error', { code: 'JOIN_REQUIRED' });
      const encoded = JSON.stringify(payload);
      if (Buffer.byteLength(encoded) > 128 * 1024) return socket.emit('room:error', { code: 'PAYLOAD_TOO_LARGE' });
      const event = await envelopeFor(stateClient, claims.roomId, claims.sessionId, claims.sub, payload);
      await stateClient.rPush(`${roomKey}:operations`, JSON.stringify(event));
      await stateClient.lTrim(`${roomKey}:operations`, -1000, -1);
      await stateClient.expire(`${roomKey}:operations`, 86_400);
      io.to(claims.roomId).emit('collaboration:operation', event);
      acknowledge?.(event);
    });

    socket.on('disconnect', async () => {
      if (!joined) return;
      await stateClient.hDel(`${roomKey}:presence`, claims.sessionId);
      await options.rooms.endSession(claims.sessionId);
      const event = await envelopeFor(stateClient, claims.roomId, claims.sessionId, claims.sub, {
        sessionId: claims.sessionId,
      });
      socket.to(claims.roomId).emit('participant:left', event);
    });
  });

  return {
    io,
    stateClient,
    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await Promise.all([pubClient.quit(), subClient.quit(), stateClient.quit()]);
    },
  };
}

async function envelopeFor<T>(
  redis: ReturnType<typeof createClient>,
  roomId: string,
  sessionId: string,
  actorId: string,
  payload: T,
): Promise<EventEnvelope<T>> {
  const sequence = await redis.incr(`room:${roomId}:sequence`);
  await redis.expire(`room:${roomId}:sequence`, 86_400);
  return {
    eventId: crypto.randomUUID(),
    roomId,
    sessionId,
    actorId,
    sequence,
    occurredAt: new Date().toISOString(),
    payload,
  };
}

async function getSnapshot(redis: ReturnType<typeof createClient>, roomId: string, after: number): Promise<RoomSnapshot> {
  const [sequenceValue, presenceValues, operationValues] = await Promise.all([
    redis.get(`room:${roomId}:sequence`),
    redis.hVals(`room:${roomId}:presence`),
    redis.lRange(`room:${roomId}:operations`, 0, -1),
  ]);
  return {
    roomId,
    sequence: Number(sequenceValue ?? 0),
    participants: presenceValues.flatMap((value) => safeParse<ParticipantPresence>(value)),
    operations: operationValues
      .flatMap((value) => safeParse<EventEnvelope>(value))
      .filter((event) => event.sequence > after),
  };
}

function safeParse<T>(value: string): T[] {
  try {
    return [JSON.parse(value) as T];
  } catch {
    return [];
  }
}
