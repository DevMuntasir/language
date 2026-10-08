import { TokenService } from '../src/auth/token-service';

describe('TokenService', () => {
  const service = new TokenService('a-secure-test-secret-that-is-long-enough');

  it('issues and verifies scoped stable session claims', async () => {
    const token = await service.issue({
      actorId: '1aa35085-acf5-4f1d-b170-98835976ce8d',
      sessionId: '1d7cfd73-d852-4dbb-82a9-c81b42e4260f',
      roomId: 'product-demo',
      displayName: 'Host',
      role: 'host',
    });
    const claims = await service.verify(token);
    expect(claims.roomId).toBe('product-demo');
    expect(claims.role).toBe('host');
    expect(claims.sub).toBe('1aa35085-acf5-4f1d-b170-98835976ce8d');
  });

  it('rejects a token signed with another secret', async () => {
    const other = new TokenService('another-secure-test-secret-that-is-long');
    const token = await other.issue({
      actorId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      roomId: 'private',
      displayName: 'Guest',
      role: 'participant',
    });
    await expect(service.verify(token)).rejects.toThrow();
  });
});
