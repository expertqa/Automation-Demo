import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'passed' | 'failed' | 'flaky' | 'skipped';
  icon?: ReactNode;
  className?: string;
}) {
  const toneCls =
    tone === 'passed' ? 'text-status-passed' : tone === 'failed' ? 'text-status-failed' : tone === 'flaky' ? 'text-status-flaky' : tone === 'skipped' ? 'text-status-skipped' : '';
  return (
    <div className={cn('rounded-lg border border-border bg-card px-4 py-3', className)}>
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className={cn('mt-1 text-2xl font-semibold tabular tracking-tight', toneCls)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
