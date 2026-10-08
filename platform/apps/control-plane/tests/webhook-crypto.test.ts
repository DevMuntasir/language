import { WebhookSecretCipher } from '../src/integrations/webhook-crypto';

describe('WebhookSecretCipher', () => {
  it('uses a random nonce and never stores the plaintext', () => {
    const cipher = new WebhookSecretCipher('a-dedicated-test-secret-that-is-long-enough');
    const plaintext = 'webhook-signing-secret';
    const first = cipher.encrypt(plaintext);
    const second = cipher.encrypt(plaintext);
    expect(first).not.toBe(second);
    expect(first).not.toContain(plaintext);
    expect(first.split('.')).toHaveLength(3);
  });
});
