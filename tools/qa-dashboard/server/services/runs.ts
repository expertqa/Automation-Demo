import { eq } from 'drizzle-orm';
import type { AppContext } from '../context';
import { schema } from '../../database/client';
import type { RunRow, RunTestRow } from '../../database/schema';
import type { Paginated, RunDetail, RunFilters, RunSummary, RunTestSummary, SuiteInRun } from '../../shared/api';
import { mapRun, mapRunTest } from './mappers';
import { deleteRun as deleteRunRows } from '../../ingest/ingest-package';

const MAX_PAGE_SIZE = 200;

export function pageParams(page?: number, pageSize?: number, defaultSize = 25): { page: number; pageSize: number; offset: number } {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const s = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(pageSize) || defaultSize)));
  return { page: p, pageSize: s, offset: (p - 1) * s };
}

export function repoOverride(ctx: AppContext): string | null {
  return ctx.settings.get().github.repositoryUrl;
}

export function listRuns(ctx: AppContext, filters: RunFilters): Paginated<RunSummary> {
  const { page, pageSize, offset } = pageParams(filters.page, filters.pageSize);
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.status) {
    where.push('status = @status');
    params.status = filters.status;
  }
  if (filters.branch) {
    where.push('branch = @branch');
    params.branch = filters.branch;
  }
  if (filters.environment) {
    where.push('environment = @environment');
    params.environment = filters.environment;
  }
  if (filters.source) {
    where.push('source = @source');
    params.source = filters.source;
  }
  if (filters.project) {
    where.push("(',' || project_names || ',' LIKE @project OR ',' || browser_names || ',' LIKE @project)");
    params.project = `%,${filters.project},%`;
  }
  if (filters.from) {
    where.push('started_at >= @from');
    params.from = new Date(filters.from).toISOString();
  }
  if (filters.to) {
    const to = new Date(filters.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(filters.to)) to.setUTCDate(to.getUTCDate() + 1);
    where.push('started_at < @to');
    params.to = to.toISOString();
  }
  if (filters.q) {
    where.push('(id LIKE @q OR commit_sha LIKE @q OR commit_message LIKE @q OR branch LIKE @q OR environment LIKE @q OR ci_workflow LIKE @q)');
    params.q = `%${filters.q.trim()}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (ctx.dbHandle.sqlite.prepare(`SELECT COUNT(*) AS c FROM runs ${whereSql}`).get(params) as { c: number }).c;
  const rows = ctx.dbHandle.sqlite
    .prepare(`SELECT * FROM runs ${whereSql} ORDER BY started_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset }) as unknown as RawRunRow[];
  const override = repoOverride(ctx);
  return { items: rows.map((r) => mapRun(fromRawRun(r), override)), page, pageSize, total };
}

export function getRun(ctx: AppContext, runId: string): RunSummary | null {
  const row = ctx.dbHandle.db.select().from(schema.runs).where(eq(schema.runs.id, runId)).get();
  return row ? mapRun(row, repoOverride(ctx)) : null;
}

export function latestRun(ctx: AppContext): RunSummary | null {
  const row = ctx.dbHandle.sqlite.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT 1').get() as RawRunRow | undefined;
  return row ? mapRun(fromRawRun(row), repoOverride(ctx)) : null;
}

export function getRunDetail(ctx: AppContext, runId: string): RunDetail | null {
  const run = getRun(ctx, runId);
  if (!run) return null;
  const tests = listRunTests(ctx, runId);
  const suites = new Map<string, SuiteInRun>();
  for (const t of tests) {
    let suite = suites.get(t.suiteId);
    if (!suite) {
      suite = { suiteId: t.suiteId, name: t.suite, total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, durationMs: 0, files: [] };
      suites.set(t.suiteId, suite);
    }
    let file = suite.files.find((f) => f.file === t.file);
    if (!file) {
      file = { file: t.file, total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, tests: [] };
      suite.files.push(file);
    }
    file.tests.push(t);
    for (const bucket of [suite, file]) {
      bucket.total++;
      if (t.status === 'passed') bucket.passed++;
      else if (t.status === 'flaky') bucket.flaky++;
      else if (t.status === 'skipped') bucket.skipped++;
      else bucket.failed++;
    }
    suite.durationMs += t.durationMs;
  }
  const ordered = Array.from(suites.values()).sort((a, b) => a.name.localeCompare(b.name));
  for (const s of ordered) s.files.sort((a, b) => a.file.localeCompare(b.file));
  return { run, suites: ordered };
}

