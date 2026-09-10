import { AlertCircle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export function LoadingState({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <Inbox className="mb-3 h-7 w-7 text-muted-foreground" />
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="mt-1 max-w-md text-xs text-muted-foreground">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-status-failed/30 bg-status-failed/5 px-6 py-10 text-center">
      <AlertCircle className="mb-2 h-6 w-6 text-status-failed" />
      <div className="text-sm font-medium">Something went wrong</div>
      <div className="mt-1 font-mono text-xs text-muted-foreground">{message}</div>
      {retry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}
