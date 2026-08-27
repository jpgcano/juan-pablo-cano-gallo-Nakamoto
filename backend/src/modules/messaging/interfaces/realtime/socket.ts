import type { Server as SocketIOServer } from 'socket.io';
import type { MessageCreatedEvent, PgNotifyListener } from '../../infrastructure/PgNotifyListener.js';

export interface RealtimeDeps {
  verifyAccessToken: (token: string) => { userId: string };
  isChannelMember: (userId: string, channelId: string) => Promise<boolean>;
  notifyListener: PgNotifyListener;
}

/**
 * El socket se autentica igual que la API REST (JWT), y unirse a una sala
 * revalida membresia contra la base en ese instante - un token valido no
 * es suficiente, tiene que seguir siendo miembro del canal ahora mismo.
 * El WebSocket no es una puerta lateral que se salte RLS.
 */
export function registerMessagingSocket(io: SocketIOServer, deps: RealtimeDeps): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      socket.data.userId = deps.verifyAccessToken(token).userId;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    socket.on('channel:join', async (channelId: unknown, ack?: (ok: boolean) => void) => {
      try {
        const isValid = typeof channelId === 'string' && (await deps.isChannelMember(userId, channelId));
        if (isValid) socket.join(`channel:${channelId}`);
        ack?.(isValid);
      } catch {
        ack?.(false);
      }
    });

    socket.on('channel:leave', (channelId: unknown) => {
      if (typeof channelId === 'string') socket.leave(`channel:${channelId}`);
    });
  });

  deps.notifyListener.on('message_created', (event: MessageCreatedEvent) => {
    io.to(`channel:${event.channelId}`).emit('message:new', event);
  });
}
