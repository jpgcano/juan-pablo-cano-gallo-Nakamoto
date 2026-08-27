import type { UnitOfWork } from '../../../shared/postgres/UnitOfWork.js';
import type { CopilotRepository } from '../domain/ports.js';

export class GetUsageUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: CopilotRepository) {}

  async execute(actorId: string, input: { from: Date; to: Date }) {
    return this.uow.runAs(actorId, (client) => this.repository.getUsage(client, input));
  }
}
