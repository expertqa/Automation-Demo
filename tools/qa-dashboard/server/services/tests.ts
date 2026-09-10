import type { AppContext } from '../context';
import type {
  ArtifactSummary,
  AttemptDetail,
  ErrorDetail,
  ExecutionPoint,
  FlakyItem,
  Paginated,
  RunTestDetail,
  TestDetailResponse,
  TestFilters,
  TestHistory,
  TestListItem,
} from '../../shared/api';
import { buildCommitUrl, buildSourceUrl } from '../../shared/github';
import { evaluateFlakiness, type ExecutionSample } from '../../shared/flaky';
import { computeHistoryStats } from '../../shared/history';
import { isFailureOutcome } from '../../shared/status';
import type { AttemptStatus, TestOutcome } from '../../shared/types';
import { mapArtifact } from './mappers';
import { fromRawRunTestJoin, getRun, pageParams, repoOverride, type RawRunTestJoin } from './runs';
import { mapRunTest } from './mappers';
import type { ArtifactRow } from '../../database/schema';

// ---------------------------------------------------------------------------
// Execution samples (the basis of history + flaky detection)
// ---------------------------------------------------------------------------

export interface ExecutionRow {
  run_test_id: number;
  run_id: string;
  test_id: string;
  started_at: string;
  status: string;
  retries: number;
  duration_ms: number;
  branch: string | null;
  environment: string;
  project: string;
  commit_sha: string | null;
  repository_url: string | null;
  file: string;
  line: number;
  error_summary: string | null;
}

export function toPoint(r: ExecutionRow): ExecutionPoint {
  return {
    runTestId: r.run_test_id,
    runId: r.run_id,
    startedAt: r.started_at,
    status: r.status as TestOutcome,
    retries: r.retries,
    durationMs: r.duration_ms,
    branch: r.branch,
    environment: r.environment,
    project: r.project,
    commitSha: r.commit_sha,
  };
}

function toSample(r: ExecutionRow): ExecutionSample {
  return { runId: r.run_id, startedAt: r.started_at, status: r.status as TestOutcome, retries: r.retries, durationMs: r.duration_ms };
}

const EXECUTION_SELECT = `
  SELECT rt.id AS run_test_id, rt.run_id, rt.test_id, rt.started_at, rt.status, rt.retries, rt.duration_ms,
         r.branch, r.environment, rt.project, r.commit_sha, r.repository_url, rt.file, rt.line, rt.error_summary
  FROM run_tests rt JOIN runs r ON r.id = rt.run_id`;

export interface ExecutionScope {
  branch?: string;
  environment?: string;
  project?: string;
}

function scopeWhere(scope: ExecutionScope, params: Record<string, unknown>): string[] {
  const where: string[] = [];
  if (scope.branch) {
    where.push('r.branch = @branch');
    params.branch = scope.branch;
  }
  if (scope.environment) {
    where.push('r.environment = @environment');
    params.environment = scope.environment;
  }
  if (scope.project) {
    where.push('(rt.project = @project OR rt.browser = @project)');
    params.project = scope.project;
  }
  return where;
}

/** All executions of one test, oldest → newest. */
export function executionsForTest(ctx: AppContext, testId: string, scope: ExecutionScope = {}, limit = 500): ExecutionRow[] {
  const params: Record<string, unknown> = { testId, limit };
  const where = ['rt.test_id = @testId', ...scopeWhere(scope, params)];
  const rows = ctx.dbHandle.sqlite
    .prepare(`${EXECUTION_SELECT} WHERE ${where.join(' AND ')} ORDER BY rt.started_at DESC, rt.id DESC LIMIT @limit`)
    .all(params) as ExecutionRow[];
  return rows.reverse();
}

/** Most recent `window` executions for EVERY test (window function), grouped by test id. */
export function recentExecutionsByTest(ctx: AppContext, scope: ExecutionScope = {}, window = 20): Map<string, ExecutionRow[]> {
  const params: Record<string, unknown> = { window };
  const where = scopeWhere(scope, params);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = ctx.dbHandle.sqlite
    .prepare(
      `WITH ranked AS (
         SELECT rt.id AS run_test_id, rt.run_id, rt.test_id, rt.started_at, rt.status, rt.retries, rt.duration_ms,
                r.branch, r.environment, rt.project, r.commit_sha, r.repository_url, rt.file, rt.line, rt.error_summary,
                ROW_NUMBER() OVER (PARTITION BY rt.test_id ORDER BY rt.started_at DESC, rt.id DESC) AS rn
         FROM run_tests rt JOIN runs r ON r.id = rt.run_id ${whereSql}
       )
       SELECT * FROM ranked WHERE rn <= @window ORDER BY test_id, started_at ASC, run_test_id ASC`,
    )
    .all(params) as ExecutionRow[];
  const map = new Map<string, ExecutionRow[]>();
  for (const r of rows) {
    const list = map.get(r.test_id);
    if (list) list.push(r);
    else map.set(r.test_id, [r]);
  }
  return map;
}

