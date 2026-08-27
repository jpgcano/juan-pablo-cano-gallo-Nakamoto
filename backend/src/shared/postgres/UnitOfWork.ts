import type { PoolClient } from 'pg';
import { pool } from './pool.js';

/**
 * El unico camino hacia la base de datos. runAs() fija el actor de la
 * transaccion ANTES de que corra una sola consulta de negocio: es lo que
 * hace que las politicas RLS de PostgreSQL puedan evaluar la fila que se
 * esta pidiendo (ver ARCHITECTURE.md seccion 4 y DECISIONS.md D8).
 *
 * El "true" en set_config es el detalle que importa: hace el valor
 * transaction-local. Sin el, la conexion volveria al pool recordando el
 * actor del request anterior, y el siguiente request heredaria una
 * identidad ajena.
 */
export class UnitOfWork {
  async runAs<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Para las operaciones de identity que ocurren ANTES de que exista un
   * actor (login, refresh): rw_users y rw_refresh_tokens no tienen RLS
   * exactamente por esto (ver database/migrations/identity/010_tables.sql).
   */
  async runAnonymous<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
