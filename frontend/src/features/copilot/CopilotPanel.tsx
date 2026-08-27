import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/StateViews';
import type { AskCopilotResponse } from '../../lib/types';
import { useAskCopilot, useCopilotUsage } from './api';

interface Exchange {
  id: string;
  question: string;
  response: AskCopilotResponse | null;
}

interface Props {
  onGoToMessage: (channelId: string) => void;
}

export function CopilotPanel({ onGoToMessage }: Props) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const ask = useAskCopilot();
  const usage = useCopilotUsage();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;

    const id = crypto.randomUUID();
    setExchanges((prev) => [...prev, { id, question: trimmed, response: null }]);
    setQuestion('');

    ask.mutate(trimmed, {
      onSuccess: (response) => {
        setExchanges((prev) => prev.map((ex) => (ex.id === id ? { ...ex, response } : ex)));
      },
    });
  }

  const totalCost = (usage.data ?? []).reduce((sum, row) => sum + row.costUsdTotal, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="font-medium text-slate-900">{t('copilot.title')}</h2>
        <p className="text-xs text-slate-500">{t('copilot.subtitle')}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {exchanges.length === 0 ? (
          <EmptyState label={t('copilot.empty')} />
        ) : (
          <div className="space-y-4">
            {exchanges.map((exchange) => (
              <div key={exchange.id} className="space-y-1.5">
                <p className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">{exchange.question}</p>

                {!exchange.response ? (
                  <p className="text-sm italic text-slate-400">{t('copilot.thinking')}</p>
                ) : (
                  <CopilotAnswer response={exchange.response} onGoToMessage={onGoToMessage} />
                )}
              </div>
            ))}
          </div>
        )}

        {usage.data && usage.data.length > 0 && (
          <div className="mt-6 rounded-md border border-slate-200 p-3 text-xs text-slate-500">
            <p className="font-medium text-slate-600">{t('copilot.usageTitle')}</p>
            <p>{usage.data.reduce((sum, row) => sum + row.totalQueries, 0)} consultas · ${totalCost.toFixed(4)}</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={1}
          placeholder={t('copilot.placeholder')}
          className="max-h-32 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={ask.isPending || question.trim().length === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {t('copilot.ask')}
        </button>
      </form>
    </div>
  );
}

function CopilotAnswer({ response, onGoToMessage }: { response: AskCopilotResponse; onGoToMessage: (channelId: string) => void }) {
  const { t } = useTranslation();

  if (response.outcome === 'no_context') {
    return <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800">{t('copilot.noContext')}</p>;
  }
  if (response.outcome === 'out_of_scope') {
    return <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800">{t('copilot.outOfScope')}</p>;
  }

  return (
    <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
      <p>{response.answer}</p>
      {response.citations.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <p className="text-xs font-medium text-slate-400">{t('copilot.citationsTitle')}</p>
          <ul className="mt-1 space-y-1">
            {response.citations.map((citation) => (
              <li key={citation.messageId}>
                <button
                  type="button"
                  onClick={() => onGoToMessage(citation.channelId)}
                  className="text-xs text-slate-500 underline hover:text-slate-800"
                >
                  [msg:{citation.rank}] {t('copilot.goToMessage')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
