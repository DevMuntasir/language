import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createClient } from 'redis';
import { createPool, migrate } from './db.js';
import { RoomRepository } from './domain/rooms.js';
import { TokenService } from './auth/token-service.js';
import { LiveKitService } from './media/livekit.js';
import { registerRoutes } from './http/routes.js';
import { WebhookSecretCipher } from './integrations/webhook-crypto.js';
import { RealtimeTranslationService } from './integrations/realtime-translation.js';
import type { AppConfig } from './config.js';

export async function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: { level: config.nodeEnv === 'production' ? 'info' : 'debug' },
    requestIdHeader: 'x-request-id',
    genReqId: (request) => String(request.headers['x-request-id'] ?? crypto.randomUUID()),
    bodyLimit: 1024 * 1024,
  });
  await app.register(cors, { origin: config.corsOrigin, credentials: true });
  await app.register(swagger, {
    openapi: {
      info: { title: 'MiroTalk Control Plane API', version: '2.0.0' },
      servers: [{ url: '/api/v2' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/api/v2/docs' });

  const pool = createPool(config.databaseUrl);
  await migrate(pool);
  const redis = createClient({ url: config.redisUrl });
  redis.on('error', (error) => app.log.error({ error }, 'Redis connection error'));
  await redis.connect();

  const rooms = new RoomRepository(pool);
  const tokens = new TokenService(config.controlTokenSecret);
  const livekit = new LiveKitService(config.livekitInternalUrl, config.livekitApiKey, config.livekitApiSecret);
  const webhookCipher = new WebhookSecretCipher(config.webhookEncryptionKey);
  const translation = new RealtimeTranslationService(config.openaiApiKey, config.realtimeTranslationModel);
  await registerRoutes(app, {
    rooms,
    tokens,
    livekit,
    redis,
    livekitUrl: config.livekitUrl,
    publicAppUrl: config.publicAppUrl,
    adminApiKey: config.adminApiKey,
    webhookCipher,
    translation,
    translatorAgentName: config.translatorAgentName,
  });

  app.setErrorHandler((error, request, reply) => {
    const cause = error as Error & { validation?: unknown };
    request.log.error({ error: cause }, 'Request failed');
    const status = cause.validation ? 400 : 500;
    reply.status(status).send({
      code: cause.validation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: cause.validation ? 'Request validation failed' : 'Internal server error',
      requestId: request.id,
      ...(cause.validation ? { details: cause.validation } : {}),
    });
  });

  return { app, pool, redis, rooms, tokens };
}
