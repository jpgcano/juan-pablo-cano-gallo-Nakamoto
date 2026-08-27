import { Client } from 'pg';
import { env } from './env.js';

/**
 * Reinicio destructivo para desarrollo local: recrea el esquema publico desde
 * cero y vuelve a dejar la base exactamente como la deja `pnpm migrate`.
 * Nunca se ejecuta en un pipeline; es un atajo para el coder durante la jornada.
 */
async function main(): Promise<void> {
  const client = new Client({ connectionString: env.ownerDatabaseUrl });
  await client.connect();

  try {
    console.log('Recreando el esquema publico...');
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query(`GRANT ALL ON SCHEMA public TO CURRENT_USER`);
    console.log('Esquema publico recreado. Ejecuta "pnpm migrate" y "pnpm seed" a continuacion.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