export function buildHistory(ctx: AppContext, testId: string, rows: ExecutionRow[]): TestHistory {
  const samples = rows.map((r) => ({ ...toSample(r), row: r }));
  const stats = computeHistoryStats(samples);
  const verdict = evaluateFlakiness(samples, ctx.settings.get().flaky);
  const point = (s: { row: ExecutionRow } | null): ExecutionPoint | null => (s ? toPoint(s.row) : null);
  return {
    testId,
    executions: stats.executions,
    passRate: stats.passRate,
    avgDurationMs: stats.avgDurationMs,
    p95DurationMs: stats.p95DurationMs,
    failures: stats.failures,
    flakyExecutions: stats.flakyExecutions,
    retries: stats.retries,
    lastFailure: point(stats.lastFailure),
    lastSuccess: point(stats.lastSuccess),
    lastExecution: point(stats.lastExecution),
    recent: stats.recent.map((s) => toPoint(s.row)),
    flaky: verdict,
  };
}

// ---------------------------------------------------------------------------
// Test list
// ---------------------------------------------------------------------------

interface TestMeta {
  id: string;
  title: string;
  full_title: string;
  title_path_json: string;
  suite_id: string;
  suite: string;
  file: string;
  line: number;
  column: number | null;
  first_seen_at: string;
  last_seen_at: string;
}

function testMetaQuery(ctx: AppContext, filters: { q?: string; suite?: string; file?: string; ids?: string[] }): TestMeta[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.q) {
    where.push('(t.title LIKE @q OR t.full_title LIKE @q OR t.file LIKE @q OR s.name LIKE @q OR t.id LIKE @q)');
    params.q = `%${filters.q.trim()}%`;
  }
  if (filters.suite) {
    where.push('(t.suite_id = @suite OR s.name = @suite)');
    params.suite = filters.suite;
  }
  if (filters.file) {
    where.push('t.file = @file');
    params.file = filters.file;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return ctx.dbHandle.sqlite
    .prepare(
      `SELECT t.id, t.title, t.full_title, t.title_path_json, t.suite_id, s.name AS suite, t.file, t.line, t.column, t.first_seen_at, t.last_seen_at
       FROM tests t JOIN suites s ON s.id = t.suite_id ${whereSql} ORDER BY s.name, t.file, t.line`,
    )
    .all(params) as TestMeta[];
}

export function buildTestListItem(ctx: AppContext, meta: TestMeta, rows: ExecutionRow[], override: string | null): TestListItem {
  const samples = rows.map(toSample);
  const stats = computeHistoryStats(samples);
  const verdict = evaluateFlakiness(samples, ctx.settings.get().flaky);
  const last = rows[rows.length - 1] ?? null;
  return {
    testId: meta.id,
    title: meta.title,
    fullTitle: meta.full_title,
    suiteId: meta.suite_id,
    suite: meta.suite,
    file: meta.file,
    line: meta.line,
    executions: stats.executions,
    passRate: stats.passRate,
    avgDurationMs: stats.avgDurationMs,
    lastStatus: last ? (last.status as TestOutcome) : null,
    lastRunId: last?.run_id ?? null,
    lastRunTestId: last?.run_test_id ?? null,
    lastStartedAt: last?.started_at ?? null,
    lastProject: last?.project ?? null,
    recent: stats.recent.map((s) => s.status),
    isFlaky: verdict.flaky,
    sourceUrl: last
      ? buildSourceUrl({ repositoryUrl: override ?? last.repository_url, commitSha: last.commit_sha, file: last.file, line: last.line })
      : null,
  };
}

export function listTests(ctx: AppContext, filters: TestFilters): Paginated<TestListItem> {
  const { page, pageSize, offset } = pageParams(filters.page, filters.pageSize, 50);
  const metas = testMetaQuery(ctx, filters);
  const window = ctx.settings.get().flaky.windowRuns;
  const scope: ExecutionScope = { branch: filters.branch, environment: filters.environment, project: filters.project };
  const recent = recentExecutionsByTest(ctx, scope, window);
  const override = repoOverride(ctx);

  let items = metas.map((m) => buildTestListItem(ctx, m, recent.get(m.id) ?? [], override));
  if (filters.status) {
    items = items.filter((i) =>
      filters.status === 'failed' ? i.lastStatus !== null && isFailureOutcome(i.lastStatus) : i.lastStatus === filters.status,
    );
  }
  if (filters.flaky === 'true') items = items.filter((i) => i.isFlaky);
  if (filters.branch || filters.environment || filters.project) items = items.filter((i) => i.executions > 0);

  const sort = filters.sort ?? 'suite';
  const cmp: Record<string, (a: TestListItem, b: TestListItem) => number> = {
    suite: (a, b) => a.suite.localeCompare(b.suite) || a.file.localeCompare(b.file) || a.line - b.line,
    title: (a, b) => a.title.localeCompare(b.title),
    lastRun: (a, b) => (b.lastStartedAt ?? '').localeCompare(a.lastStartedAt ?? ''),
    passRate: (a, b) => a.passRate - b.passRate,
    duration: (a, b) => b.avgDurationMs - a.avgDurationMs,
  };
  items.sort(cmp[sort] ?? cmp.suite!);
  return { items: items.slice(offset, offset + pageSize), page, pageSize, total: items.length };
}

