import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/Avatar';
import { HighlightedText } from '../../components/HighlightedText';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews';
import { useConversations, useSearchMessages } from './api';

interface Props {
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function ChannelList({ selectedChannelId, onSelectChannel }: Props) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const conversations = useConversations();
  const search = useSearchMessages(searchTerm);
  const isSearching = searchTerm.trim().length > 0;

  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="p-3">
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t('conversations.searchPlaceholder')}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      {isSearching ? (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1 text-xs font-medium uppercase text-slate-400">
            <span>{t('conversations.searchResults')}</span>
            <button type="button" onClick={() => setSearchTerm('')} className="normal-case text-slate-500 hover:underline">
              {t('conversations.clearSearch')}
            </button>
          </div>
          {search.isLoading ? (
            <LoadingState label={t('common.loading')} />
          ) : (search.data ?? []).length === 0 ? (
            <EmptyState label={t('conversations.searchEmpty', { term: searchTerm })} />
          ) : (
            search.data!.map((hit) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => {
                  onSelectChannel(hit.channelId);
                  setSearchTerm('');
                }}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <HighlightedText text={hit.highlightedBody} />
              </button>
            ))
          )}
        </div>
      ) : conversations.isLoading ? (
        <LoadingState label={t('conversations.loading')} />
      ) : conversations.isError ? (
        <ErrorState label={t('conversations.error')} onRetry={() => void conversations.refetch()} retryLabel={t('common.retry')} />
      ) : conversations.data!.length === 0 ? (
        <EmptyState label={t('conversations.empty')} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {conversations.data!.map((conversation) => (
            <button
              key={conversation.channelId}
              type="button"
              onClick={() => onSelectChannel(conversation.channelId)}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 ${
                selectedChannelId === conversation.channelId ? 'bg-slate-100' : ''
              }`}
            >
              <Avatar name={conversation.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-900">{conversation.name}</span>
                  {conversation.lastMessage && (
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatRelativeTime(conversation.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-500">
                    {conversation.lastMessage?.body ?? t(`conversations.channelType.${conversation.type}`)}
                  </span>
                  {conversation.unreadCount > 0 && (
                    <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {conversation.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
