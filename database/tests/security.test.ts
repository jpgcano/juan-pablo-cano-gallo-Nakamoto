import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { channelId, connectAsApp, connectAsOwner, setActor, userId } from './helpers.js';

/**
 * Corre contra el PostgreSQL real levantado por docker-compose, conectado
 * como rw_app (el mismo rol que usa el backend). No hay mocks: si estas
 * pruebas pasan, es porque las politicas RLS realmente estan filtrando
 * filas, no porque una capa de la aplicacion simulo hacerlo.
 *
 * Requiere que "pnpm migrate" y "pnpm seed" ya hayan corrido, en particular
 * el canal semilla "junta-directiva", del que Ana Rios NO es miembro.
 *
 * Los ids de prueba se resuelven con connectAsOwner() (bypassa RLS) y no
 * con la conexion de Ana: precisamente porque junta-directiva es invisible
 * para Ana por RLS, resolverlo con su propia conexion siempre devolveria
 * cero filas - ese es el comportamiento que se quiere probar, no un
 * problema de configuracion.
 */
describe('seguridad de acceso entre canales', () => {
  let appClient: Client;
  let ana: string;
  let junta: string;
  let general: string;

  beforeAll(async () => {
    const owner = connectAsOwner();
    await owner.connect();
    try {
      ana = await userId(owner, 'ana.rios@riwi.io');
      junta = await channelId(owner, 'junta-directiva');
      general = await channelId(owner, 'general');
    } finally {
      await owner.end();
    }

    appClient = connectAsApp();
    await appClient.connect();
  });

  afterAll(async () => {
    await appClient.end();
  });

  it('un usuario no miembro no puede leer mensajes de un canal privado ajeno', async () => {
    await appClient.query('BEGIN');
    try {
      await setActor(appClient, ana);
      const { rows } = await appClient.query('SELECT id FROM rw_messages WHERE channel_id = $1', [junta]);
      expect(rows).toHaveLength(0);
    } finally {
      await appClient.query('ROLLBACK');
    }
  });

  it('un usuario no miembro no puede enviar mensajes a un canal privado ajeno', async () => {
    await appClient.query('BEGIN');
    try {
      await setActor(appClient, ana);
      await expect(
        appClient.query('SELECT rw_fn_send_message($1, $2, NULL, NULL)', [junta, 'intento no autorizado']),
      ).rejects.toThrow(/no es miembro/);
    } finally {
      await appClient.query('ROLLBACK');
    }
  });

  it('la busqueda de texto nunca devuelve mensajes de canales privados ajenos', async () => {
    await appClient.query('BEGIN');
    try {
      await setActor(appClient, ana);
      // "presupuesto" solo aparece en el contenido confidencial de junta-directiva (ver seed.json).
      const { rows } = await appClient.query(
        `SELECT id FROM rw_messages
         WHERE deleted_at IS NULL AND search_vector @@ websearch_to_tsquery('spanish', $1)`,
        ['presupuesto'],
      );
      expect(rows).toHaveLength(0);
    } finally {
      await appClient.query('ROLLBACK');
    }
  });

  it('el contrato de contexto del copiloto no expone canales ajenos', async () => {
    await appClient.query('BEGIN');
    try {
      await setActor(appClient, ana);
      const { rows } = await appClient.query('SELECT message_id FROM rw_v_copilot_corpus WHERE channel_id = $1', [junta]);
      expect(rows).toHaveLength(0);
    } finally {
      await appClient.query('ROLLBACK');
    }
  });

  it('sin actor fijado, cualquier consulta sobre una tabla protegida falla en vez de devolver datos', async () => {
    await appClient.query('BEGIN');
    try {
      await expect(appClient.query('SELECT id FROM rw_messages LIMIT 1')).rejects.toThrow(/current_user_id/);
    } finally {
      await appClient.query('ROLLBACK');
    }
  });

  it('un intento de inyeccion SQL en el cuerpo de un mensaje se guarda como texto inerte', async () => {
    await appClient.query('BEGIN');
    try {
      await setActor(appClient, ana);
      const payload = "'; DROP TABLE rw_messages; --";

      await appClient.query('SELECT rw_fn_send_message($1, $2, NULL, NULL)', [general, payload]);

      const stillExists = await appClient.query<{ reg: string | null }>('SELECT to_regclass($1) AS reg', ['rw_messages']);
      expect(stillExists.rows[0]?.reg).toBe('rw_messages');

      const { rows } = await appClient.query<{ body: string }>(
        'SELECT body FROM rw_messages WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 1',
        [general],
      );
      expect(rows[0]?.body).toBe(payload);
    } finally {
      await appClient.query('ROLLBACK');
    }
  });
});
