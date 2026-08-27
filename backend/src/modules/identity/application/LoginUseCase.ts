import { randomUUID } from 'node:crypto';
import { UnauthorizedError } from '../../../shared/errors/AppError.js';
import type { UnitOfWork } from '../../../shared/postgres/UnitOfWork.js';
import type { IdentityRepository, PasswordHasher, TokenService, UserProfile } from '../domain/ports.js';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  profile: UserProfile;
}

/**
 * Caso de uso delgado: valida entrada, invoca la base de datos, mapea
 * resultados. La regla "las contrasenas se verifican contra hash seguro"
 * vive en PasswordHasher (infrastructure/Argon2PasswordHasher), no aqui.
 */
export class LoginUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly repository: IdentityRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly refreshTtlDays: number,
  ) {}

  async execute(input: { email: string; password: string }): Promise<LoginResult> {
    return this.uow.runAnonymous(async (client) => {
      const user = await this.repository.findByEmail(client, input.email);
      if (!user || !user.isActive) {
        throw new UnauthorizedError('Credenciales invalidas');
      }

      const passwordOk = await this.passwordHasher.verify(user.passwordHash, input.password);
      if (!passwordOk) {
        throw new UnauthorizedError('Credenciales invalidas');
      }

      const refreshToken = this.tokenService.generateRefreshToken();
      const refreshExpiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);

      await this.repository.insertRefreshToken(client, {
        userId: user.id,
        tokenHash: this.tokenService.hashRefreshToken(refreshToken),
        familyId: randomUUID(),
        rotatedFrom: null,
        expiresAt: refreshExpiresAt,
      });

      const profile = await this.repository.findProfileById(client, user.id);
      if (!profile) {
        throw new Error('Perfil no encontrado inmediatamente despues del login');
      }

      return {
        accessToken: this.tokenService.signAccessToken(user.id),
        refreshToken,
        refreshExpiresAt,
        profile,
      };
    });
  }
}