export function listFlakyTests(ctx: AppContext, scope: ExecutionScope = {}): FlakyItem[] {
  const window = ctx.settings.get().flaky.windowRuns;
  const recent = recentExecutionsByTest(ctx, scope, window);
  const metas = testMetaQuery(ctx, {});
  const override = repoOverride(ctx);
  const out: FlakyItem[] = [];
  for (const m of metas) {
    const rows = recent.get(m.id) ?? [];
    if (!rows.length) continue;
    const history = buildHistory(ctx, m.id, rows);
    if (!history.flaky.flaky) continue;
    const last = rows[rows.length - 1]!;
    out.push({
      testId: m.id,
      title: m.title,
      suite: m.suite,
      suiteId: m.suite_id,
      file: m.file,
      line: m.line,
      verdict: history.flaky,
      lastFailure: history.lastFailure,
      lastExecution: history.lastExecution,
      recent: history.recent.map((p) => p.status),
      sourceUrl: buildSourceUrl({ repositoryUrl: override ?? last.repository_url, commitSha: last.commit_sha, file: last.file, line: last.line }),
    });
  }
  return out.sort((a, b) => b.verdict.failureRate - a.verdict.failureRate || b.verdict.flakyExecutions - a.verdict.flakyExecutions);
}

// ---------------------------------------------------------------------------
// Test detail (history page)
// ---------------------------------------------------------------------------