export function listRunTests(ctx: AppContext, runId: string, filters: { status?: string; q?: string } = {}): RunTestSummary[] {
  const where = ['rt.run_id = @runId'];
  const params: Record<string, unknown> = { runId };
  if (filters.status) {
    if (filters.status === 'failed') where.push("rt.status IN ('failed','timedOut','interrupted')");
    else {
      where.push('rt.status = @status');
      params.status = filters.status;
    }
  }
  if (filters.q) {
    where.push('(t.title LIKE @q OR t.full_title LIKE @q OR rt.file LIKE @q OR s.name LIKE @q)');
    params.q = `%${filters.q.trim()}%`;
  }
  const rows = ctx.dbHandle.sqlite
    .prepare(
      `SELECT rt.*, t.title AS title, t.full_title AS full_title, s.name AS suite, r.repository_url AS repository_url, r.commit_sha AS commit_sha,
        (SELECT COUNT(*) FROM artifacts a JOIN test_attempts ta ON ta.id = a.attempt_id WHERE ta.run_test_id = rt.id AND a.kind = 'trace') AS has_trace,
        (SELECT COUNT(*) FROM artifacts a JOIN test_attempts ta ON ta.id = a.attempt_id WHERE ta.run_test_id = rt.id AND a.kind = 'video') AS has_video,
        (SELECT COUNT(*) FROM artifacts a JOIN test_attempts ta ON ta.id = a.attempt_id WHERE ta.run_test_id = rt.id AND a.kind = 'screenshot') AS has_screenshot
       FROM run_tests rt
       JOIN tests t ON t.id = rt.test_id
       JOIN suites s ON s.id = rt.suite_id
       JOIN runs r ON r.id = rt.run_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.name, rt.file, rt.line, rt.project`,
    )
    .all(params) as RawRunTestJoin[];
  const override = repoOverride(ctx);
  return rows.map((r) => mapRunTest(fromRawRunTestJoin(r), override));
}

export function deleteRun(ctx: AppContext, runId: string): boolean {
  const exists = ctx.dbHandle.db.select({ id: schema.runs.id }).from(schema.runs).where(eq(schema.runs.id, runId)).get();
  if (!exists) return false;
  deleteRunRows(ctx.dbHandle.db, ctx.store, runId);
  return true;
}

export function deleteRunsBySource(ctx: AppContext, source: string): number {
  const ids = ctx.dbHandle.sqlite.prepare('SELECT id FROM runs WHERE source = ?').all(source) as { id: string }[];
  for (const { id } of ids) deleteRunRows(ctx.dbHandle.db, ctx.store, id);
  return ids.length;
}

// ---- raw row helpers (snake_case → camelCase) -------------------------------

export type RawRunRow = {
  id: string;
  label: string;
  created_at: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  status: string;
  source: string;
  environment: string;
  branch: string | null;
  commit_sha: string | null;
  commit_message: string | null;
  commit_author: string | null;
  repository_url: string | null;
  ci_provider: string | null;
  ci_workflow: string | null;
  ci_job_name: string | null;
  ci_run_id: string | null;
  ci_run_number: string | null;
  ci_run_url: string | null;
  ci_actor: string | null;
  playwright_version: string | null;
  node_version: string | null;
  os_platform: string | null;
  os_release: string | null;
  os_arch: string | null;
  projects_json: string;
  project_names: string;
  browser_names: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  timed_out: number;
  interrupted: number;
  retries: number;
  metadata_json: string;
};

export function fromRawRun(r: RawRunRow): RunRow {
  return {
    id: r.id,
    label: r.label,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.duration_ms,
    status: r.status,
    source: r.source,
    environment: r.environment,
    branch: r.branch,
    commitSha: r.commit_sha,
    commitMessage: r.commit_message,
    commitAuthor: r.commit_author,
    repositoryUrl: r.repository_url,
    ciProvider: r.ci_provider,
    ciWorkflow: r.ci_workflow,
    ciJobName: r.ci_job_name,
    ciRunId: r.ci_run_id,
    ciRunNumber: r.ci_run_number,
    ciRunUrl: r.ci_run_url,
    ciActor: r.ci_actor,
    playwrightVersion: r.playwright_version,
    nodeVersion: r.node_version,
    osPlatform: r.os_platform,
    osRelease: r.os_release,
    osArch: r.os_arch,
    projectsJson: r.projects_json,
    projectNames: r.project_names,
    browserNames: r.browser_names,
    total: r.total,
    passed: r.passed,
    failed: r.failed,
    flaky: r.flaky,
    skipped: r.skipped,
    timedOut: r.timed_out,
    interrupted: r.interrupted,
    retries: r.retries,
    metadataJson: r.metadata_json,
  };
}

export type RawRunTestJoin = {
  id: number;
  run_id: string;
  test_id: string;
  suite_id: string;
  playwright_id: string | null;
  project: string;
  browser: string | null;
  status: string;
  expected_status: string;
  duration_ms: number;
  retries: number;
  attempts: number;
  started_at: string;
  file: string;
  line: number;
  column: number | null;
  error_summary: string | null;
  tags_json: string;
  annotations_json: string;
  title: string;
  full_title: string;
  suite: string;
  repository_url: string | null;
  commit_sha: string | null;
  has_trace: number;
  has_video: number;
  has_screenshot: number;
};

export function fromRawRunTestJoin(r: RawRunTestJoin) {
  const rt: RunTestRow = {
    id: r.id,
    runId: r.run_id,
    testId: r.test_id,
    suiteId: r.suite_id,
    playwrightId: r.playwright_id,
    project: r.project,
    browser: r.browser,
    status: r.status,
    expectedStatus: r.expected_status,
    durationMs: r.duration_ms,
    retries: r.retries,
    attempts: r.attempts,
    startedAt: r.started_at,
    file: r.file,
    line: r.line,
    column: r.column,
    errorSummary: r.error_summary,
    tagsJson: r.tags_json,
    annotationsJson: r.annotations_json,
  };
  return {
    rt,
    title: r.title,
    fullTitle: r.full_title,
    suite: r.suite,
    repositoryUrl: r.repository_url,
    commitSha: r.commit_sha,
    hasTrace: r.has_trace,
    hasVideo: r.has_video,
    hasScreenshot: r.has_screenshot,
  };
}
