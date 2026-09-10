import type { AttemptStatus, RunCounts, RunStatus, TestOutcome } from './types';

/**
 * Translate Playwright's outcome() + attempt statuses into the dashboard outcome.
 */
export function resolveTestOutcome(
  outcome: 'skipped' | 'expected' | 'unexpected' | 'flaky',
  attempts: { status: AttemptStatus }[],
  expectedStatus: AttemptStatus,
): TestOutcome {
  const last = attempts[attempts.length - 1]?.status;
  switch (outcome) {
    case 'skipped':
      return 'skipped';
    case 'flaky':
      return 'flaky';
    case 'expected':
      // A test whose expected status is skipped/failed (test.fail) is still "as expected".
      return expectedStatus === 'skipped' || last === 'skipped' ? 'skipped' : 'passed';
    case 'unexpected':
      if (last === 'timedOut') return 'timedOut';
      if (last === 'interrupted') return 'interrupted';
      return 'failed';
  }
}

export function isFailureOutcome(status: TestOutcome): boolean {
  return status === 'failed' || status === 'timedOut' || status === 'interrupted';
}

export function emptyCounts(): RunCounts {
  return { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, timedOut: 0, interrupted: 0, retries: 0 };
}

export function countOutcomes(tests: { status: TestOutcome; retries: number }[]): RunCounts {
  const c = emptyCounts();
  for (const t of tests) {
    c.total++;
    c.retries += t.retries;
    switch (t.status) {
      case 'passed':
        c.passed++;
        break;
      case 'flaky':
        c.flaky++;
        break;
      case 'skipped':
        c.skipped++;
        break;
      case 'failed':
        c.failed++;
        break;
      case 'timedOut':
        c.failed++;
        c.timedOut++;
        break;
      case 'interrupted':
        c.failed++;
        c.interrupted++;
        break;
    }
  }
  return c;
}

export function resolveRunStatus(playwrightStatus: string | undefined, counts: RunCounts): RunStatus {
  if (playwrightStatus === 'interrupted') return 'interrupted';
  if (playwrightStatus === 'timedout') return 'timedout';
  return counts.failed > 0 ? 'failed' : 'passed';
}

export function passRate(counts: Pick<RunCounts, 'total' | 'passed' | 'flaky' | 'skipped'>): number {
  const executed = counts.total - counts.skipped;
  if (executed <= 0) return 0;
  return (counts.passed + counts.flaky) / executed;
}
