import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingState, EmptyState, ErrorState } from '../../components/StateViews';
import type { OutgoingMessage } from '../../lib/types';
import { MessageBubble } from './MessageBubble';

interface Props {
  channelId: string;
  currentUserId: string;
  messages: OutgoingMessage[];
  senderNames: Map<string, string>;
  isLoading: boolean;
  isError: boolean;
  onRetryLoad: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onRetrySend: (message: OutgoingMessage) => void;
}

/**
 * Carga diferida con la posicion del scroll preservada: al insertar
 * mensajes mas antiguos arriba, se recalcula scrollTop comparando la
 * altura del contenido ANTES y DESPUES del insert, para que el mensaje que
 * el usuario estaba viendo no "salte" de la pantalla.
 */
export function MessageList({
  channelId,
  currentUserId,
  messages,
  senderNames,
  isLoading,
  isError,
  onRetryLoad,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onRetrySend,
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollHeightBeforeLoadMore = useRef<number | null>(null);
  const previousMessageCount = useRef(0);
  const previousChannelId = useRef(channelId);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const channelChanged = previousChannelId.current !== channelId;
    previousChannelId.current = channelId;

    if (channelChanged) {
      container.scrollTop = container.scrollHeight;
    } else if (scrollHeightBeforeLoadMore.current !== null) {
      // Se acaba de insertar una pagina de mensajes mas antiguos arriba.
      const delta = container.scrollHeight - scrollHeightBeforeLoadMore.current;
      container.scrollTop += delta;
      scrollHeightBeforeLoadMore.current = null;
    } else if (messages.length !== previousMessageCount.current) {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom < 150) {
        container.scrollTop = container.scrollHeight;
      }
    }

    previousMessageCount.current = messages.length;
  }, [messages, channelId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          scrollHeightBeforeLoadMore.current = container.scrollHeight;
          onLoadMore();
        }
      },
      { root: container, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, isLoadingMore, channelId]);

  if (isLoading) return <LoadingState label={t('messages.loading')} />;
  if (isError) return <ErrorState label={t('messages.error')} onRetry={onRetryLoad} retryLabel={t('common.retry')} />;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto bg-slate-50 py-2">
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-2 text-xs text-slate-400">
          {isLoadingMore ? t('messages.loading') : t('messages.loadMore')}
        </div>
      )}

      {messages.length === 0 ? (
        <EmptyState label={t('messages.empty')} />
      ) : (
        messages.map((message) => (
          <MessageBubble
            key={message.clientMsgId ?? message.id}
            message={message}
            channelId={channelId}
            isOwn={message.senderId === currentUserId}
            senderName={senderNames.get(message.senderId) ?? '…'}
            onRetry={onRetrySend}
          />
        ))
      )}
    </div>
  );
}