export function getTestDetail(ctx: AppContext, testId: string, scope: ExecutionScope & { page?: number; pageSize?: number }): TestDetailResponse | null {
  const meta = ctx.dbHandle.sqlite
    .prepare(
      `SELECT t.id, t.title, t.full_title, t.title_path_json, t.suite_id, s.name AS suite, t.file, t.line, t.column, t.first_seen_at, t.last_seen_at
       FROM tests t JOIN suites s ON s.id = t.suite_id WHERE t.id = ?`,
    )
    .get(testId) as TestMeta | undefined;
  if (!meta) return null;
  const rows = executionsForTest(ctx, testId, scope);
  const history = buildHistory(ctx, testId, rows);
  const override = repoOverride(ctx);
  const { page, pageSize, offset } = pageParams(scope.page, scope.pageSize, 25);
  const newestFirst = [...rows].reverse();
  const last = rows[rows.length - 1];
  return {
    test: {
      testId: meta.id,
      title: meta.title,
      fullTitle: meta.full_title,
      titlePath: safeJson<string[]>(meta.title_path_json, []),
      suiteId: meta.suite_id,
      suite: meta.suite,
      file: meta.file,
      line: meta.line,
      column: meta.column,
      firstSeenAt: meta.first_seen_at,
      lastSeenAt: meta.last_seen_at,
    },
    history,
    executions: {
      items: newestFirst.slice(offset, offset + pageSize).map((r) => ({
        ...toPoint(r),
        errorSummary: r.error_summary,
        sourceUrl: buildSourceUrl({ repositoryUrl: override ?? r.repository_url, commitSha: r.commit_sha, file: r.file, line: r.line }),
      })),
      page,
      pageSize,
      total: rows.length,
    },
    links: {
      sourceUrl: last
        ? buildSourceUrl({ repositoryUrl: override ?? last.repository_url, commitSha: last.commit_sha, file: last.file, line: last.line })
        : null,
      repositoryUrl: override ?? last?.repository_url ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Run-test detail (failure page)
// ---------------------------------------------------------------------------

interface AttemptRowRaw {
  id: number;
  retry: number;
  status: string;
  started_at: string;
  duration_ms: number;
  worker_index: number | null;
  stdout: string;
  stderr: string;
  steps_json: string;
}
interface ErrorRowRaw {
  id: number;
  attempt_id: number;
  position: number;
  message: string;
  stack: string | null;
  snippet: string | null;
  location_file: string | null;
  location_line: number | null;
  location_column: number | null;
}
interface ArtifactRowRaw {
  id: number;
  attempt_id: number;
  run_id: string;
  test_id: string;
  kind: string;
  name: string;
  content_type: string;
  relative_path: string;
  size_bytes: number;
  created_at: string;
}

export function getRunTestDetail(ctx: AppContext, runTestId: number): RunTestDetail | null {
  const row = ctx.dbHandle.sqlite
    .prepare(
      `SELECT rt.*, t.title AS title, t.full_title AS full_title, t.title_path_json, s.name AS suite, r.repository_url AS repository_url, r.commit_sha AS commit_sha,
        0 AS has_trace, 0 AS has_video, 0 AS has_screenshot
       FROM run_tests rt JOIN tests t ON t.id = rt.test_id JOIN suites s ON s.id = rt.suite_id JOIN runs r ON r.id = rt.run_id
       WHERE rt.id = ?`,
    )
    .get(runTestId) as (RawRunTestJoin & { title_path_json: string }) | undefined;
  if (!row) return null;
  const run = getRun(ctx, row.run_id);
  if (!run) return null;
  const override = repoOverride(ctx);
  const repositoryUrl = override ?? row.repository_url;

  const attempts = ctx.dbHandle.sqlite
    .prepare('SELECT * FROM test_attempts WHERE run_test_id = ? ORDER BY retry ASC')
    .all(runTestId) as AttemptRowRaw[];
  const attemptIds = attempts.map((a) => a.id);
  const placeholders = attemptIds.map(() => '?').join(',') || 'NULL';
  const errors = ctx.dbHandle.sqlite
    .prepare(`SELECT * FROM errors WHERE attempt_id IN (${placeholders}) ORDER BY attempt_id, position`)
    .all(...attemptIds) as ErrorRowRaw[];
  const artifactsRaw = ctx.dbHandle.sqlite
    .prepare(`SELECT * FROM artifacts WHERE attempt_id IN (${placeholders}) ORDER BY kind, id`)
    .all(...attemptIds) as ArtifactRowRaw[];

  const attemptDetails: AttemptDetail[] = attempts.map((a) => ({
    id: a.id,
    retry: a.retry,
    status: a.status as AttemptStatus,
    startedAt: a.started_at,
    durationMs: a.duration_ms,
    workerIndex: a.worker_index,
    stdout: a.stdout,
    stderr: a.stderr,
    steps: safeJson(a.steps_json, []),
    errors: errors
      .filter((e) => e.attempt_id === a.id)
      .map(
        (e): ErrorDetail => ({
          id: e.id,
          position: e.position,
          message: e.message,
          stack: e.stack,
          snippet: e.snippet,
          location: e.location_file ? { file: e.location_file, line: e.location_line, column: e.location_column } : null,
          sourceUrl: e.location_file
            ? buildSourceUrl({ repositoryUrl, commitSha: row.commit_sha, file: e.location_file, line: e.location_line ?? undefined })
            : null,
        }),
      ),
    artifacts: artifactsRaw
      .filter((x) => x.attempt_id === a.id)
      .map((x): ArtifactSummary => mapArtifact(toArtifactRow(x))),
  }));

  const summary = mapRunTest(
    fromRawRunTestJoin({
      ...row,
      has_trace: artifactsRaw.some((x) => x.kind === 'trace') ? 1 : 0,
      has_video: artifactsRaw.some((x) => x.kind === 'video') ? 1 : 0,
      has_screenshot: artifactsRaw.some((x) => x.kind === 'screenshot') ? 1 : 0,
    }),
    override,
  );
  const historyRows = executionsForTest(ctx, row.test_id);
  return {
    test: summary,
    run,
    titlePath: safeJson<string[]>(row.title_path_json, []),
    column: row.column,
    expectedStatus: row.expected_status as AttemptStatus,
    tags: safeJson<string[]>(row.tags_json, []),
    annotations: safeJson(row.annotations_json, []),
    attempts: attemptDetails,
    links: {
      sourceUrl: summary.sourceUrl,
      commitUrl: buildCommitUrl(repositoryUrl, row.commit_sha),
      ciRunUrl: run.ci.runUrl,
      repositoryUrl,
    },
    history: buildHistory(ctx, row.test_id, historyRows),
  };
}

export function getArtifact(ctx: AppContext, artifactId: number): ArtifactRow | null {
  const raw = ctx.dbHandle.sqlite.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifactId) as ArtifactRowRaw | undefined;
  return raw ? toArtifactRow(raw) : null;
}

function toArtifactRow(x: ArtifactRowRaw): ArtifactRow {
  return {
    id: x.id,
    attemptId: x.attempt_id,
    runId: x.run_id,
    testId: x.test_id,
    kind: x.kind,
    name: x.name,
    contentType: x.content_type,
    relativePath: x.relative_path,
    sizeBytes: x.size_bytes,
    createdAt: x.created_at,
  };
}

export function safeJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}
