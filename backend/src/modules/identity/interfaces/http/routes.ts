import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { UnauthorizedError } from '../../../../shared/errors/AppError.js';
import { parseOrThrow } from '../../../../shared/http/validate.js';
import type { LoginUseCase } from '../../application/LoginUseCase.js';
import type { RefreshUseCase } from '../../application/RefreshUseCase.js';
import type { LogoutUseCase } from '../../application/LogoutUseCase.js';
import type {
  DeactivateAccountUseCase,
  GetMeUseCase,
  GetProfilesByIdsUseCase,
  UpdateProfileUseCase,
} from '../../application/ProfileUseCases.js';
import { listProfilesQuerySchema, loginSchema, updateProfileSchema } from './schemas.js';

const REFRESH_COOKIE = 'riwi_refresh';

export interface IdentityRouteDeps {
  login: LoginUseCase;
  refresh: RefreshUseCase;
  logout: LogoutUseCase;
  getMe: GetMeUseCase;
  getProfilesByIds: GetProfilesByIdsUseCase;
  updateProfile: UpdateProfileUseCase;
  deactivate: DeactivateAccountUseCase;
  requireAuth: preHandlerHookHandler;
  cookieSecure: boolean;
}

export function registerIdentityRoutes(app: FastifyInstance, deps: IdentityRouteDeps): void {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: deps.cookieSecure,
    path: '/api/v1/auth',
  };

  app.post('/auth/login', async (request, reply) => {
    const body = parseOrThrow(loginSchema, request.body);
    const result = await deps.login.execute(body);

    reply.setCookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions, expires: result.refreshExpiresAt });
    return { accessToken: result.accessToken, profile: result.profile };
  });

  app.post('/auth/refresh', async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedError('Falta el refresh token');

    const result = await deps.refresh.execute(token);
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions, expires: result.refreshExpiresAt });
    return { accessToken: result.accessToken };
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (token) await deps.logout.execute(token);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    reply.status(204);
  });

  app.get('/users', { preHandler: deps.requireAuth }, async (request) => {
    const { ids } = parseOrThrow(listProfilesQuerySchema, request.query);
    return deps.getProfilesByIds.execute(request.actor!.userId, ids);
  });

  app.get('/me', { preHandler: deps.requireAuth }, async (request) => {
    return deps.getMe.execute(request.actor!.userId);
  });

  app.patch('/me', { preHandler: deps.requireAuth }, async (request) => {
    const body = parseOrThrow(updateProfileSchema, request.body);
    return deps.updateProfile.execute(request.actor!.userId, body);
  });

  app.delete('/me', { preHandler: deps.requireAuth }, async (request, reply) => {
    await deps.deactivate.execute(request.actor!.userId);
    reply.status(204);
  });
}
