import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

config({ path: resolve(import.meta.dirname, '../../../../.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string(),
  RW_APP_PASSWORD: z.string().min(1),
  RW_WORKER_PASSWORD: z.string().min(1),
  EMBEDDING_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  EMBEDDING_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(20),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

  AI_PROVIDER: z.enum(['openai', 'fake']).default('fake'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // similarity = 1 - distancia_coseno (ver rw_fn_copilot_context): mas alto
  // es mas parecido. 0.3 es un piso conservador para embeddings reales de
  // OpenAI sobre mensajes cortos.
  COPILOT_SIMILARITY_THRESHOLD: z.coerce.number().min(-1).max(1).default(0.3),
  COPILOT_CONTEXT_LIMIT: z.coerce.number().int().positive().default(6),
  // Tarifas aproximadas de gpt-4o-mini (USD por token), solo para que el
  // reporte de consumo tenga una cifra de referencia - no es facturacion real.
  COPILOT_PRICE_INPUT_PER_TOKEN: z.coerce.number().nonnegative().default(0.00000015),
  COPILOT_PRICE_OUTPUT_PER_TOKEN: z.coerce.number().nonnegative().default(0.0000006),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuracion invalida:', parsed.error.flatten().fieldErrors);
  throw new Error('No se pudo cargar la configuracion desde .env');
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  appDatabaseUrl: `postgres://rw_app:${encodeURIComponent(raw.RW_APP_PASSWORD)}@${raw.DB_HOST}:${raw.DB_PORT}/${raw.POSTGRES_DB}`,
  workerDatabaseUrl: `postgres://rw_worker:${encodeURIComponent(raw.RW_WORKER_PASSWORD)}@${raw.DB_HOST}:${raw.DB_PORT}/${raw.POSTGRES_DB}`,
};
