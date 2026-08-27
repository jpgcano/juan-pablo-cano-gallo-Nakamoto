import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`);
  }
  return value;
}

function withRole(url: string, user: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  return parsed.toString();
}

const ownerDatabaseUrl = required('DATABASE_URL');
const appPassword = required('RW_APP_PASSWORD');
const workerPassword = required('RW_WORKER_PASSWORD');

export const env = {
  ownerDatabaseUrl,
  appPassword,
  workerPassword,
  seedDefaultPassword: process.env.SEED_DEFAULT_PASSWORD ?? 'RiwiDev#2026',
  // Conexiones con los roles con los que realmente corre la aplicacion,
  // usadas por las pruebas para validar RLS contra PostgreSQL real en vez
  // de mocks.
  appDatabaseUrl: withRole(ownerDatabaseUrl, 'rw_app', appPassword),
  workerDatabaseUrl: withRole(ownerDatabaseUrl, 'rw_worker', workerPassword),
};
