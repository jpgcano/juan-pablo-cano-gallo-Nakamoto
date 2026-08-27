import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { createSocket, type MessageCreatedEvent } from '../../lib/socket';
import { useAccessToken } from '../../lib/useAccessToken';

const SocketContext = createContext<Socket | null>(null);

/**
 * Una sola conexion de socket por sesion, creada con el access token
 * disponible al montar. La rotacion del refresh token no la reconecta: la
 * conexion ya establecida sigue siendo valida, solo las conexiones NUEVAS
 * necesitarian un token vigente para el handshake.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const token = useAccessToken();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token || socketRef.current) return;

    const socket = createSocket(token);
    socketRef.current = socket;

    socket.on('message:new', (event: MessageCreatedEvent) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['messages', event.channelId] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, queryClient]);

  return <SocketContext.Provider value={socketRef.current}>{children}</SocketContext.Provider>;
}

/** Une (o abandona al desmontar) la sala de tiempo real de un canal. El backend revalida membresia en cada join. */
export function useJoinChannelRoom(channelId: string | null): void {
  const socket = useContext(SocketContext);

  useEffect(() => {
    if (!socket || !channelId) return;
    socket.emit('channel:join', channelId);
    return () => {
      socket.emit('channel:leave', channelId);
    };
  }, [socket, channelId]);
}
