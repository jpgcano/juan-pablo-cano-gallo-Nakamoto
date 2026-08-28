import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { JwtTokenService } from './JwtTokenService.js';

const SECRET = 'test-access-secret';

describe('JwtTokenService', () => {
  const service = new JwtTokenService(SECRET, '15m');

  it('verifica un access token con subject valido', () => {
    const token = service.signAccessToken('user-123');
    expect(service.verifyAccessToken(token)).toEqual({ userId: 'user-123' });
  });

  it('rechaza un JWT firmado que no contiene subject', () => {
    const token = jwt.sign({ role: 'user' }, SECRET, { expiresIn: '15m' });
    expect(() => service.verifyAccessToken(token)).toThrow('subject');
  });

  it('rechaza un subject vacio', () => {
    const token = jwt.sign({ sub: '   ' }, SECRET, { expiresIn: '15m' });
    expect(() => service.verifyAccessToken(token)).toThrow('subject');
  });
});
