import pg from 'pg';
import { env } from '../shared/config/env.js';
import { createAiProvider } from '../modules/copilot/index.js';

interface PendingRow {
  message_id: string;
  body: string;
}

/**
 * Patron outbox (ver DECISIONS.md D9): un proceso aparte, con su propio
 * rol (rw_worker, column-limited - ver database/migrations/000_extensions_and_roles.sql),
 * calcula los embeddings fuera de la transaccion de quien envio el mensaje.
 * Simplificacion de alcance para la ventana de 8 horas: corre como un
 * intervalo dentro del mismo proceso del servidor en vez de un contenedor
 * separado. La conexion y el rol ya estan aislados como si lo fuera; lo
 * unico que cambiaria en un entorno productivo es el empaquetado.
 */
export function createEmbeddingWorker() {
  const aiProvider = createAiProvider();
  const client = new pg.Client({ connectionString: env.workerDatabaseUrl });
  const model = env.AI_PROVIDER === 'openai' ? env.OPENAI_EMBEDDING_MODEL : 'fake';

  let timer: NodeJS.Timeout | undefined;
  let connected = false;
  let tickInFlight = false;

  async function tick(): Promise<void> {
    if (tickInFlight) return; // evita solapar ciclos si uno tarda mas que el intervalo
    tickInFlight = true;
    try {
      const { rows } = await client.query<PendingRow>(
        `SELECT me.message_id, m.body
         FROM rw_message_embeddings me
         JOIN rw_messages m ON m.id = me.message_id
         WHERE me.is_stale
         LIMIT $1`,
        [env.EMBEDDING_WORKER_BATCH_SIZE],
      );

      for (const row of rows) {
        try {
          const embedding = await aiProvider.embed(row.body);
          await client.query(
            `UPDATE rw_message_embeddings
             SET embedding = $1::vector, model = $2, is_stale = false, updated_at = now()
             WHERE message_id = $3`,
            [`[${embedding.join(',')}]`, model, row.message_id],
          );
        } catch (error) {
          console.error(`[embedding-worker] fallo procesando el mensaje ${row.message_id}`, error);
        }
      }
    } catch (error) {
      console.error('[embedding-worker] fallo el ciclo de polling', error);
    } finally {
      tickInFlight = false;
    }
  }

  return {
    async start(): Promise<void> {
      await client.connect();
      connected = true;
      timer = setInterval(() => void tick(), env.EMBEDDING_WORKER_INTERVAL_MS);
      void tick();
    },
    async stop(): Promise<void> {
      if (timer) clearInterval(timer);
      if (connected) await client.end();
    },
  };
}
