import { NotFoundError } from '../../../shared/errors/AppError.js';
import type { UnitOfWork } from '../../../shared/postgres/UnitOfWork.js';
import type { AiProvider, CopilotOutcome, CopilotRepository } from '../domain/ports.js';
import { buildUserPrompt } from './buildUserPrompt.js';

export interface Citation {
  messageId: string;
  channelId: string;
  rank: number;
  similarity: number;
}

export interface AskCopilotResult {
  outcome: CopilotOutcome;
  answer: string | null;
  citations: Citation[];
}

export interface PricingConfig {
  inputPerToken: number;
  outputPerToken: number;
}

/**
 * El pipeline completo de RAG. Cada paso mapea directamente a una regla
 * del enunciado; los comentarios lo senalan porque es lo que mas se
 * pregunta en sustentacion.
 */
export class AskCopilotUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly repository: CopilotRepository,
    private readonly aiProvider: AiProvider,
    private readonly promptVersion: string,
    private readonly renderSystemPrompt: (vars: { fullName: string; jobTitle: string }) => string,
    private readonly similarityThreshold: number,
    private readonly contextLimit: number,
    private readonly pricing: PricingConfig,
  ) {}

  async execute(actorId: string, question: string): Promise<AskCopilotResult> {
    return this.uow.runAs(actorId, async (client) => {
      // El copiloto conoce al usuario porque el SERVIDOR lo arma desde el
      // token (actorId), nunca porque el cliente lo declare en el body.
      const profile = await this.repository.getProfile(client, actorId);
      if (!profile) throw new NotFoundError('Perfil no encontrado');

      const embedding = await this.aiProvider.embed(question);

      // Consulta 3: rw_fn_copilot_context ya filtro por membresia en SQL.
      // Lo que llega aqui es exactamente lo que el actor podria ver por su
      // cuenta - ni un mensaje mas.
      const context = await this.repository.getContext(client, { embedding, limit: this.contextLimit });
      const relevant = context.filter((chunk) => chunk.similarity >= this.similarityThreshold);

      if (relevant.length === 0) {
        // Sin contexto suficiente, NUNCA se llama al LLM: no hay nada que
        // rellenar sin alucinar. La negativa es honesta por construccion.
        //
        // Este mismo camino cubre tanto "no existe nada relevante" como
        // "existe pero el actor no tiene permiso" - son indistinguibles a
        // proposito, porque distinguirlos filtraria la existencia de
        // contenido privado ajeno.
        await this.repository.recordQuery(client, {
          userId: actorId,
          question,
          answer: 'NO_CONTEXT',
          outcome: 'no_context',
          promptVersion: this.promptVersion,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
        });
        return { outcome: 'no_context', answer: null, citations: [] };
      }

      const systemPrompt = this.renderSystemPrompt(profile);
      const userPrompt = buildUserPrompt(question, relevant);
      const chatResult = await this.aiProvider.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      // El system prompt instruye al modelo a responder con este token
      // exacto cuando la pregunta no tiene relacion con la plataforma.
      const isOutOfScope = chatResult.content.trim() === 'OUT_OF_SCOPE';
      const costUsd = chatResult.tokensIn * this.pricing.inputPerToken + chatResult.tokensOut * this.pricing.outputPerToken;

      const record = await this.repository.recordQuery(client, {
        userId: actorId,
        question,
        answer: isOutOfScope ? 'OUT_OF_SCOPE' : chatResult.content,
        outcome: isOutOfScope ? 'out_of_scope' : 'answered',
        promptVersion: this.promptVersion,
        tokensIn: chatResult.tokensIn,
        tokensOut: chatResult.tokensOut,
        costUsd,
      });

      if (isOutOfScope) {
        return { outcome: 'out_of_scope', answer: null, citations: [] };
      }

      const citations: Citation[] = relevant.map((chunk, index) => ({
        messageId: chunk.messageId,
        channelId: chunk.channelId,
        rank: index + 1,
        similarity: chunk.similarity,
      }));

      await this.repository.recordCitations(
        client,
        record.id,
        citations.map(({ messageId, rank, similarity }) => ({ messageId, rank, similarity })),
      );

      return { outcome: 'answered', answer: chatResult.content, citations };
    });
  }
}
