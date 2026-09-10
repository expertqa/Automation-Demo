import type { AppContext } from '../context';
import type { SuiteDetail, SuiteListItem, TestListItem } from '../../shared/api';
import { buildTestListItem, recentExecutionsByTest, type ExecutionScope } from './tests';
import { repoOverride } from './runs';

interface SuiteRow {
  id: string;
  name: string;
  tests: number;
  files: number;
}

interface RunSuiteRow {
  run_id: string;
  suite_id: string;
  started_at: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  duration_ms: number;
}

const RELIABILITY_RUNS = 20;

export function listSuites(ctx: AppContext, scope: ExecutionScope = {}): SuiteListItem[] {
  const suites = ctx.dbHandle.sqlite
    .prepare(
      `SELECT s.id, s.name, COUNT(t.id) AS tests, COUNT(DISTINCT t.file) AS files
       FROM suites s LEFT JOIN tests t ON t.suite_id = s.id GROUP BY s.id ORDER BY s.name`,
    )
    .all() as SuiteRow[];

  const params: Record<string, unknown> = { limit: RELIABILITY_RUNS };
  const where: string[] = [];
  if (scope.branch) {
    where.push('r.branch = @branch');
    params.branch = scope.branch;
  }
  if (scope.environment) {
    where.push('r.environment = @environment');
    params.environment = scope.environment;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const runSuites = ctx.dbHandle.sqlite
    .prepare(
      `WITH ranked AS (
         SELECT rs.*, r.started_at, ROW_NUMBER() OVER (PARTITION BY rs.suite_id ORDER BY r.started_at DESC) AS rn
         FROM run_suites rs JOIN runs r ON r.id = rs.run_id ${whereSql}
       ) SELECT * FROM ranked WHERE rn <= @limit ORDER BY suite_id, started_at ASC`,
    )
    .all(params) as RunSuiteRow[];

  const flakyBySuite = countFlakyBySuite(ctx, scope);

  return suites.map((s) => {
    const rows = runSuites.filter((r) => r.suite_id === s.id);
    const latest = rows[rows.length - 1] ?? null;
    const executed = rows.reduce((acc, r) => acc + (r.total - r.skipped), 0);
    const good = rows.reduce((acc, r) => acc + r.passed + r.flaky, 0);
    const totalDuration = rows.reduce((acc, r) => acc + r.duration_ms, 0);
    const totalTests = rows.reduce((acc, r) => acc + r.total, 0);
    return {
      suiteId: s.id,
      name: s.name,
      tests: s.tests,
      files: s.files,
      latest: latest
        ? {
            runId: latest.run_id,
            total: latest.total,
            passed: latest.passed,
            failed: latest.failed,
            flaky: latest.flaky,
            skipped: latest.skipped,
            durationMs: latest.duration_ms,
            startedAt: latest.started_at,
          }
        : null,
      passRate: executed ? good / executed : 0,
      avgDurationMs: totalTests ? totalDuration / totalTests : 0,
      reliability: rows.map((r) => ({
        runId: r.run_id,
        startedAt: r.started_at,
        passRate: r.total - r.skipped ? (r.passed + r.flaky) / (r.total - r.skipped) : 0,
      })),
      flakyTests: flakyBySuite.get(s.id) ?? 0,
    };
  });
}

function countFlakyBySuite(ctx: AppContext, scope: ExecutionScope): Map<string, number> {
  const window = ctx.settings.get().flaky.windowRuns;
  const recent = recentExecutionsByTest(ctx, scope, window);
  const suiteOf = new Map(
    (ctx.dbHandle.sqlite.prepare('SELECT id, suite_id FROM tests').all() as { id: string; suite_id: string }[]).map((t) => [t.id, t.suite_id]),
  );
  const out = new Map<string, number>();
  const override = repoOverride(ctx);
  for (const [testId, rows] of recent) {
    const item = buildTestListItem(
      ctx,
      { id: testId, title: '', full_title: '', title_path_json: '[]', suite_id: suiteOf.get(testId) ?? '', suite: '', file: '', line: 0, column: null, first_seen_at: '', last_seen_at: '' },
      rows,
      override,
    );
    if (item.isFlaky) out.set(item.suiteId, (out.get(item.suiteId) ?? 0) + 1);
  }
  return out;
}

export function getSuiteDetail(ctx: AppContext, suiteId: string, scope: ExecutionScope = {}): SuiteDetail | null {
  const suite = listSuites(ctx, scope).find((s) => s.suiteId === suiteId);
  if (!suite) return null;
  const metas = ctx.dbHandle.sqlite
    .prepare(
      `SELECT t.id, t.title, t.full_title, t.title_path_json, t.suite_id, s.name AS suite, t.file, t.line, t.column, t.first_seen_at, t.last_seen_at
       FROM tests t JOIN suites s ON s.id = t.suite_id WHERE t.suite_id = ? ORDER BY t.file, t.line`,
    )
    .all(suiteId) as Parameters<typeof buildTestListItem>[1][];
  const recent = recentExecutionsByTest(ctx, scope, ctx.settings.get().flaky.windowRuns);
  const override = repoOverride(ctx);
  const files = new Map<string, TestListItem[]>();
  for (const m of metas) {
    const item = buildTestListItem(ctx, m, recent.get(m.id) ?? [], override);
    const list = files.get(m.file) ?? [];
    list.push(item);
    files.set(m.file, list);
  }
  return { suite, files: Array.from(files, ([file, tests]) => ({ file, tests })) };
}
