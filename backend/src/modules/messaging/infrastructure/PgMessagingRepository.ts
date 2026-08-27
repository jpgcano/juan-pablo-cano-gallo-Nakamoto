import type {
  ConversationSummary,
  Cursor,
  Message,
  MessagingRepository,
  Queryable,
  SearchHit,
} from '../domain/ports.js';

interface MessageRow {
  id: string;
  channel_id: string;
  sender_id: string;
  reply_to_id: string | null;
  body: string;
  client_msg_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

interface ConversationRow {
  channel_id: string;
  slug: string;
  name: string;
  type: 'public' | 'private' | 'direct';
  is_archived: boolean;
  last_message_id: string | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  last_message_at: string | null;
  unread_count: string;
}

interface SearchRow {
  id: string;
  channel_id: string;
  sender_id: string;
  highlighted_body: string;
  created_at: string;
  rank: number;
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    senderId: row.sender_id,
    replyToId: row.reply_to_id,
    body: row.body,
    clientMsgId: row.client_msg_id,
    createdAt: new Date(row.created_at),
    editedAt: row.edited_at ? new Date(row.edited_at) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

/**
 * Unico lugar del backend que escribe SQL contra las tablas de messaging.
 * Todas las escrituras pasan por las funciones transaccionales de
 * database/migrations/messaging/070_functions.sql - esta clase nunca hace
 * INSERT/UPDATE directo sobre rw_messages.
 */
export class PgMessagingRepository implements MessagingRepository {
  async sendMessage(
    client: Queryable,
    input: { channelId: string; senderId: string; body: string; clientMsgId: string | null; replyToId: string | null },
  ): Promise<Message> {
    const { rows } = await client.query<MessageRow>(
      `SELECT * FROM rw_fn_send_message($1, $2, $3, $4)`,
      [input.channelId, input.body, input.clientMsgId, input.replyToId],
    );
    const row = rows[0];
    if (!row) throw new Error('rw_fn_send_message: sin fila devuelta');
    return toMessage(row);
  }

  async editMessage(client: Queryable, input: { messageId: string; newBody: string }): Promise<Message> {
    const { rows } = await client.query<MessageRow>(`SELECT * FROM rw_fn_edit_message($1, $2)`, [
      input.messageId,
      input.newBody,
    ]);
    const row = rows[0];
    if (!row) throw new Error('rw_fn_edit_message: sin fila devuelta');
    return toMessage(row);
  }

  async softDeleteMessage(client: Queryable, input: { messageId: string }): Promise<Message> {
    const { rows } = await client.query<MessageRow>(`SELECT * FROM rw_fn_soft_delete_message($1)`, [
      input.messageId,
    ]);
    const row = rows[0];
    if (!row) throw new Error('rw_fn_soft_delete_message: sin fila devuelta');
    return toMessage(row);
  }

  async markChannelRead(client: Queryable, input: { channelId: string }): Promise<number> {
    const { rows } = await client.query<{ marked: number }>(`SELECT rw_fn_mark_channel_read($1) AS marked`, [
      input.channelId,
    ]);
    return rows[0]?.marked ?? 0;
  }

  // Consulta 1 (database/queries/01_channel_history_keyset.sql), paginacion
  // por keyset sobre (created_at, id) - nunca OFFSET.
  async getHistory(client: Queryable, input: { channelId: string; cursor: Cursor | null; limit: number }): Promise<Message[]> {
    const { rows } = await client.query<MessageRow>(
      `SELECT id, channel_id, sender_id, reply_to_id, body, client_msg_id, created_at, edited_at, deleted_at
       FROM rw_messages
       WHERE channel_id = $1
         AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
       ORDER BY created_at DESC, id DESC
       LIMIT $4`,
      [input.channelId, input.cursor?.createdAt.toISOString() ?? null, input.cursor?.id ?? null, input.limit],
    );
    return rows.map(toMessage);
  }

  // Consulta 2 (database/queries/02_search_with_highlight.sql).
  async search(client: Queryable, input: { term: string; limit: number }): Promise<SearchHit[]> {
    const { rows } = await client.query<SearchRow>(
      `SELECT
         id, channel_id, sender_id, created_at,
         ts_headline('spanish', body, websearch_to_tsquery('spanish', $1),
           'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=15, MinWords=5') AS highlighted_body,
         ts_rank(search_vector, websearch_to_tsquery('spanish', $1)) AS rank
       FROM rw_messages
       WHERE deleted_at IS NULL
         AND search_vector @@ websearch_to_tsquery('spanish', $1)
       ORDER BY rank DESC, created_at DESC
       LIMIT $2`,
      [input.term, input.limit],
    );
    return rows.map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      senderId: row.sender_id,
      highlightedBody: row.highlighted_body,
      createdAt: new Date(row.created_at),
      rank: row.rank,
    }));
  }

  async listConversations(client: Queryable): Promise<ConversationSummary[]> {
    const { rows } = await client.query<ConversationRow>(`SELECT * FROM rw_v_user_conversations`);
    return rows.map((row) => ({
      channelId: row.channel_id,
      slug: row.slug,
      name: row.name,
      type: row.type,
      isArchived: row.is_archived,
      lastMessage:
        row.last_message_id && row.last_message_body && row.last_message_sender_id && row.last_message_at
          ? {
              id: row.last_message_id,
              body: row.last_message_body,
              senderId: row.last_message_sender_id,
              createdAt: new Date(row.last_message_at),
            }
          : null,
      unreadCount: Number(row.unread_count),
    }));
  }

  async isChannelMember(client: Queryable, input: { channelId: string; userId: string }): Promise<boolean> {
    const { rows } = await client.query<{ is_member: boolean }>(`SELECT rw_is_channel_member($1, $2) AS is_member`, [
      input.channelId,
      input.userId,
    ]);
    return rows[0]?.is_member ?? false;
  }
}
