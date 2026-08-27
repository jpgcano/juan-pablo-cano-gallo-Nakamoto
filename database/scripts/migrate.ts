import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Client } from 'pg';
import { env } from './env.js';

const MIGRATIONS_DIR = join(import.meta.dirname, '../migrations');

interface MigrationFile {
  relativePath: string;
  absolutePath: string;
  order: number;
}

function collectMigrationFiles(dir: string): MigrationFile[] {
  const files: MigrationFile[] = [];

  for (const entry of readdirSync(dir)) {
    const absolutePath = join(dir, entry);
    if (statSync(absolutePath).isDirectory()) {
      files.push(...collectMigrationFiles(absolutePath));
      continue;
    }
    if (!entry.endsWith('.sql')) continue;

    const match = /^(\d+)_/.exec(entry);
    if (!match) {
      throw new Error(`Migracion sin prefijo numerico: ${absolutePath}`);
    }

    files.push({
      relativePath: relative(MIGRATIONS_DIR, absolutePath),
      absolutePath,
      order: Number(match[1]),
    });
  }

  return files;
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS rw_schema_migrations (
      filename    text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function alreadyApplied(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ filename: string }>('SELECT filename FROM rw_schema_migrations');
  return new Set(rows.map((row) => row.filename));
}

const PASSWORD_PLACEHOLDERS: Record<string, string> = {
  __RW_APP_PASSWORD__: env.appPassword,
  __RW_WORKER_PASSWORD__: env.workerPassword,
};

function renderTemplate(sql: string): string {
  let rendered = sql;
  for (const [placeholder, value] of Object.entries(PASSWORD_PLACEHOLDERS)) {
    if (!rendered.includes(placeholder)) continue;
    rendered = rendered.replaceAll(placeholder, value.replace(/'/g, "''"));
  }
  return rendered;
}

async function main(): Promise<void> {
  const files = collectMigrationFiles(MIGRATIONS_DIR).sort((a, b) => a.order - b.order);

  const client = new Client({ connectionString: env.ownerDatabaseUrl });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await alreadyApplied(client);

    let ranCount = 0;
    for (const file of files) {
      if (applied.has(file.relativePath)) {
        console.log(`= omitida   ${file.relativePath}`);
        continue;
      }

      const sql = renderTemplate(readFileSync(file.absolutePath, 'utf8'));

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO rw_schema_migrations (filename) VALUES ($1)', [file.relativePath]);
        await client.query('COMMIT');
        console.log(`+ aplicada  ${file.relativePath}`);
        ranCount += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`x fallo     ${file.relativePath}`);
        throw error;
      }
    }

    console.log(ranCount === 0 ? 'Nada nuevo por migrar.' : `${ranCount} migracion(es) aplicada(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
