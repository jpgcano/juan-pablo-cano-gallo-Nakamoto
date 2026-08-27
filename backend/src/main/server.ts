import { Server as SocketIOServer } from 'socket.io';
import { env } from '../shared/config/env.js';
import { closePool } from '../shared/postgres/pool.js';
import { buildApp } from './app.js';
import { createEmbeddingWorker } from './embeddingWorker.js';

async function main(): Promise<void> {
  const { app, identity, messaging } = await buildApp();

  const io = new SocketIOServer(app.server, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });
  messaging.registerSocket(io, identity.verifyAccessToken);
  await messaging.startRealtime();

  const embeddingWorker = createEmbeddingWorker();
  await embeddingWorker.start();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(`API disponible en /api/v1, documentacion en /docs (puerto ${env.PORT})`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`Recibida ${signal}, cerrando de forma ordenada...`);
    await embeddingWorker.stop();
    await messaging.stopRealtime();
    io.close();
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
