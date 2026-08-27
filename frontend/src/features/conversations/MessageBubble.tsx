import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/Avatar';
import type { OutgoingMessage } from '../../lib/types';
import { useDeleteMessage, useEditMessage } from './api';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  message: OutgoingMessage;
  senderName: string;
  isOwn: boolean;
  channelId: string;
  onRetry?: (message: OutgoingMessage) => void;
}

export function MessageBubble({ message, senderName, isOwn, channelId, onRetry }: Props) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const editMessage = useEditMessage(channelId);
  const deleteMessage = useDeleteMessage(channelId);

  const isDeleted = message.deletedAt !== null;

  function handleSaveEdit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.body) {
      setIsEditing(false);
      return;
    }
    editMessage.mutate(
      { messageId: message.id, body: trimmed },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  function handleDelete() {
    if (window.confirm(t('messages.confirmDelete'))) {
      deleteMessage.mutate(message.id);
    }
  }

  return (
    <div className={`flex gap-2 px-4 py-1.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <Avatar name={senderName} size="sm" />
      <div className={`flex max-w-[75%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className="flex items-baseline gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{isOwn ? t('messages.you') : senderName}</span>
          <span>{formatTime(message.createdAt)}</span>
          {message.editedAt && !isDeleted && <span className="italic">({t('messages.edited')})</span>}
        </div>

        {isEditing ? (
          <div className="mt-1 w-full">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
            />
            <div className="mt-1 flex gap-2 text-xs">
              <button type="button" onClick={handleSaveEdit} className="text-slate-900 hover:underline">
                {t('messages.saveEdit')}
              </button>
              <button type="button" onClick={() => setIsEditing(false)} className="text-slate-500 hover:underline">
                {t('messages.cancelEdit')}
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`mt-0.5 rounded-2xl px-3 py-1.5 text-sm ${
              isDeleted
                ? 'italic text-slate-400'
                : isOwn
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-800 shadow-sm'
            } ${message.status === 'failed' ? 'border border-red-400' : ''}`}
          >
            {isDeleted ? t('messages.deletedPlaceholder') : message.body}
          </div>
        )}

        {isOwn && !isDeleted && !isEditing && (
          <div className="mt-0.5 flex gap-2 text-xs text-slate-400">
            {message.status === 'pending' && <span>{t('messages.pending')}</span>}
            {message.status === 'failed' && (
              <>
                <span className="text-red-500">{t('messages.failed')}</span>
                <button type="button" onClick={() => onRetry?.(message)} className="underline">
                  {t('messages.retry')}
                </button>
              </>
            )}
            {message.status === 'sent' && !message.id.startsWith('local-') && (
              <>
                <button type="button" onClick={() => setIsEditing(true)} className="hover:underline">
                  {t('messages.edit')}
                </button>
                <button type="button" onClick={handleDelete} className="hover:underline">
                  {t('messages.delete')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
