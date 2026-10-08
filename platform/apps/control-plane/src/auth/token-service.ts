import { jwtVerify, SignJWT } from 'jose';
import type { ControlTokenClaims, Role } from '@mirotalk/contracts';

export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue(input: Omit<ControlTokenClaims, 'sub'> & { actorId: string }, expiresIn = '1h'): Promise<string> {
    return new SignJWT({
      sessionId: input.sessionId,
      roomId: input.roomId,
      displayName: input.displayName,
      role: input.role,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(input.actorId)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .setJti(crypto.randomUUID())
      .sign(this.key);
  }

  async verify(token: string): Promise<ControlTokenClaims> {
    const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
    const role = payload.role as Role;
    if (
      !payload.sub ||
      typeof payload.sessionId !== 'string' ||
      typeof payload.roomId !== 'string' ||
      typeof payload.displayName !== 'string' ||
      !['host', 'moderator', 'participant', 'viewer'].includes(role)
    ) {
      throw new Error('Invalid control token claims');
    }
    return {
      sub: payload.sub,
      sessionId: payload.sessionId,
      roomId: payload.roomId,
      displayName: payload.displayName,
      role,
    };
  }
}
