import { AlertTriangle, Check, CircleSlash, Clock, MinusCircle, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RunStatus, TestOutcome, AttemptStatus } from '@shared/types';

type AnyStatus = TestOutcome | RunStatus | AttemptStatus | string | null | undefined;

export function statusVariant(status: AnyStatus): 'passed' | 'failed' | 'flaky' | 'skipped' | 'default' {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'failed':
    case 'timedOut':
    case 'timedout':
    case 'interrupted':
      return 'failed';
    case 'flaky':
      return 'flaky';
    case 'skipped':
      return 'skipped';
    default:
      return 'default';
  }
}

export function statusLabel(status: AnyStatus): string {
  switch (status) {
    case 'timedOut':
    case 'timedout':
      return 'Timed out';
    case 'interrupted':
      return 'Interrupted';
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'flaky':
      return 'Flaky';
    case 'skipped':
      return 'Skipped';
    case 'running':
      return 'Running';
    default:
      return status ? String(status) : '—';
  }
}

export function StatusIcon({ status, className = 'h-3.5 w-3.5' }: { status: AnyStatus; className?: string }) {
  switch (statusVariant(status)) {
    case 'passed':
      return <Check className={className} />;
    case 'failed':
      return status === 'timedOut' || status === 'timedout' ? <Clock className={className} /> : <X className={className} />;
    case 'flaky':
      return <AlertTriangle className={className} />;
    case 'skipped':
      return <MinusCircle className={className} />;
    default:
      return <CircleSlash className={className} />;
  }
}

export function StatusBadge({ status, className, upper }: { status: AnyStatus; className?: string; upper?: boolean }) {
  return (
    <Badge variant={statusVariant(status)} className={className}>
      <StatusIcon status={status} className="h-3 w-3" />
      {upper ? statusLabel(status).toUpperCase() : statusLabel(status)}
    </Badge>
  );
}

export function StatusDot({ status, className = '' }: { status: AnyStatus; className?: string }) {
  const v = statusVariant(status);
  const color = v === 'passed' ? 'bg-status-passed' : v === 'failed' ? 'bg-status-failed' : v === 'flaky' ? 'bg-status-flaky' : 'bg-status-skipped';
  return <span className={`inline-block h-2 w-2 rounded-full ${color} ${className}`} />;
}
