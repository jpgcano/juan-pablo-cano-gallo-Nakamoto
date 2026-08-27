import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { parseOrThrow } from '../../../../shared/http/validate.js';
import { decodeCursor, encodeCursor } from '../../../../shared/http/cursor.js';
import type {
  DeleteMessageUseCase,
  EditMessageUseCase,
  GetChannelHistoryUseCase,
  ListConversationsUseCase,
  MarkChannelReadUseCase,
  SearchMessagesUseCase,
  SendMessageUseCase,
} from '../../application/MessageUseCases.js';
import {
  channelParamsSchema,
  editMessageSchema,
  historyQuerySchema,
  messageParamsSchema,
  searchQuerySchema,
  sendMessageSchema,
} from './schemas.js';

export interface MessagingRouteDeps {
  sendMessage: SendMessageUseCase;
  editMessage: EditMessageUseCase;
  deleteMessage: DeleteMessageUseCase;
  markChannelRead: MarkChannelReadUseCase;
  getHistory: GetChannelHistoryUseCase;
  search: SearchMessagesUseCase;
  listConversations: ListConversationsUseCase;
  requireAuth: preHandlerHookHandler;
}

export function registerMessagingRoutes(app: FastifyInstance, deps: MessagingRouteDeps): void {
  app.get('/channels', { preHandler: deps.requireAuth }, async (request) => {
    return deps.listConversations.execute(request.actor!.userId);
  });

  app.get('/channels/:channelId/messages', { preHandler: deps.requireAuth }, async (request) => {
    const { channelId } = parseOrThrow(channelParamsSchema, request.params);
    const { cursor, limit } = parseOrThrow(historyQuerySchema, request.query);

    const decoded = decodeCursor(cursor);
    const page = await deps.getHistory.execute(request.actor!.userId, {
      channelId,
      cursor: decoded ? { createdAt: new Date(decoded.createdAt), id: decoded.id } : null,
      limit,
    });

    return {
      items: page.items,
      nextCursor: page.nextCursor
        ? encodeCursor({ createdAt: page.nextCursor.createdAt.toISOString(), id: page.nextCursor.id })
        : null,
    };
  });

  app.post('/channels/:channelId/messages', { preHandler: deps.requireAuth }, async (request, reply) => {
    const { channelId } = parseOrThrow(channelParamsSchema, request.params);
    const body = parseOrThrow(sendMessageSchema, request.body);

    const message = await deps.sendMessage.execute(request.actor!.userId, { channelId, ...body });
    reply.status(201);
    return message;
  });

  app.post('/channels/:channelId/read', { preHandler: deps.requireAuth }, async (request) => {
    const { channelId } = parseOrThrow(channelParamsSchema, request.params);
    const marked = await deps.markChannelRead.execute(request.actor!.userId, { channelId });
    return { marked };
  });

  app.patch('/messages/:messageId', { preHandler: deps.requireAuth }, async (request) => {
    const { messageId } = parseOrThrow(messageParamsSchema, request.params);
    const { body } = parseOrThrow(editMessageSchema, request.body);
    return deps.editMessage.execute(request.actor!.userId, { messageId, body });
  });

  app.delete('/messages/:messageId', { preHandler: deps.requireAuth }, async (request) => {
    const { messageId } = parseOrThrow(messageParamsSchema, request.params);
    return deps.deleteMessage.execute(request.actor!.userId, { messageId });
  });

  app.get('/search', { preHandler: deps.requireAuth }, async (request) => {
    const { q, limit } = parseOrThrow(searchQuerySchema, request.query);
    return deps.search.execute(request.actor!.userId, { term: q, limit });
  });
}
