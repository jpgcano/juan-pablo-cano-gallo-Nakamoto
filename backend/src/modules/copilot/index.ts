import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { env } from '../../shared/config/env.js';
import type { UnitOfWork } from '../../shared/postgres/UnitOfWork.js';
import { AskCopilotUseCase } from './application/AskCopilotUseCase.js';
import { GetUsageUseCase } from './application/GetUsageUseCase.js';
import type { AiProvider } from './domain/ports.js';
import { FakeAiProvider } from './infrastructure/FakeAiProvider.js';
import { OpenAiProvider } from './infrastructure/OpenAiProvider.js';
import { PgCopilotRepository } from './infrastructure/PgCopilotRepository.js';
import { PROMPT_VERSION, renderSystemPrompt } from './infrastructure/PromptLoader.js';
import { registerCopilotRoutes } from './interfaces/http/routes.js';

/**
 * OCP en accion: cambiar de proveedor es esta funcion, ninguna otra linea
 * del modulo cambia. AiProvider (domain/ports.ts) es la unica forma en que
 * application/ conoce al proveedor.
 */
/** Exportada para que el worker de embeddings (main/embeddingWorker.ts) use el mismo proveedor, sin duplicar la seleccion openai/fake. */
export function createAiProvider(): AiProvider {
  if (env.AI_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('AI_PROVIDER=openai requiere OPENAI_API_KEY');
    }
    return new OpenAiProvider(env.OPENAI_API_KEY, env.OPENAI_CHAT_MODEL, env.OPENAI_EMBEDDING_MODEL);
  }
  return new FakeAiProvider();
}

export function createCopilotModule(uow: UnitOfWork) {
  const repository = new PgCopilotRepository();
  const aiProvider = createAiProvider();

  const askCopilot = new AskCopilotUseCase(
    uow,
    repository,
    aiProvider,
    PROMPT_VERSION,
    renderSystemPrompt,
    env.COPILOT_SIMILARITY_THRESHOLD,
    env.COPILOT_CONTEXT_LIMIT,
    { inputPerToken: env.COPILOT_PRICE_INPUT_PER_TOKEN, outputPerToken: env.COPILOT_PRICE_OUTPUT_PER_TOKEN },
  );
  const getUsage = new GetUsageUseCase(uow, repository);

  return {
    registerRoutes(app: FastifyInstance, requireAuth: preHandlerHookHandler): void {
      registerCopilotRoutes(app, { askCopilot, getUsage, requireAuth });
    },
  };
}

export type CopilotModule = ReturnType<typeof createCopilotModule>;
