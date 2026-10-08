import crypto from 'node:crypto';

interface OpenAIClientSecret {
  value?: string;
  expires_at?: number;
  error?: { message?: string };
}

export class RealtimeTranslationService {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly model: string,
  ) {}

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async createEnglishSession(actorId: string): Promise<{ value: string; expiresAt?: number }> {
    if (!this.apiKey) throw new Error('OPENAI_NOT_CONFIGURED');
    const safetyIdentifier = crypto.createHash('sha256').update(actorId).digest('hex');
    const response = await fetch('https://api.openai.com/v1/realtime/translations/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safetyIdentifier,
      },
      body: JSON.stringify({
        session: {
          model: this.model,
          audio: {
            output: { language: 'en' },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json()) as OpenAIClientSecret;
    if (!response.ok || !payload.value) {
      throw new Error(payload.error?.message ?? `OpenAI client-secret request failed (${response.status})`);
    }
    return { value: payload.value, ...(payload.expires_at ? { expiresAt: payload.expires_at } : {}) };
  }
}
