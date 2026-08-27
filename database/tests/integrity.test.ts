import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { channelId, connectAsApp, setActor, userId } from './helpers.js';

describe('integridad transaccional', () => {
  let client: Client;
  let ana: string;
  let general: string;

  beforeAll(async () => {
    client = connectAsApp();
    await client.connect();
    ana = await userId(client, 'ana.rios@riwi.io');
    general = await channelId(client, 'general');
  });

  afterAll(async () => {
    await client.end();
  });

  it('reenviar el mismo client_msg_id no duplica el mensaje', async () => {
    await client.query('BEGIN');
    try {
      await setActor(client, ana);
      const clientMsgId = randomUUID();

      const first = await client.query('SELECT (rw_fn_send_message($1, $2, $3, NULL)).id AS id', [
        general,
        'primer intento',
        clientMsgId,
      ]);
      const retry = await client.query('SELECT (rw_fn_send_message($1, $2, $3, NULL)).id AS id', [
        general,
        'cuerpo distinto en el reintento',
        clientMsgId,
      ]);

      expect(retry.rows[0].id).toBe(first.rows[0].id);

      const { rows } = await client.query('SELECT count(*)::int AS count FROM rw_messages WHERE client_msg_id = $1', [
        clientMsgId,
      ]);
      expect(rows[0].count).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('editar un mensaje conserva el cuerpo original en rw_message_revisions', async () => {
    await client.query('BEGIN');
    try {
      await setActor(client, ana);
      const sent = await client.query('SELECT (rw_fn_send_message($1, $2, NULL, NULL)).id AS id', [
        general,
        'cuerpo original',
      ]);
      const messageId = sent.rows[0].id;

      await client.query('SELECT rw_fn_edit_message($1, $2)', [messageId, 'cuerpo editado']);

      const revision = await client.query(
        'SELECT reason, previous_body FROM rw_message_revisions WHERE message_id = $1',
        [messageId],
      );
      expect(revision.rows).toHaveLength(1);
      expect(revision.rows[0].reason).toBe('edit');
      expect(revision.rows[0].previous_body).toBe('cuerpo original');

      const current = await client.query('SELECT body, edited_at FROM rw_messages WHERE id = $1', [messageId]);
      expect(current.rows[0].body).toBe('cuerpo editado');
      expect(current.rows[0].edited_at).not.toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('el borrado logico nunca elimina la fila y conserva el cuerpo previo', async () => {
    await client.query('BEGIN');
    try {
      await setActor(client, ana);
      const sent = await client.query('SELECT (rw_fn_send_message($1, $2, NULL, NULL)).id AS id', [
        general,
        'mensaje a borrar',
      ]);
      const messageId = sent.rows[0].id;

      await client.query('SELECT rw_fn_soft_delete_message($1)', [messageId]);

      const row = await client.query('SELECT body, deleted_at FROM rw_messages WHERE id = $1', [messageId]);
      expect(row.rows).toHaveLength(1); // la fila sigue existiendo
      expect(row.rows[0].deleted_at).not.toBeNull();
      expect(row.rows[0].body).toBe('mensaje a borrar'); // el cuerpo no se pisa, solo se marca

      const revision = await client.query(
        "SELECT previous_body FROM rw_message_revisions WHERE message_id = $1 AND reason = 'delete'",
        [messageId],
      );
      expect(revision.rows[0].previous_body).toBe('mensaje a borrar');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('editar el mensaje de otro usuario no esta permitido y no deja rastro', async () => {
    await client.query('BEGIN');
    try {
      const luis = await userId(client, 'luis.parra@riwi.io');
      await setActor(client, luis);
      const sent = await client.query('SELECT (rw_fn_send_message($1, $2, NULL, NULL)).id AS id', [
        general,
        'mensaje de luis',
      ]);
      const messageId = sent.rows[0].id;

      await setActor(client, ana);

      // Un statement que falla dentro de una transaccion la deja abortada
      // hasta el proximo ROLLBACK (semantica normal de PostgreSQL). El
      // SAVEPOINT permite seguir verificando en la misma transaccion sin
      // perder el mensaje que ya se habia insertado mas arriba.
      await client.query('SAVEPOINT before_unauthorized_edit');
      await expect(client.query('SELECT rw_fn_edit_message($1, $2)', [messageId, 'ana intenta editar'])).rejects.toThrow();
      await client.query('ROLLBACK TO SAVEPOINT before_unauthorized_edit');

      const revisions = await client.query('SELECT count(*)::int AS count FROM rw_message_revisions WHERE message_id = $1', [
        messageId,
      ]);
      expect(revisions.rows[0].count).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
