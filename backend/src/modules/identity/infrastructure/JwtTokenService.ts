import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AccessTokenPayload, TokenService } from '../domain/ports.js';

interface JwtClaims {
  sub: string;
}

/**
 * El refresh token es un secreto opaco de alta entropia, no un JWT: no
 * necesita ser autocontenido porque siempre se busca por su hash en
 * rw_refresh_tokens, que es tambien donde vive la logica de revocacion.
 * Solo el access token es JWT (de vida corta, sin estado en la base).
 */
export class JwtTokenService implements TokenService {
  constructor(
    private readonly accessSecret: string,
    private readonly accessTtl: string,
  ) {}

  signAccessToken(userId: string): string {
    return jwt.sign({ sub: userId } satisfies JwtClaims, this.accessSecret, {
      expiresIn: this.accessTtl as jwt.SignOptions['expiresIn'],
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, this.accessSecret);
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.sub !== 'string' ||
      decoded.sub.trim().length === 0
    ) {
      throw new Error('JWT de acceso sin un subject valido');
    }
    return { userId: decoded.sub };
  }

  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
