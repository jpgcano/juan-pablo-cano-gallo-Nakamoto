import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import argon2 from 'argon2';
import { Client } from 'pg';
import { env } from './env.js';

interface SeedUser {
  key: string;
  email: string;
  full_name: string;
  job_title: string;
  locale: 'es' | 'en';
}

interface SeedMember {
  user: string;
  role: 'owner' | 'member';
}

interface SeedChannel {
  key: string;
  slug: string;
  name: string;
  type: 'public' | 'private' | 'direct';
  created_by: string;
  members: SeedMember[];
}

interface SeedMessage {
  seq: number;
  channel: string;
  sender: string;
  body: string;
  offset_minutes: number;
  reply_to_seq?: number;
}

interface SeedFile {
  users: SeedUser[];
  channels: SeedChannel[];
  messages: SeedMessage[];
}

const SEED_PATH = join(import.meta.dirname, '../seed/seed.json');

async function alreadySeeded(client: Client, emails: string[]): Promise<boolean> {
  const { rows } = await client.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM rw_users WHERE email = ANY($1)',
    [emails],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function main(): Promise<void> {
  const seed: SeedFile = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

  const client = new Client({ connectionString: env.ownerDatabaseUrl });
  await client.connect();

  try {
    if (await alreadySeeded(client, seed.users.map((u) => u.email))) {
      console.log('El corpus ya esta cargado, no se repite la carga.');
      return;
    }

    await client.query('BEGIN');

    const passwordHash = await argon2.hash(env.seedDefaultPassword, { type: argon2.argon2id });
    const userIds = new Map<string, string>();

    for (const user of seed.users) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO rw_users (email, password_hash, full_name, job_title, locale)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [user.email, passwordHash, user.full_name, user.job_title, user.locale],
      );
      userIds.set(user.key, rows[0]!.id);
    }
    console.log(`+ ${seed.users.length} usuarios`);

    const channelIds = new Map<string, string>();

    for (const channel of seed.channels) {
      const createdBy = userIds.get(channel.created_by);
      if (!createdBy) throw new Error(`Canal ${channel.key}: creador desconocido ${channel.created_by}`);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO rw_channels (slug, name, type, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [channel.slug, channel.name, channel.type, createdBy],
      );
      const channelId = rows[0]!.id;
      channelIds.set(channel.key, channelId);

      for (const member of channel.members) {
        const userId = userIds.get(member.user);
        if (!userId) throw new Error(`Canal ${channel.key}: miembro desconocido ${member.user}`);

        await client.query(
          `INSERT INTO rw_channel_members (channel_id, user_id, role)
           VALUES ($1, $2, $3)`,
          [channelId, userId, member.role],
        );
      }
    }
    console.log(`+ ${seed.channels.length} canales y sus membresias`);

    const messageIds = new Map<number, string>();
    const baseTimestamp = new Date();
    baseTimestamp.setUTCDate(baseTimestamp.getUTCDate() - 10);

    for (const message of [...seed.messages].sort((a, b) => a.seq - b.seq)) {
      const channelId = channelIds.get(message.channel);
      const senderId = userIds.get(message.sender);
      if (!channelId) throw new Error(`Mensaje ${message.seq}: canal desconocido ${message.channel}`);
      if (!senderId) throw new Error(`Mensaje ${message.seq}: remitente desconocido ${message.sender}`);

      const replyToId = message.reply_to_seq ? messageIds.get(message.reply_to_seq) ?? null : null;
      const createdAt = new Date(baseTimestamp.getTime() + message.offset_minutes * 60_000);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO rw_messages (channel_id, sender_id, body, reply_to_id, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [channelId, senderId, message.body, replyToId, createdAt.toISOString()],
      );
      messageIds.set(message.seq, rows[0]!.id);
    }
    console.log(`+ ${seed.messages.length} mensajes`);

    await client.query('COMMIT');
    console.log('Corpus cargado correctamente.');
    console.log(`Contrasena de todos los usuarios de prueba: ${env.seedDefaultPassword}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
