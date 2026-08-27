/**
 * Tipos propios del frontend, derivados de docs/openapi.yaml pero sin
 * dependencia de codigo con el backend (ver DECISIONS.md D2). Un cambio de
 * forma en la API rompe la compilacion aqui, no en un paquete compartido.
 */

export type Locale = 'es' | 'en';
export type ChannelType = 'public' | 'private' | 'direct';

export interface Profile {
  id: string;
  fullName: string;
  jobTitle: string;
  locale: Locale;
  isActive: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  replyToId: string | null;
  body: string;
  clientMsgId: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export type MessageStatus = 'pending' | 'sent' | 'failed';

export interface OutgoingMessage extends Message {
  status: MessageStatus;
}

export interface ConversationSummary {
  channelId: string;
  slug: string;
  name: string;
  type: ChannelType;
  isArchived: boolean;
  lastMessage: { id: string; body: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
}

export interface SearchHit {
  id: string;
  channelId: string;
  senderId: string;
  highlightedBody: string;
  createdAt: string;
  rank: number;
}

export interface HistoryPage {
  items: Message[];
  nextCursor: string | null;
}

export type CopilotOutcome = 'answered' | 'no_context' | 'out_of_scope';

export interface Citation {
  messageId: string;
  channelId: string;
  rank: number;
  similarity: number;
}

export interface AskCopilotResponse {
  outcome: CopilotOutcome;
  answer: string | null;
  citations: Citation[];
}

export interface CopilotQueryRecord extends AskCopilotResponse {
  id: string;
  question: string;
}

export interface UsageRow {
  day: string;
  totalQueries: number;
  answered: number;
  noContext: number;
  outOfScope: number;
  tokensInTotal: number;
  tokensOutTotal: number;
  costUsdTotal: number;
}

export interface LoginResponse {
  accessToken: string;
  profile: Profile;
}
