import type { FlakyConfig, TestOutcome } from './types';
import { isFailureOutcome } from './status';

export interface ExecutionSample {
  runId: string;
  startedAt: string;
  status: TestOutcome;
  retries: number;
  durationMs: number;
}

export interface FlakyVerdict {
  flaky: boolean;
  reasons: string[];
  executions: number;
  passes: number;
  failures: number;
  flakyExecutions: number;
  failureRate: number;
  passRate: number;
  transitions: number;
  retries: number;
}

/**
 * Explainable flaky detection over the most recent executions of one test.
 *
 * Samples must be ordered oldest → newest. Skipped executions are ignored.
 */
export function evaluateFlakiness(samples: ExecutionSample[], config: FlakyConfig): FlakyVerdict {
  const window = samples.filter((s) => s.status !== 'skipped').slice(-config.windowRuns);
  const executions = window.length;
  const flakyExecutions = window.filter((s) => s.status === 'flaky').length;
  const failures = window.filter((s) => isFailureOutcome(s.status)).length;
  const passes = window.filter((s) => s.status === 'passed' || s.status === 'flaky').length;
  const retries = window.reduce((acc, s) => acc + s.retries, 0);

  let transitions = 0;
  for (let i = 1; i < window.length; i++) {
    const prev = isFailureOutcome(window[i - 1]!.status);
    const curr = isFailureOutcome(window[i]!.status);
    if (prev !== curr) transitions++;
  }

  const failureRate = executions ? failures / executions : 0;
  const passRate = executions ? passes / executions : 0;
  const reasons: string[] = [];

  if (config.countRetryPass && flakyExecutions > 0) {
    reasons.push(`${flakyExecutions} execution${flakyExecutions === 1 ? '' : 's'} passed only after a retry`);
  }
  if (executions >= config.minExecutions) {
    if (failures > 0 && passes > 0 && failureRate > config.failureRateMin && failureRate < config.failureRateMax) {
      reasons.push(
        `failure rate ${(failureRate * 100).toFixed(0)}% is between ${(config.failureRateMin * 100).toFixed(0)}% and ${(config.failureRateMax * 100).toFixed(0)}%`,
      );
    }
    if (transitions >= config.minTransitions) {
      reasons.push(`${transitions} pass/fail transitions in the last ${executions} executions`);
    }
  }

  return {
    flaky: reasons.length > 0,
    reasons,
    executions,
    passes,
    failures,
    flakyExecutions,
    failureRate,
    passRate,
    transitions,
    retries,
  };
}
