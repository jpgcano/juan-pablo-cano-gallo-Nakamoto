import type { UnitOfWork } from '../../../shared/postgres/UnitOfWork.js';
import type { Cursor, Message, MessagingRepository } from '../domain/ports.js';

/**
 * Casos de uso delgados: validan entrada, invocan la funcion de base de
 * datos que valida permiso y aplica el cambio de forma atomica, mapean el
 * resultado. La logica critica (membresia, autoria, atomicidad) vive en
 * rw_fn_* (ver database/migrations/messaging/070_functions.sql) - aqui no
 * se repite ningun chequeo de permisos.
 */
export class SendMessageUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: MessagingRepository) {}

  async execute(
    actorId: string,
    input: { channelId: string; body: string; clientMsgId?: string; replyToId?: string },
  ): Promise<Message> {
    return this.uow.runAs(actorId, (client) =>
      this.repository.sendMessage(client, {
        channelId: input.channelId,
        senderId: actorId,
        body: input.body,
        clientMsgId: input.clientMsgId ?? null,
        replyToId: input.replyToId ?? null,
      }),
    );
  }
}

export class EditMessageUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: MessagingRepository) {}

  async execute(actorId: string, input: { messageId: string; body: string }): Promise<Message> {
    return this.uow.runAs(actorId, (client) =>
      this.repository.editMessage(client, { messageId: input.messageId, newBody: input.body }),
    );
  }
}

export class DeleteMessageUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: MessagingRepository) {}

  async execute(actorId: string, input: { messageId: string }): Promise<Message> {
    return this.uow.runAs(actorId, (client) => this.repository.softDeleteMessage(client, input));
  }
}

export class MarkChannelReadUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: MessagingRepository) {}

  async execute(actorId: string, input: { channelId: string }): Promise<number> {
    return this.uow.runAs(actorId, (client) => this.repository.markChannelRead(client, input));
  }
}

export interface HistoryPage {
  items: Message[];
  nextCursor: Cursor | null;
}

export class GetChannelHistoryUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: MessagingRepository) {}

  async execute(
    actorId: string,
    input: { channelId: string; cursor: Cursor | null; limit: number },
  ): Promise<HistoryPage> {
    return this.uow.runAs(actorId, async (client) => {
      const items = await this.repository.getHistory(client, input);
      const last = items[items.length - 1];
      // Hay siguiente pagina solo si esta vino llena: si trajo menos que el
      // limite pedido, ya no queda nada mas atras en el tiempo.
      const nextCursor = last && items.length === input.limit ? { createdAt: last.createdAt, id: last.id } : null;
      return { items, nextCursor };
    });
  }
}

export class SearchMessagesUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: MessagingRepository) {}

  async execute(actorId: string, input: { term: string; limit: number }) {
    return this.uow.runAs(actorId, (client) => this.repository.search(client, input));
  }
}

export class ListConversationsUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: MessagingRepository) {}

  async execute(actorId: string) {
    return this.uow.runAs(actorId, (client) => this.repository.listConversations(client));
  }
}
