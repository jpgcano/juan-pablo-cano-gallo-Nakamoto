import { io, type Socket } from 'socket.io-client';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api/v1';
const SOCKET_ORIGIN = new URL(API_URL).origin;

export interface MessageCreatedEvent {
  channelId: string;
  messageId: string;
  createdAt: string;
}

/**
 * Se autentica igual que la API REST: el mismo access token, pasado en el
 * handshake. El backend revalida membresia al unirse a una sala (ver
 * ARCHITECTURE.md seccion 9) - un token valido no basta por si solo.
 */
export function createSocket(accessToken: string): Socket {
  return io(SOCKET_ORIGIN, {
    auth: { token: accessToken },
    withCredentials: true,
    autoConnect: true,
  });
}
