import { generateE2eeKey } from './e2ee';

describe('E2EE invite key', () => {
  it('generates a URL-safe 256-bit key without padding', () => {
    const key = generateE2eeKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(key).not.toContain('=');
  });
});
