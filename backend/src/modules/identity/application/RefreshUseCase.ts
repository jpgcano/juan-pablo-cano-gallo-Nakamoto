import { UnauthorizedError } from '../../../shared/errors/AppError.js';
import type { UnitOfWork } from '../../../shared/postgres/UnitOfWork.js';
import type { IdentityRepository, TokenService } from '../domain/ports.js';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Rotacion con deteccion de reuso: si el token que llega ya fue revocado
 * (alguien lo uso antes que su duenio legitimo, o el legitimo ya roto y
 * un atacante reintenta el viejo), se revoca la FAMILIA completa. Es
 * preferible sacar a los dos que dejar dentro al atacante.
 */
export class RefreshUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly repository: IdentityRepository,
    private readonly tokenService: TokenService,
    private readonly refreshTtlDays: number,
  ) {}

  async execute(refreshToken: string): Promise<RefreshResult> {
    return this.uow.runAnonymous(async (client) => {
      const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
      const existing = await this.repository.findRefreshTokenByHash(client, tokenHash);

      if (!existing) {
        throw new UnauthorizedError('Refresh token invalido');
      }

      if (existing.revokedAt) {
        await this.repository.revokeRefreshTokenFamily(client, existing.familyId);
        throw new UnauthorizedError('Refresh token reutilizado: la sesion completa fue revocada');
      }

      if (existing.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedError('Refresh token expirado');
      }

      const revoked = await this.repository.revokeRefreshToken(client, existing.id);
      if (!revoked) {
        await this.repository.revokeRefreshTokenFamily(client, existing.familyId);
        throw new UnauthorizedError('Refresh token reutilizado: la sesion completa fue revocada');
      }

      const newRefreshToken = this.tokenService.generateRefreshToken();
      const refreshExpiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);

      await this.repository.insertRefreshToken(client, {
        userId: existing.userId,
        tokenHash: this.tokenService.hashRefreshToken(newRefreshToken),
        familyId: existing.familyId,
        rotatedFrom: existing.id,
        expiresAt: refreshExpiresAt,
      });

      return {
        accessToken: this.tokenService.signAccessToken(existing.userId),
        refreshToken: newRefreshToken,
        refreshExpiresAt,
      };
    });
  }
}
