import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { channelId, connectAsApp, connectAsOwner, setActor, userId } from './helpers.js';

describe('QA adversarial database coverage', () => {
  let app: Client;
  let owner: Client;
  let ana: string;
  let general: string;
  let privateChannel: string;

  beforeAll(async () => {
    owner = connectAsOwner();
    await owner.connect();
    ana = await userId(owner, 'ana.rios@riwi.io');
    general = await channelId(owner, 'general');
    privateChannel = await channelId(owner, 'junta-directiva');
    app = connectAsApp();
    await app.connect();
  });

  afterAll(async () => {
    await app.end();
    await owner.end();
  });

  it('fails closed when the actor setting is invalid', async () => {
    await app.query('BEGIN');
    try {
      await setActor(app, ana);
      await app.query("SELECT set_config('app.current_user_id', 'not-a-user-id', false)");
      await expect(app.query('SELECT id FROM rw_messages LIMIT 1')).rejects.toThrow(/invalid input syntax for type uuid/);
    } finally {
      await app.query('ROLLBACK');
    }
  });

  it('does not expose private messages through an unbounded history query', async () => {
    await app.query('BEGIN');
    try {
      await setActor(app, ana);
      const result = await app.query('SELECT id FROM rw_messages WHERE channel_id = $1 LIMIT 10000', [privateChannel]);
      expect(result.rows).toHaveLength(0);
    } finally {
      await app.query('ROLLBACK');
    }
  });

  it('rejects oversized message bodies at the database boundary', async () => {
    await app.query('BEGIN');
    try {
      await setActor(app, ana);
      const oversized = 'x'.repeat(4001);
      await expect(app.query('SELECT rw_fn_send_message($1, $2, NULL, NULL)', [general, oversized])).rejects.toThrow();
    } finally {
      await app.query('ROLLBACK');
    }
  });
});
