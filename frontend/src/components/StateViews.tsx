import type { ReactNode } from 'react';

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-slate-500">
      <span>{label}</span>
      {action}
    </div>
  );
}

export function ErrorState({ label, onRetry, retryLabel }: { label: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-red-600">
      <span>{label}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
