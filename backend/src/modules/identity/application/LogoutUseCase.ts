import type { UnitOfWork } from '../../../shared/postgres/UnitOfWork.js';
import type { IdentityRepository, TokenService } from '../domain/ports.js';

export class LogoutUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly repository: IdentityRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(refreshToken: string): Promise<void> {
    await this.uow.runAnonymous(async (client) => {
      const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
      const existing = await this.repository.findRefreshTokenByHash(client, tokenHash);
      if (existing && !existing.revokedAt) {
        await this.repository.revokeRefreshToken(client, existing.id);
      }
      // Si no existe o ya estaba revocado, cerrar sesion sigue siendo exitoso
      // desde la perspectiva del cliente: el efecto deseado ya esta logrado.
    });
  }
}
