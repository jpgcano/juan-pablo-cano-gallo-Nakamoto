import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/StateViews';
import type { OutgoingMessage } from '../../lib/types';
import { useProfiles } from '../profile/api';
import { useJoinChannelRoom } from './SocketProvider';
import { flattenHistory, useChannelHistory, useConversations, useMarkChannelRead, useSendMessage } from './api';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';

interface Props {
  channelId: string | null;
  currentUserId: string;
}

export function ConversationView({ channelId, currentUserId }: Props) {
  const { t } = useTranslation();
  const conversations = useConversations();
  const history = useChannelHistory(channelId);
  const sendMessage = useSendMessage(channelId);
  const markRead = useMarkChannelRead(channelId);
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);

  useJoinChannelRoom(channelId);

  // Se limpian los mensajes optimistas locales al cambiar de canal.
  useEffect(() => setOutgoing([]), [channelId]);

  useEffect(() => {
    if (channelId) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const fetchedMessages = useMemo(() => flattenHistory(history.data?.pages), [history.data]);

  const visibleMessages = useMemo<OutgoingMessage[]>(() => {
    const fetchedIds = new Set(fetchedMessages.map((m) => m.id));
    const stillPendingOrFailed = outgoing.filter((m) => m.status !== 'sent' || !fetchedIds.has(m.id));
    return [...fetchedMessages.map((m) => ({ ...m, status: 'sent' as const })), ...stillPendingOrFailed];
  }, [fetchedMessages, outgoing]);

  const senderIds = useMemo(() => Array.from(new Set(visibleMessages.map((m) => m.senderId))), [visibleMessages]);
  const profiles = useProfiles(senderIds);
  const senderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const profile of profiles.data ?? []) map.set(profile.id, profile.fullName);
    return map;
  }, [profiles.data]);

  function sendOptimistic(body: string, retryClientMsgId?: string) {
    if (!channelId) return;
    const clientMsgId = retryClientMsgId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    setOutgoing((prev) => [
      ...prev.filter((m) => m.clientMsgId !== clientMsgId),
      {
        id: `local-${clientMsgId}`,
        channelId,
        senderId: currentUserId,
        replyToId: null,
        body,
        clientMsgId,
        createdAt: now,
        editedAt: null,
        deletedAt: null,
        status: 'pending',
      },
    ]);

    sendMessage.mutate(
      { body, clientMsgId },
      {
        onSuccess: (message) => {
          setOutgoing((prev) =>
            prev.map((m) => (m.clientMsgId === clientMsgId ? { ...message, clientMsgId, status: 'sent' } : m)),
          );
        },
        onError: () => {
          setOutgoing((prev) => prev.map((m) => (m.clientMsgId === clientMsgId ? { ...m, status: 'failed' } : m)));
        },
      },
    );
  }

  if (!channelId) {
    return <EmptyState label={t('conversations.noSelection')} />;
  }

  const channelName = conversations.data?.find((c) => c.channelId === channelId)?.name ?? '';

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="font-medium text-slate-900">{channelName}</h2>
      </div>

      <MessageList
        channelId={channelId}
        currentUserId={currentUserId}
        messages={visibleMessages}
        senderNames={senderNames}
        isLoading={history.isLoading}
        isError={history.isError}
        onRetryLoad={() => void history.refetch()}
        hasMore={Boolean(history.hasNextPage)}
        isLoadingMore={history.isFetchingNextPage}
        onLoadMore={() => void history.fetchNextPage()}
        onRetrySend={(message) => message.clientMsgId && sendOptimistic(message.body, message.clientMsgId)}
      />

      <MessageComposer onSend={(body) => sendOptimistic(body)} />
    </div>
  );
}
