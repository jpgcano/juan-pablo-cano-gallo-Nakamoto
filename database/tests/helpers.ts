import { Client } from 'pg';
import { env } from '../scripts/env.js';

export async function userId(client: Client, email: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>('SELECT id FROM rw_users WHERE email = $1', [email]);
  const row = rows[0];
  if (!row) throw new Error(`Corpus no cargado: falta el usuario ${email}. Corre "pnpm seed" antes de las pruebas.`);
  return row.id;
}

export async function channelId(client: Client, slug: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>('SELECT id FROM rw_channels WHERE slug = $1', [slug]);
  const row = rows[0];
  if (!row) throw new Error(`Corpus no cargado: falta el canal ${slug}. Corre "pnpm seed" antes de las pruebas.`);
  return row.id;
}

export async function setActor(client: Client, actorId: string): Promise<void> {
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [actorId]);
}

export function connectAsApp(): Client {
  return new Client({ connectionString: env.appDatabaseUrl });
}

/**
 * Conexion de solo lectura para resolver ids en la configuracion de las
 * pruebas (propietaria de las tablas, omite RLS). Nunca se usa para
 * ejecutar las aserciones de seguridad en si: esas siempre corren sobre
 * connectAsApp(), con el actor fijado, igual que el backend real.
 */
export function connectAsOwner(): Client {
  return new Client({ connectionString: env.ownerDatabaseUrl });
}

