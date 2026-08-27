import { writeFileSync } from 'node:fs';
import { stringify } from 'yaml';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const { app } = await buildApp();
  await app.ready();

  const spec = app.swagger();
  const outPath = new URL('../../../docs/openapi.yaml', import.meta.url);
  writeFileSync(outPath, stringify(spec), 'utf8');

  await app.close();
  console.log(`docs/openapi.yaml actualizado (${Object.keys(spec.paths ?? {}).length} rutas)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
