import { RealtimeTranslationService } from './realtime-translation.js';
import { describe, expect, it, vi } from 'vitest';

describe('RealtimeTranslationService', () => {
  it('keeps the API key server-side and requests an English interpreter session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ value: 'ephemeral-secret', expires_at: 1234 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const service = new RealtimeTranslationService('server-key', 'gpt-realtime-translate');

    await expect(service.createEnglishSession('actor-1')).resolves.toEqual({
      value: 'ephemeral-secret',
      expiresAt: 1234,
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer server-key');
    expect(new Headers(init?.headers).get('OpenAI-Safety-Identifier')).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      session: { model: 'gpt-realtime-translate', audio: { output: { language: 'en' } } },
    });
    fetchMock.mockRestore();
  });

  it('is disabled without a provider key', async () => {
    const service = new RealtimeTranslationService(undefined, 'gpt-realtime-translate');
    expect(service.configured).toBe(false);
    await expect(service.createEnglishSession('actor-1')).rejects.toThrow('OPENAI_NOT_CONFIGURED');
  });
});
