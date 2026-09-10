import type { AppContext } from '../context';
import type { FilterOptions, HistoryResponse, OverviewResponse, SearchResult, TrendPoint } from '../../shared/api';
import { buildSourceUrl } from '../../shared/github';
import type { RunStatus, TestOutcome } from '../../shared/types';
import { listFlakyTests, type ExecutionScope } from './tests';
import { fromRawRun, latestRun, repoOverride, type RawRunRow } from './runs';
import { mapRun } from './mappers';

interface TrendRow {
  id: string;
  started_at: string;
  status: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  duration_ms: number;
  branch: string | null;
  environment: string;
}

function trendScope(scope: ExecutionScope, params: Record<string, unknown>): string {
  const where: string[] = [];
  if (scope.branch) {
    where.push('branch = @branch');
    params.branch = scope.branch;
  }
  if (scope.environment) {
    where.push('environment = @environment');
    params.environment = scope.environment;
  }
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

export function runTrends(ctx: AppContext, scope: ExecutionScope = {}, limit = 30): TrendPoint[] {
  const params: Record<string, unknown> = { limit };
  const rows = ctx.dbHandle.sqlite
    .prepare(
      `SELECT id, started_at, status, total, passed, failed, flaky, skipped, duration_ms, branch, environment
       FROM runs ${trendScope(scope, params)} ORDER BY started_at DESC LIMIT @limit`,
    )
    .all(params) as TrendRow[];
  return rows.reverse().map((r) => ({
    runId: r.id,
    startedAt: r.started_at,
    status: r.status as RunStatus,
    total: r.total,
    passed: r.passed,
    failed: r.failed,
    flaky: r.flaky,
    skipped: r.skipped,
    durationMs: r.duration_ms,
    passRate: r.total - r.skipped ? (r.passed + r.flaky) / (r.total - r.skipped) : 0,
    branch: r.branch,
    environment: r.environment,
  }));
}

export function getOverview(ctx: AppContext, scope: ExecutionScope = {}): OverviewResponse {
  const sqlite = ctx.dbHandle.sqlite;
  const totals = sqlite
    .prepare(
      `SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM tests) AS tests, (SELECT COUNT(*) FROM suites) AS suites,
              (SELECT COUNT(*) FROM artifacts) AS artifacts, (SELECT COALESCE(SUM(size_bytes),0) FROM artifacts) AS artifact_bytes,
              (SELECT COUNT(*) FROM runs WHERE source = 'demo') AS demo_runs`,
    )
    .get() as { runs: number; tests: number; suites: number; artifacts: number; artifact_bytes: number; demo_runs: number };

  const trends = runTrends(ctx, scope, 30);
  const windowRuns = trends;
  const executed = windowRuns.reduce((a, r) => a + (r.total - r.skipped), 0);
  const good = windowRuns.reduce((a, r) => a + r.passed + r.flaky, 0);
  const failed = windowRuns.reduce((a, r) => a + r.failed, 0);
  const avgRun = windowRuns.length ? windowRuns.reduce((a, r) => a + r.durationMs, 0) / windowRuns.length : 0;
  const ids = windowRuns.map((r) => r.runId);
  const avgTest = ids.length
    ? ((sqlite
        .prepare(`SELECT AVG(duration_ms) AS avg FROM run_tests WHERE status != 'skipped' AND run_id IN (${ids.map(() => '?').join(',')})`)
        .get(...ids) as { avg: number | null }).avg ?? 0)
    : 0;

  const params: Record<string, unknown> = { limit: 8 };
  const recent = sqlite
    .prepare(`SELECT * FROM runs ${trendScope(scope, params)} ORDER BY started_at DESC LIMIT @limit`)
    .all(params) as RawRunRow[];
  const override = repoOverride(ctx);

  return {
    latest: latestRun(ctx),
    totals: { runs: totals.runs, tests: totals.tests, suites: totals.suites, artifacts: totals.artifacts, artifactBytes: totals.artifact_bytes },
    window: {
      runs: windowRuns.length,
      passRate: executed ? good / executed : 0,
      failureRate: executed ? failed / executed : 0,
      flakyTests: listFlakyTests(ctx, scope).length,
      avgTestDurationMs: Math.round(avgTest),
      avgRunDurationMs: Math.round(avgRun),
    },
    recentRuns: recent.map((r) => mapRun(fromRawRun(r), override)),
    trends,
    hasDemoData: totals.demo_runs > 0,
  };
}

export function getHistory(ctx: AppContext, scope: ExecutionScope & { days?: number; runs?: number } = {}): HistoryResponse {
  const days = Math.min(365, Math.max(1, scope.days ?? 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const params: Record<string, unknown> = { since };
  const scopeSql = trendScope(scope, params);
  const dailyRows = ctx.dbHandle.sqlite
    .prepare(
      `SELECT substr(started_at, 1, 10) AS day, COUNT(*) AS runs, SUM(passed) AS passed, SUM(failed) AS failed, SUM(flaky) AS flaky,
              SUM(skipped) AS skipped, SUM(total) AS total, AVG(duration_ms) AS avg_duration
       FROM runs ${scopeSql ? `${scopeSql} AND` : 'WHERE'} started_at >= @since GROUP BY day ORDER BY day`,
    )
    .all(params) as { day: string; runs: number; passed: number; failed: number; flaky: number; skipped: number; total: number; avg_duration: number }[];

  const topFailing = ctx.dbHandle.sqlite
    .prepare(
      `SELECT t.id AS test_id, t.title, s.name AS suite, rt.file, rt.line, r.repository_url, r.commit_sha,
              SUM(CASE WHEN rt.status IN ('failed','timedOut','interrupted') THEN 1 ELSE 0 END) AS failures,
              SUM(CASE WHEN rt.status != 'skipped' THEN 1 ELSE 0 END) AS executions
       FROM run_tests rt JOIN tests t ON t.id = rt.test_id JOIN suites s ON s.id = rt.suite_id JOIN runs r ON r.id = rt.run_id
       WHERE rt.started_at >= @since ${scope.branch ? 'AND r.branch = @branch' : ''} ${scope.environment ? 'AND r.environment = @environment' : ''}
       GROUP BY t.id HAVING failures > 0 ORDER BY failures DESC, executions ASC LIMIT 10`,
    )
    .all(params) as { test_id: string; title: string; suite: string; file: string; line: number; repository_url: string | null; commit_sha: string | null; failures: number; executions: number }[];

  const slowest = ctx.dbHandle.sqlite
    .prepare(
      `SELECT t.id AS test_id, t.title, s.name AS suite, AVG(rt.duration_ms) AS avg_duration, COUNT(*) AS executions
       FROM run_tests rt JOIN tests t ON t.id = rt.test_id JOIN suites s ON s.id = rt.suite_id JOIN runs r ON r.id = rt.run_id
       WHERE rt.started_at >= @since AND rt.status != 'skipped' ${scope.branch ? 'AND r.branch = @branch' : ''} ${scope.environment ? 'AND r.environment = @environment' : ''}
       GROUP BY t.id ORDER BY avg_duration DESC LIMIT 10`,
    )
    .all(params) as { test_id: string; title: string; suite: string; avg_duration: number; executions: number }[];

  const override = repoOverride(ctx);
  return {
    trends: runTrends(ctx, scope, Math.min(200, Math.max(10, scope.runs ?? 60))),
    daily: dailyRows.map((d) => ({
      day: d.day,
      runs: d.runs,
      passed: d.passed,
      failed: d.failed,
      flaky: d.flaky,
      skipped: d.skipped,
      passRate: d.total - d.skipped ? (d.passed + d.flaky) / (d.total - d.skipped) : 0,
      avgDurationMs: Math.round(d.avg_duration),
    })),
    topFailing: topFailing.map((t) => ({
      testId: t.test_id,
      title: t.title,
      suite: t.suite,
      failures: t.failures,
      executions: t.executions,
      sourceUrl: buildSourceUrl({ repositoryUrl: override ?? t.repository_url, commitSha: t.commit_sha, file: t.file, line: t.line }),
    })),
    slowest: slowest.map((t) => ({ testId: t.test_id, title: t.title, suite: t.suite, avgDurationMs: Math.round(t.avg_duration), executions: t.executions })),
  };
}

export function getFilterOptions(ctx: AppContext): FilterOptions {
  const sqlite = ctx.dbHandle.sqlite;
  const col = (sql: string) => (sqlite.prepare(sql).all() as { v: string | null }[]).map((r) => r.v).filter((v): v is string => !!v);
  const split = (values: string[]) => Array.from(new Set(values.flatMap((v) => v.split(',')).filter(Boolean))).sort();
  return {
    branches: col('SELECT DISTINCT branch AS v FROM runs ORDER BY branch'),
    environments: col('SELECT DISTINCT environment AS v FROM runs ORDER BY environment'),
    projects: split(col('SELECT DISTINCT project_names AS v FROM runs')),
    browsers: split(col('SELECT DISTINCT browser_names AS v FROM runs')),
    suites: (sqlite.prepare('SELECT id AS suiteId, name FROM suites ORDER BY name').all() as { suiteId: string; name: string }[]),
    statuses: ['passed', 'failed', 'flaky', 'skipped', 'timedOut', 'interrupted'] satisfies TestOutcome[],
    runStatuses: ['passed', 'failed', 'timedout', 'interrupted'] satisfies RunStatus[],
  };
}

export function globalSearch(ctx: AppContext, q: string, limit = 20): SearchResult[] {
  const term = `%${q.trim()}%`;
  if (!q.trim()) return [];
  const sqlite = ctx.dbHandle.sqlite;
  const out: SearchResult[] = [];
  const runs = sqlite
    .prepare('SELECT id, branch, environment, status, started_at, commit_sha FROM runs WHERE id LIKE ? OR commit_sha LIKE ? OR commit_message LIKE ? ORDER BY started_at DESC LIMIT 5')
    .all(term, term, term) as { id: string; branch: string | null; environment: string; status: string; started_at: string; commit_sha: string | null }[];
  for (const r of runs) out.push({ kind: 'run', id: r.id, title: r.id, subtitle: `${r.status} · ${r.branch ?? '—'} · ${r.environment}`, href: `/runs/${r.id}` });
  const tests = sqlite
    .prepare('SELECT t.id, t.title, t.file, s.name AS suite FROM tests t JOIN suites s ON s.id = t.suite_id WHERE t.title LIKE ? OR t.full_title LIKE ? OR t.file LIKE ? LIMIT ?')
    .all(term, term, term, limit) as { id: string; title: string; file: string; suite: string }[];
  for (const t of tests) out.push({ kind: 'test', id: t.id, title: t.title, subtitle: `${t.suite} · ${t.file}`, href: `/tests/${t.id}` });
  const suites = sqlite.prepare('SELECT id, name FROM suites WHERE name LIKE ? LIMIT 5').all(term) as { id: string; name: string }[];
  for (const s of suites) out.push({ kind: 'suite', id: s.id, title: s.name, subtitle: 'suite', href: `/suites/${s.id}` });
  return out.slice(0, limit);
}
