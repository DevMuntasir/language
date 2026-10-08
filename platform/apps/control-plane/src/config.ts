export interface AppConfig {
  nodeEnv: string;
  port: number;
  publicAppUrl: string;
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  controlTokenSecret: string;
  webhookEncryptionKey: string;
  adminApiKey: string;
  livekitUrl: string;
  livekitInternalUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  openaiApiKey: string | undefined;
  realtimeTranslationModel: string;
  translatorAgentName: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const controlTokenSecret = required('CONTROL_TOKEN_SECRET');
  if (controlTokenSecret.length < 32) throw new Error('CONTROL_TOKEN_SECRET must contain at least 32 characters');
  const webhookEncryptionKey = required('WEBHOOK_ENCRYPTION_KEY');
  if (webhookEncryptionKey.length < 32) throw new Error('WEBHOOK_ENCRYPTION_KEY must contain at least 32 characters');

  return {
    nodeEnv,
    port: Number(process.env.CONTROL_PORT ?? 3100),
    publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    controlTokenSecret,
    webhookEncryptionKey,
    adminApiKey: required('ADMIN_API_KEY'),
    livekitUrl: required('LIVEKIT_URL'),
    livekitInternalUrl: process.env.LIVEKIT_INTERNAL_URL ?? required('LIVEKIT_URL'),
    livekitApiKey: required('LIVEKIT_API_KEY'),
    livekitApiSecret: required('LIVEKIT_API_SECRET'),
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    realtimeTranslationModel: process.env.REALTIME_TRANSLATION_MODEL ?? 'gpt-realtime-translate',
    translatorAgentName: process.env.TRANSLATOR_AGENT_NAME ?? 'mirotalk-translator',
  };
}
