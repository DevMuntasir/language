import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { createRealtimeGateway } from './realtime/gateway.js';

const config = loadConfig();
const { app, pool, redis, rooms, tokens } = await buildApp(config);
await app.ready();
const gateway = await createRealtimeGateway({
  httpServer: app.server,
  redisUrl: config.redisUrl,
  corsOrigin: config.corsOrigin,
  tokens,
  rooms,
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, 'Graceful shutdown started');
  await app.close();
  await gateway.close();
  await redis.quit();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: '0.0.0.0' });
