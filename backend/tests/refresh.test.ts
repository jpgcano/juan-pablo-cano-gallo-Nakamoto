import { describe, expect, it, vi } from 'vitest';
import { RefreshUseCase } from '../src/modules/identity/application/RefreshUseCase.js';

describe('refresh rotation concurrency', () => {
  it('revokes the family when the conditional revoke loses a race', async () => {
    const repository = {
      findRefreshTokenByHash: vi.fn().mockResolvedValue({
        id: 'token-id',
        userId: 'user-id',
        familyId: 'family-id',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      }),
      revokeRefreshToken: vi.fn().mockResolvedValue(false),
      revokeRefreshTokenFamily: vi.fn().mockResolvedValue(undefined),
      insertRefreshToken: vi.fn(),
    };
    const tokenService = {
      hashRefreshToken: vi.fn().mockReturnValue('hash'),
      generateRefreshToken: vi.fn(),
      signAccessToken: vi.fn(),
    };
    const uow = { runAnonymous: (fn: (client: object) => Promise<unknown>) => fn({}) };

    await expect(
      new RefreshUseCase(uow as never, repository as never, tokenService as never, 7).execute('old-token'),
    ).rejects.toThrow('reutilizado');
    expect(repository.revokeRefreshTokenFamily).toHaveBeenCalledWith({}, 'family-id');
    expect(tokenService.generateRefreshToken).not.toHaveBeenCalled();
  });
});
