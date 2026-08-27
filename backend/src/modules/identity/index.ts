import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { env } from '../../shared/config/env.js';
import type { UnitOfWork } from '../../shared/postgres/UnitOfWork.js';
import { LoginUseCase } from './application/LoginUseCase.js';
import { RefreshUseCase } from './application/RefreshUseCase.js';
import { LogoutUseCase } from './application/LogoutUseCase.js';
import { DeactivateAccountUseCase, GetMeUseCase, UpdateProfileUseCase } from './application/ProfileUseCases.js';
import { Argon2PasswordHasher } from './infrastructure/Argon2PasswordHasher.js';
import { JwtTokenService } from './infrastructure/JwtTokenService.js';
import { PgIdentityRepository } from './infrastructure/PgIdentityRepository.js';
import { registerIdentityRoutes } from './interfaces/http/routes.js';

/**
 * Superficie publica del modulo identity. Cualquier otro codigo del
 * backend que necesite verificar un token pasa por aqui - nunca por
 * infrastructure/JwtTokenService.ts directamente (bloqueado por
 * eslint.config.js).
 */
export function createIdentityModule(uow: UnitOfWork) {
  const repository = new PgIdentityRepository();
  const passwordHasher = new Argon2PasswordHasher();
  const tokenService = new JwtTokenService(env.JWT_ACCESS_SECRET, env.JWT_ACCESS_TTL);

  const login = new LoginUseCase(uow, repository, passwordHasher, tokenService, env.JWT_REFRESH_TTL_DAYS);
  const refresh = new RefreshUseCase(uow, repository, tokenService, env.JWT_REFRESH_TTL_DAYS);
  const logout = new LogoutUseCase(uow, repository, tokenService);
  const getMe = new GetMeUseCase(uow, repository);
  const updateProfile = new UpdateProfileUseCase(uow, repository);
  const deactivate = new DeactivateAccountUseCase(uow, repository);

  return {
    verifyAccessToken: (token: string) => tokenService.verifyAccessToken(token),
    registerRoutes(app: FastifyInstance, requireAuth: preHandlerHookHandler): void {
      registerIdentityRoutes(app, {
        login,
        refresh,
        logout,
        getMe,
        updateProfile,
        deactivate,
        requireAuth,
        cookieSecure: env.isProduction,
      });
    },
  };
}

export type IdentityModule = ReturnType<typeof createIdentityModule>;
