import crypto from 'node:crypto';

export class WebhookSecretCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = crypto.createHash('sha256').update(secret, 'utf8').digest();
  }

  encrypt(value: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
  }
}
