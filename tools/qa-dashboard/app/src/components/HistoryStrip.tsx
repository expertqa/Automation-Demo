import { Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { statusLabel, statusVariant } from '@/components/StatusBadge';
import { cn, formatDateTime, formatDuration } from '@/lib/utils';
import type { ExecutionPoint } from '@shared/api';
import type { TestOutcome } from '@shared/types';

const glyph: Record<string, string> = { passed: '✓', failed: '✕', flaky: '⚠', skipped: '–' };

/**
 * ✓ ✓ ✕ ⚠ ✓ … strip. Accepts full execution points (with tooltip + link) or bare statuses.
 */
export function HistoryStrip({ items, size = 'sm', reverse = false }: { items: (ExecutionPoint | TestOutcome)[]; size?: 'sm' | 'md'; reverse?: boolean }) {
  const list = reverse ? [...items].reverse() : items;
  if (!list.length) return <span className="text-xs text-muted-foreground">no history</span>;
  return (
    <div className="flex items-center gap-0.5" aria-label="recent executions">
      {list.map((it, i) => {
        const status = typeof it === 'string' ? it : it.status;
        const v = statusVariant(status);
        const cls = cn(
          'inline-flex items-center justify-center rounded font-mono font-semibold',
          size === 'sm' ? 'h-4 w-4 text-[10px]' : 'h-5 w-5 text-[11px]',
          v === 'passed' && 'bg-status-passed/15 text-status-passed',
          v === 'failed' && 'bg-status-failed/15 text-status-failed',
          v === 'flaky' && 'bg-status-flaky/20 text-status-flaky',
          v === 'skipped' && 'bg-status-skipped/15 text-status-skipped',
        );
        const g = glyph[v] ?? '?';
        if (typeof it === 'string') {
          return (
            <span key={i} className={cls} title={statusLabel(status)}>
              {g}
            </span>
          );
        }
        return (
          <Tooltip key={it.runTestId}>
            <TooltipTrigger asChild>
              <Link to={`/executions/${it.runTestId}`} className={cls}>
                {g}
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              <div className="font-medium">{statusLabel(status)}</div>
              <div className="text-muted-foreground">
                {formatDateTime(it.startedAt)} · {formatDuration(it.durationMs)} · {it.branch ?? '—'} · {it.environment}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
