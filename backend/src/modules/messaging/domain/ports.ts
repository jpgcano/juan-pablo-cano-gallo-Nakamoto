export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export type ChannelType = 'public' | 'private' | 'direct';

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  replyToId: string | null;
  body: string;
  clientMsgId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}

export interface ConversationSummary {
  channelId: string;
  slug: string;
  name: string;
  type: ChannelType;
  isArchived: boolean;
  lastMessage: { id: string; body: string; senderId: string; createdAt: Date } | null;
  unreadCount: number;
}

export interface SearchHit {
  id: string;
  channelId: string;
  senderId: string;
  highlightedBody: string;
  createdAt: Date;
  rank: number;
}

export interface Cursor {
  createdAt: Date;
  id: string;
}

export interface MessagingRepository {
  sendMessage(
    client: Queryable,
    input: { channelId: string; senderId: string; body: string; clientMsgId: string | null; replyToId: string | null },
  ): Promise<Message>;
  editMessage(client: Queryable, input: { messageId: string; newBody: string }): Promise<Message>;
  softDeleteMessage(client: Queryable, input: { messageId: string }): Promise<Message>;
  markChannelRead(client: Queryable, input: { channelId: string }): Promise<number>;

  getHistory(
    client: Queryable,
    input: { channelId: string; cursor: Cursor | null; limit: number },
  ): Promise<Message[]>;
  search(client: Queryable, input: { term: string; limit: number }): Promise<SearchHit[]>;
  listConversations(client: Queryable): Promise<ConversationSummary[]>;
  isChannelMember(client: Queryable, input: { channelId: string; userId: string }): Promise<boolean>;
}
