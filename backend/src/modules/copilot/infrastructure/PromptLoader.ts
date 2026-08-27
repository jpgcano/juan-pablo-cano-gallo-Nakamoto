import { readFileSync } from 'node:fs';

export const PROMPT_VERSION = 'system.v1';

const TEMPLATE_PATH = new URL('./prompts/system.v1.md', import.meta.url);

let cachedTemplate: string | null = null;

/**
 * El prompt vive en un archivo versionado por nombre (system.v1.md). Un
 * cambio de comportamiento implica crear system.v2.md y actualizar
 * PROMPT_VERSION - nunca editar el v1 in-place - para que
 * rw_copilot_queries.prompt_version siga siendo confiable como evidencia
 * de que version genero cada respuesta.
 */
export function renderSystemPrompt(vars: { fullName: string; jobTitle: string }): string {
  cachedTemplate ??= readFileSync(TEMPLATE_PATH, 'utf8');
  return cachedTemplate.replaceAll('{{fullName}}', vars.fullName).replaceAll('{{jobTitle}}', vars.jobTitle);
}
