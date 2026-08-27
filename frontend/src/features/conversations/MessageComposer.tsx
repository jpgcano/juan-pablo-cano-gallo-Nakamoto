import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  onSend: (body: string) => void;
  disabled?: boolean;
}

export function MessageComposer({ onSend, disabled }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={t('messages.placeholder')}
        disabled={disabled}
        className="max-h-32 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-50"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || value.trim().length === 0}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
      >
        {t('messages.send')}
      </button>
    </div>
  );
}
