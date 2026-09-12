import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, syncCi } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * A background poller already pulls finished GitHub Actions runs into the
 * dashboard every ~20s (see server/index.ts), so results normally just show
 * up. This button forces an immediate check instead of waiting for the next
 * tick — handy right after clicking "Run"/"Run headed".
 */
export function SyncCiButton() {
  const qc = useQueryClient();
  const [state, setState] = useState<{ busy: boolean; ok?: boolean; message?: string }>({ busy: false });

  const run = async () => {
    setState({ busy: true });
    try {
      const res = await syncCi();
      const n = res.imported.length;
      await qc.invalidateQueries();
      setState({
        busy: false,
        ok: true,
        message: n > 0 ? `Imported ${n} new run${n === 1 ? '' : 's'}.` : 'Up to date — nothing new yet.',
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err as Error).message;
      setState({ busy: false, ok: false, message });
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button size="sm" variant="ghost" onClick={run} disabled={state.busy} data-testid="sync-ci-button" title="Check GitHub Actions for finished runs now">
        {state.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {state.busy ? 'Checking…' : 'Sync CI results'}
      </Button>
      {state.message && (
        <div className={cn('text-xs', state.ok ? 'text-status-passed' : 'text-status-failed')} data-testid="sync-ci-status">
          {state.message}
        </div>
      )}
    </div>
  );
}
