import pg from 'pg';
import { env } from '../config/env.js';

/**
 * Unico pool de conexiones del proceso, siempre como rw_app (nunca como
 * el rol propietario). Todo acceso a datos de los tres modulos pasa por
 * aqui, directa o indirectamente a traves de UnitOfWork.
 */
export const pool = new pg.Pool({
  connectionString: env.appDatabaseUrl,
  max: 10,
});

export async function closePool(): Promise<void> {
  await pool.end();
}
