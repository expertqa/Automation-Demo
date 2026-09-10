import type { ExecutionSample } from './flaky';
import { isFailureOutcome } from './status';

export interface HistoryStats<T extends ExecutionSample = ExecutionSample> {
  executions: number;
  passRate: number; // 0..1 over executed (non-skipped) samples
  avgDurationMs: number;
  p95DurationMs: number;
  failures: number;
  flakyExecutions: number;
  retries: number;
  lastFailure: T | null;
  lastSuccess: T | null;
  lastExecution: T | null;
  /** Newest → oldest for the ✓ ✕ ⚠ strip. */
  recent: T[];
}

export function computeHistoryStats<T extends ExecutionSample>(samples: T[], recentLimit = 12): HistoryStats<T> {
  const ordered = [...samples].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const executed = ordered.filter((s) => s.status !== 'skipped');
  const failures = executed.filter((s) => isFailureOutcome(s.status));
  const successes = executed.filter((s) => s.status === 'passed' || s.status === 'flaky');
  const durations = executed.map((s) => s.durationMs).sort((a, b) => a - b);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]! : 0;

  return {
    executions: executed.length,
    passRate: executed.length ? successes.length / executed.length : 0,
    avgDurationMs: Math.round(avg),
    p95DurationMs: p95,
    failures: failures.length,
    flakyExecutions: executed.filter((s) => s.status === 'flaky').length,
    retries: executed.reduce((acc, s) => acc + s.retries, 0),
    lastFailure: failures.length ? failures[failures.length - 1]! : null,
    lastSuccess: successes.length ? successes[successes.length - 1]! : null,
    lastExecution: ordered.length ? ordered[ordered.length - 1]! : null,
    recent: ordered.slice(-recentLimit).reverse(),
  };
}

export interface TrendPoint {
  runId: string;
  startedAt: string;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  total: number;
  durationMs: number;
  passRate: number;
}

export function movingAverage(values: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}
