import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from '../shared/config/env.js';
import { correlationIdPlugin } from '../shared/http/correlationId.js';
import { errorHandler } from '../shared/http/errorHandler.js';
import { createRequireAuth } from '../shared/http/requireAuth.js';
import { UnitOfWork } from '../shared/postgres/UnitOfWork.js';
import { createIdentityModule } from '../modules/identity/index.js';
import { createMessagingModule } from '../modules/messaging/index.js';
import { createCopilotModule } from '../modules/copilot/index.js';

export interface BuiltApp {
  app: FastifyInstance;
  identity: ReturnType<typeof createIdentityModule>;
  messaging: ReturnType<typeof createMessagingModule>;
  copilot: ReturnType<typeof createCopilotModule>;
}

/**
 * Composition root: el unico archivo del backend que conoce los tres
 * modulos a la vez y decide como se conectan entre si (identity le presta
 * verifyAccessToken a requireAuth, que a su vez protege las rutas de
 * messaging y copilot). Ningun modulo conoce a los otros dos directamente.
 */
export async function buildApp(): Promise<BuiltApp> {
  const app = Fastify({
    logger: {
      level: env.isProduction ? 'info' : 'debug',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: true,
  });

  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(correlationIdPlugin);

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Riwi Messaging API',
        version: '1.0.0',
        description: 'Plataforma de mensajeria interna con copiloto RAG. Ver ARCHITECTURE.md para el diseño completo.',
      },
      servers: [{ url: '/api/v1' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler(errorHandler);

  const uow = new UnitOfWork();
  const identity = createIdentityModule(uow);
  const messaging = createMessagingModule(uow);
  const copilot = createCopilotModule(uow);

  const requireAuth = createRequireAuth(identity.verifyAccessToken);

  await app.register(
    async (api) => {
      identity.registerRoutes(api, requireAuth);
      messaging.registerRoutes(api, requireAuth);
      copilot.registerRoutes(api, requireAuth);
    },
    { prefix: '/api/v1' },
  );

  app.get('/health', async () => ({ status: 'ok' }));

  return { app, identity, messaging, copilot };
}
