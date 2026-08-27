import { createHash } from 'node:crypto';
import type { AiProvider, ChatMessage, ChatResult } from '../domain/ports.js';

const EMBEDDING_DIMENSIONS = 1536;

function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
}

/**
 * Proveedor determinista sin red, para tests y para AI_PROVIDER=fake.
 *
 * embed() usa la "hashing trick" (feature hashing): cada palabra se
 * proyecta a una dimension y un signo via hash, y el vector es la suma
 * normalizada. No entiende sinonimos ni semantica real, pero dos textos
 * que comparten vocabulario SI producen una similitud de coseno mayor que
 * dos textos sin relacion - a diferencia de un vector puramente aleatorio,
 * que habria hecho imposible superar el umbral de similitud y el copiloto
 * jamas habria podido "responder", solo negar.
 */
export class FakeAiProvider implements AiProvider {
  async embed(text: string): Promise<number[]> {
    const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

    for (const token of tokenize(text)) {
      const digest = createHash('sha256').update(token).digest();
      const index = digest.readUInt32LE(0) % EMBEDDING_DIMENSIONS;
      const sign = digest[4]! % 2 === 0 ? 1 : -1;
      vector[index] = (vector[index] ?? 0) + sign;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (magnitude === 0) return vector;
    return vector.map((value) => value / magnitude);
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';

    if (userMessage.includes('SIMULA_FUERA_DE_ALCANCE')) {
      return { content: 'OUT_OF_SCOPE', tokensIn: userMessage.length, tokensOut: 3 };
    }

    return {
      content: 'Respuesta simulada a partir del contexto proporcionado [msg:1].',
      tokensIn: userMessage.length,
      tokensOut: 12,
    };
  }
}
