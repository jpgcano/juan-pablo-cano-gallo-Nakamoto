import type {
  CitationInput,
  ContextChunk,
  CopilotRepository,
  Profile,
  Queryable,
  RecordQueryInput,
  UsageRow,
} from '../domain/ports.js';

interface ContextRow {
  message_id: string;
  channel_id: string;
  body: string;
  similarity: number;
}

interface ProfileRow {
  full_name: string;
  job_title: string;
}

interface UsageRowRaw {
  day: string;
  total_queries: string;
  answered: string;
  no_context: string;
  out_of_scope: string;
  tokens_in_total: string;
  tokens_out_total: string;
  cost_usd_total: string;
}

/** pgvector espera el literal como texto: "[0.1,0.2,...]". */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Unico lugar del backend que escribe SQL contra las tablas de copilot -
 * y contra los DOS contratos publicados que necesita (900_contracts.sql):
 * rw_fn_copilot_context (de messaging) y rw_v_identity_profiles (de
 * identity). No hay ninguna consulta aqui contra rw_messages ni rw_users
 * directamente: el modulo copilot no tiene forma de nombrarlas.
 */
export class PgCopilotRepository implements CopilotRepository {
  async getContext(client: Queryable, input: { embedding: number[]; limit: number }): Promise<ContextChunk[]> {
    const { rows } = await client.query<ContextRow>(`SELECT * FROM rw_fn_copilot_context($1::vector, $2::integer)`, [
      toVectorLiteral(input.embedding),
      input.limit,
    ]);
    return rows.map((row) => ({
      messageId: row.message_id,
      channelId: row.channel_id,
      body: row.body,
      similarity: row.similarity,
    }));
  }

  async getProfile(client: Queryable, userId: string): Promise<Profile | null> {
    const { rows } = await client.query<ProfileRow>(`SELECT full_name, job_title FROM rw_v_identity_profiles WHERE id = $1`, [
      userId,
    ]);
    const row = rows[0];
    return row ? { fullName: row.full_name, jobTitle: row.job_title } : null;
  }

  async recordQuery(client: Queryable, input: RecordQueryInput): Promise<{ id: string }> {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO rw_copilot_queries (user_id, question, answer, outcome, prompt_version, tokens_in, tokens_out, cost_usd, guardian_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.userId,
        input.question,
        input.answer,
        input.outcome,
        input.promptVersion,
        input.tokensIn,
        input.tokensOut,
        input.costUsd,
        input.guardianReason ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('rw_copilot_queries: insercion sin fila devuelta');
    return row;
  }

  async recordCitations(client: Queryable, queryId: string, citations: CitationInput[]): Promise<void> {
    for (const citation of citations) {
      await client.query(
        `INSERT INTO rw_copilot_citations (query_id, message_id, rank, similarity) VALUES ($1, $2, $3, $4)`,
        [queryId, citation.messageId, citation.rank, citation.similarity],
      );
    }
  }

  // Consulta 4 (database/queries/04_copilot_usage_by_user.sql).
  async getUsage(client: Queryable, input: { from: Date; to: Date }): Promise<UsageRow[]> {
    const { rows } = await client.query<UsageRowRaw>(
      `SELECT
         date_trunc('day', created_at)                   AS day,
         count(*)                                          AS total_queries,
         count(*) FILTER (WHERE outcome = 'answered')      AS answered,
         count(*) FILTER (WHERE outcome = 'no_context')    AS no_context,
         count(*) FILTER (WHERE outcome = 'out_of_scope')  AS out_of_scope,
         coalesce(sum(tokens_in), 0)                       AS tokens_in_total,
         coalesce(sum(tokens_out), 0)                      AS tokens_out_total,
         coalesce(sum(cost_usd), 0)::numeric(12,6)         AS cost_usd_total
       FROM rw_copilot_queries
       WHERE user_id = rw_current_user_id()
         AND created_at >= $1::timestamptz
         AND created_at <  $2::timestamptz
       GROUP BY date_trunc('day', created_at)
       ORDER BY day DESC`,
      [input.from.toISOString(), input.to.toISOString()],
    );
    return rows.map((row) => ({
      day: row.day,
      totalQueries: Number(row.total_queries),
      answered: Number(row.answered),
      noContext: Number(row.no_context),
      outOfScope: Number(row.out_of_scope),
      tokensInTotal: Number(row.tokens_in_total),
      tokensOutTotal: Number(row.tokens_out_total),
      costUsdTotal: Number(row.cost_usd_total),
    }));
  }
}
