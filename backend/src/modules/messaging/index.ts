import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { UnitOfWork } from '../../shared/postgres/UnitOfWork.js';
import {
  DeleteMessageUseCase,
  EditMessageUseCase,
  GetChannelHistoryUseCase,
  ListConversationsUseCase,
  MarkChannelReadUseCase,
  SearchMessagesUseCase,
  SendMessageUseCase,
} from './application/MessageUseCases.js';
import { PgMessagingRepository } from './infrastructure/PgMessagingRepository.js';
import { PgNotifyListener } from './infrastructure/PgNotifyListener.js';
import { registerMessagingRoutes } from './interfaces/http/routes.js';
import { registerMessagingSocket } from './interfaces/realtime/socket.js';

export function createMessagingModule(uow: UnitOfWork) {
  const repository = new PgMessagingRepository();
  const notifyListener = new PgNotifyListener();

  const sendMessage = new SendMessageUseCase(uow, repository);
  const editMessage = new EditMessageUseCase(uow, repository);
  const deleteMessage = new DeleteMessageUseCase(uow, repository);
  const markChannelRead = new MarkChannelReadUseCase(uow, repository);
  const getHistory = new GetChannelHistoryUseCase(uow, repository);
  const search = new SearchMessagesUseCase(uow, repository);
  const listConversations = new ListConversationsUseCase(uow, repository);

  return {
    async startRealtime(): Promise<void> {
      await notifyListener.start();
    },
    async stopRealtime(): Promise<void> {
      await notifyListener.stop();
    },
    registerRoutes(app: FastifyInstance, requireAuth: preHandlerHookHandler): void {
      registerMessagingRoutes(app, {
        sendMessage,
        editMessage,
        deleteMessage,
        markChannelRead,
        getHistory,
        search,
        listConversations,
        requireAuth,
      });
    },
    registerSocket(io: SocketIOServer, verifyAccessToken: (token: string) => { userId: string }): void {
      registerMessagingSocket(io, {
        verifyAccessToken,
        isChannelMember: (userId, channelId) =>
          uow.runAnonymous((client) => repository.isChannelMember(client, { channelId, userId })),
        notifyListener,
      });
    },
  };
}

export type MessagingModule = ReturnType<typeof createMessagingModule>;
