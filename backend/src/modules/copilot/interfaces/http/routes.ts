import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { parseOrThrow } from '../../../../shared/http/validate.js';
import type { AskCopilotUseCase } from '../../application/AskCopilotUseCase.js';
import type { GetUsageUseCase } from '../../application/GetUsageUseCase.js';
import { askSchema, usageQuerySchema } from './schemas.js';

export interface CopilotRouteDeps {
  askCopilot: AskCopilotUseCase;
  getUsage: GetUsageUseCase;
  requireAuth: preHandlerHookHandler;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function registerCopilotRoutes(app: FastifyInstance, deps: CopilotRouteDeps): void {
  app.post('/copilot/ask', { preHandler: deps.requireAuth }, async (request) => {
    const { question } = parseOrThrow(askSchema, request.body);
    return deps.askCopilot.execute(request.actor!.userId, question);
  });

  app.get('/copilot/usage', { preHandler: deps.requireAuth }, async (request) => {
    const { from, to } = parseOrThrow(usageQuerySchema, request.query);
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - THIRTY_DAYS_MS);
    return deps.getUsage.execute(request.actor!.userId, { from: fromDate, to: toDate });
  });
}
