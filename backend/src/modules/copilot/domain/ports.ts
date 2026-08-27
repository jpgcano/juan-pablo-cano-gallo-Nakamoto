export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export type CopilotOutcome = 'answered' | 'no_context' | 'out_of_scope';

export interface ContextChunk {
  messageId: string;
  channelId: string;
  body: string;
  similarity: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Puerto del proveedor de IA. OpenAiProvider es la implementacion por
 * defecto (infrastructure/OpenAiProvider.ts); FakeAiProvider (mismo
 * directorio) es determinista y no toca la red, para que los tests no
 * dependan de un servicio externo. Cambiar de proveedor es una linea en el
 * composition root (main/), nunca un cambio en application/.
 */
export interface AiProvider {
  embed(text: string): Promise<number[]>;
  chat(messages: ChatMessage[]): Promise<ChatResult>;
}

export interface Profile {
  fullName: string;
  jobTitle: string;
}

export interface RecordQueryInput {
  userId: string;
  question: string;
  answer: string;
  outcome: CopilotOutcome;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface CitationInput {
  messageId: string;
  rank: number;
  similarity: number;
}

export interface UsageRow {
  day: string;
  totalQueries: number;
  answered: number;
  noContext: number;
  outOfScope: number;
  tokensInTotal: number;
  tokensOutTotal: number;
  costUsdTotal: number;
}

export interface CopilotRepository {
  /** Contrato publicado por messaging (900_contracts.sql) - la Consulta 3. */
  getContext(client: Queryable, input: { embedding: number[]; limit: number }): Promise<ContextChunk[]>;
  /** Contrato publicado por identity (900_contracts.sql). */
  getProfile(client: Queryable, userId: string): Promise<Profile | null>;

  recordQuery(client: Queryable, input: RecordQueryInput): Promise<{ id: string }>;
  recordCitations(client: Queryable, queryId: string, citations: CitationInput[]): Promise<void>;
  getUsage(client: Queryable, input: { from: Date; to: Date }): Promise<UsageRow[]>;
}
