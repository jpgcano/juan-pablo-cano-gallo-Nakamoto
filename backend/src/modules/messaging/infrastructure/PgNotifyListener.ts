import { EventEmitter } from 'node:events';
import pg from 'pg';
import { env } from '../../../shared/config/env.js';

export interface MessageCreatedEvent {
  channelId: string;
  messageId: string;
  createdAt: string;
}

/**
 * Conexion dedicada (fuera del pool) para LISTEN: una conexion de pool no
 * sirve porque LISTEN/NOTIFY necesita una sesion persistente, no una que
 * el pool pueda reciclar entre requests.
 *
 * El payload de la notificacion solo trae identificadores (ver
 * database/migrations/messaging/080_triggers.sql): esta clase nunca ve el
 * cuerpo de un mensaje, y por diseño no puede filtrar nada porque no tiene
 * nada que filtrar. Quien SI decide que un socket puede recibir el evento
 * es interfaces/realtime/socket.ts, revalidando membresia en cada union
 * a una sala.
 */
export class PgNotifyListener extends EventEmitter {
  private client: pg.Client | undefined;

  async start(): Promise<void> {
    this.client = new pg.Client({ connectionString: env.appDatabaseUrl });
    await this.client.connect();
    await this.client.query('LISTEN rw_message_events');

    this.client.on('notification', (msg) => {
      if (!msg.payload) return;
      try {
        const payload = JSON.parse(msg.payload) as { channel_id: string; message_id: string; created_at: string };
        this.emit('message_created', {
          channelId: payload.channel_id,
          messageId: payload.message_id,
          createdAt: payload.created_at,
        } satisfies MessageCreatedEvent);
      } catch (error) {
        this.emit('error', error);
      }
    });
  }

  async stop(): Promise<void> {
    await this.client?.end();
  }
}
