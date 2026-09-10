import { describe, expect, it } from 'vitest';
import { countOutcomes, passRate, resolveRunStatus, resolveTestOutcome } from '../../shared/status';
import { evaluateFlakiness, type ExecutionSample } from '../../shared/flaky';
import { computeHistoryStats } from '../../shared/history';
import { DEFAULT_FLAKY_CONFIG } from '../../shared/types';

const sample = (i: number, status: ExecutionSample['status'], retries = 0, durationMs = 1000): ExecutionSample => ({
  runId: `run_${i}`,
  startedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  status,
  retries,
  durationMs,
});

describe('resolveTestOutcome', () => {
  it('maps playwright outcomes', () => {
    expect(resolveTestOutcome('expected', [{ status: 'passed' }], 'passed')).toBe('passed');
    expect(resolveTestOutcome('flaky', [{ status: 'failed' }, { status: 'passed' }], 'passed')).toBe('flaky');
    expect(resolveTestOutcome('skipped', [{ status: 'skipped' }], 'skipped')).toBe('skipped');
    expect(resolveTestOutcome('unexpected', [{ status: 'failed' }], 'passed')).toBe('failed');
    expect(resolveTestOutcome('unexpected', [{ status: 'failed' }, { status: 'timedOut' }], 'passed')).toBe('timedOut');
    expect(resolveTestOutcome('unexpected', [{ status: 'interrupted' }], 'passed')).toBe('interrupted');
  });
  it('counts and run status', () => {
    const counts = countOutcomes([
      { status: 'passed', retries: 0 },
      { status: 'failed', retries: 2 },
      { status: 'timedOut', retries: 1 },
      { status: 'flaky', retries: 1 },
      { status: 'skipped', retries: 0 },
    ]);
    expect(counts).toEqual({ total: 5, passed: 1, failed: 2, flaky: 1, skipped: 1, timedOut: 1, interrupted: 0, retries: 4 });
    expect(resolveRunStatus('failed', counts)).toBe('failed');
    expect(resolveRunStatus('passed', { ...counts, failed: 0 })).toBe('passed');
    expect(resolveRunStatus('interrupted', counts)).toBe('interrupted');
    expect(passRate(counts)).toBeCloseTo(2 / 4);
  });
});

describe('evaluateFlakiness', () => {
  it('flags retry-passes', () => {
    const v = evaluateFlakiness([sample(1, 'passed'), sample(2, 'flaky', 1), sample(3, 'passed')], DEFAULT_FLAKY_CONFIG);
    expect(v.flaky).toBe(true);
    expect(v.reasons[0]).toMatch(/passed only after a retry/);
    expect(v.retries).toBe(1);
  });
  it('flags unstable failure rates', () => {
    const samples = [sample(1, 'passed'), sample(2, 'failed'), sample(3, 'passed'), sample(4, 'passed'), sample(5, 'passed')];
    const v = evaluateFlakiness(samples, DEFAULT_FLAKY_CONFIG);
    expect(v.failureRate).toBeCloseTo(0.2);
    expect(v.flaky).toBe(true);
    expect(v.reasons.join()).toMatch(/failure rate 20%/);
  });
  it('does not flag consistently failing or consistently passing tests', () => {
    expect(evaluateFlakiness([sample(1, 'failed'), sample(2, 'failed'), sample(3, 'failed')], DEFAULT_FLAKY_CONFIG).flaky).toBe(false);
    expect(evaluateFlakiness([sample(1, 'passed'), sample(2, 'passed'), sample(3, 'passed')], DEFAULT_FLAKY_CONFIG).flaky).toBe(false);
  });
  it('flags alternating results and respects the window and thresholds', () => {
    const alternating = Array.from({ length: 8 }, (_, i) => sample(i, i % 2 ? 'failed' : 'passed'));
    const v = evaluateFlakiness(alternating, DEFAULT_FLAKY_CONFIG);
    expect(v.transitions).toBe(7);
    expect(v.reasons.some((r) => r.includes('transitions'))).toBe(true);
    // Window of 2 → only last two samples considered, below minExecutions → not flaky by rate rule.
    const strict = evaluateFlakiness(alternating, { ...DEFAULT_FLAKY_CONFIG, windowRuns: 2, minExecutions: 3 });
    expect(strict.executions).toBe(2);
    expect(strict.flaky).toBe(false);
  });
  it('ignores skipped executions and can disable the retry rule', () => {
    const v = evaluateFlakiness([sample(1, 'skipped'), sample(2, 'flaky', 1)], { ...DEFAULT_FLAKY_CONFIG, countRetryPass: false });
    expect(v.executions).toBe(1);
    expect(v.flaky).toBe(false);
  });
});

describe('computeHistoryStats', () => {
  it('computes pass rate, durations and last events', () => {
    const s = computeHistoryStats([sample(1, 'passed', 0, 100), sample(2, 'failed', 2, 300), sample(3, 'flaky', 1, 200), sample(4, 'skipped', 0, 0)]);
    expect(s.executions).toBe(3);
    expect(s.passRate).toBeCloseTo(2 / 3);
    expect(s.avgDurationMs).toBe(200);
    expect(s.failures).toBe(1);
    expect(s.flakyExecutions).toBe(1);
    expect(s.retries).toBe(3);
    expect(s.lastFailure?.runId).toBe('run_2');
    expect(s.lastSuccess?.runId).toBe('run_3');
    expect(s.lastExecution?.runId).toBe('run_4');
    expect(s.recent.map((r) => r.runId)).toEqual(['run_4', 'run_3', 'run_2', 'run_1']);
  });
  it('handles empty input', () => {
    const s = computeHistoryStats([]);
    expect(s.executions).toBe(0);
    expect(s.passRate).toBe(0);
    expect(s.lastExecution).toBeNull();
  });
});
