import { useState } from 'react';
import { ExternalLink, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, triggerCi, type TriggerCiInput } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * "Run" button that dispatches the Playwright GitHub Actions workflow
 * (workflow_dispatch) for either a single spec file, a --grep pattern
 * (e.g. one test's title), or the full suite (pass neither testFile nor grep).
 * The dispatch API gives back no run id, so on success we link to the
 * workflow's run list instead.
 */
export function RunCiButton({
  testFile,
  grep,
  label,
  buttonLabel = 'Run',
  size = 'sm',
  variant = 'outline',
}: TriggerCiInput & { buttonLabel?: string; size?: 'sm' | 'default'; variant?: 'outline' | 'default' | 'ghost' }) {
  const [state, setState] = useState<{ busy: boolean; ok?: boolean; message?: string; actionsUrl?: string }>({ busy: false });

  const run = async () => {
    setState({ busy: true });
    try {
      const res = await triggerCi({ testFile, grep, label });
      setState({ busy: false, ok: true, actionsUrl: res.actionsUrl, message: 'Triggered — check GitHub Actions for progress.' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err as Error).message;
      setState({ busy: false, ok: false, message });
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button size={size} variant={variant} onClick={run} disabled={state.busy} data-testid="run-ci-button" title={`Trigger CI: ${label}`}>
        {state.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        {state.busy ? 'Triggering…' : buttonLabel}
      </Button>
      {state.message && (
        <div className={cn('flex items-center gap-1 text-xs', state.ok ? 'text-status-passed' : 'text-status-failed')} data-testid="run-ci-status">
          {state.message}
          {state.ok && state.actionsUrl && (
            <a href={state.actionsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
              View runs <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
