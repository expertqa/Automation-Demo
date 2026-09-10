import type { AppContext } from '../context';
import type { FailureCluster, FailureItem, FailuresResponse } from '../../shared/api';
import { buildSourceUrl } from '../../shared/github';
import type { TestOutcome } from '../../shared/types';
import { pageParams, repoOverride } from './runs';

export interface FailureFilters {
  runId?: string; // 'latest' | run id
  branch?: string;
  environment?: string;
  project?: string;
  q?: string;
  days?: number;
  page?: number;
  pageSize?: number;
}

interface FailureRow {
  run_test_id: number;
  run_id: string;
  test_id: string;
  title: string;
  suite: string;
  file: string;
  line: number;
  project: string;
  status: string;
  started_at: string;
  duration_ms: number;
  retries: number;
  error_summary: string | null;
  fingerprint: string | null;
  branch: string | null;
  environment: string;
  repository_url: string | null;
  commit_sha: string | null;
  has_trace: number;
}

export function listFailures(ctx: AppContext, filters: FailureFilters): FailuresResponse {
  const { page, pageSize, offset } = pageParams(filters.page, filters.pageSize, 50);
  const where = ["rt.status IN ('failed','timedOut','interrupted')"];
  const params: Record<string, unknown> = {};
  if (filters.runId === 'latest') {
    where.push('rt.run_id = (SELECT id FROM runs ORDER BY started_at DESC LIMIT 1)');
  } else if (filters.runId) {
    where.push('rt.run_id = @runId');
    params.runId = filters.runId;
  }
  if (filters.branch) {
    where.push('r.branch = @branch');
    params.branch = filters.branch;
  }
  if (filters.environment) {
    where.push('r.environment = @environment');
    params.environment = filters.environment;
  }
  if (filters.project) {
    where.push('(rt.project = @project OR rt.browser = @project)');
    params.project = filters.project;
  }
  if (filters.days && Number.isFinite(filters.days)) {
    where.push('rt.started_at >= @since');
    params.since = new Date(Date.now() - filters.days * 86_400_000).toISOString();
  }
  if (filters.q) {
    where.push('(t.title LIKE @q OR rt.file LIKE @q OR s.name LIKE @q OR rt.error_summary LIKE @q)');
    params.q = `%${filters.q.trim()}%`;
  }
  const base = `
    FROM run_tests rt
    JOIN tests t ON t.id = rt.test_id
    JOIN suites s ON s.id = rt.suite_id
    JOIN runs r ON r.id = rt.run_id
    WHERE ${where.join(' AND ')}`;
  const total = (ctx.dbHandle.sqlite.prepare(`SELECT COUNT(*) AS c ${base}`).get(params) as { c: number }).c;
  const rows = ctx.dbHandle.sqlite
    .prepare(
      `SELECT rt.id AS run_test_id, rt.run_id, rt.test_id, t.title, s.name AS suite, rt.file, rt.line, rt.project, rt.status, rt.started_at,
              rt.duration_ms, rt.retries, rt.error_summary, r.branch, r.environment, r.repository_url, r.commit_sha,
              (SELECT e.fingerprint FROM errors e JOIN test_attempts ta ON ta.id = e.attempt_id WHERE ta.run_test_id = rt.id ORDER BY ta.retry DESC, e.position ASC LIMIT 1) AS fingerprint,
              (SELECT COUNT(*) FROM artifacts a JOIN test_attempts ta ON ta.id = a.attempt_id WHERE ta.run_test_id = rt.id AND a.kind = 'trace') AS has_trace
       ${base} ORDER BY rt.started_at DESC, rt.id DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: pageSize, offset }) as FailureRow[];
  const clusterRows = ctx.dbHandle.sqlite
    .prepare(
      `SELECT fp AS fingerprint, COUNT(*) AS count, COUNT(DISTINCT test_id) AS tests, MIN(error_summary) AS sample FROM (
         SELECT rt.test_id, rt.error_summary,
           (SELECT e.fingerprint FROM errors e JOIN test_attempts ta ON ta.id = e.attempt_id WHERE ta.run_test_id = rt.id ORDER BY ta.retry DESC, e.position ASC LIMIT 1) AS fp
         ${base}
       ) WHERE fp IS NOT NULL GROUP BY fp ORDER BY count DESC LIMIT 8`,
    )
    .all(params) as FailureCluster[];
  const override = repoOverride(ctx);
  return {
    failures: {
      items: rows.map(
        (r): FailureItem => ({
          runTestId: r.run_test_id,
          runId: r.run_id,
          testId: r.test_id,
          title: r.title,
          suite: r.suite,
          file: r.file,
          line: r.line,
          project: r.project,
          status: r.status as TestOutcome,
          startedAt: r.started_at,
          durationMs: r.duration_ms,
          retries: r.retries,
          errorSummary: r.error_summary,
          fingerprint: r.fingerprint,
          branch: r.branch,
          environment: r.environment,
          sourceUrl: buildSourceUrl({ repositoryUrl: override ?? r.repository_url, commitSha: r.commit_sha, file: r.file, line: r.line }),
          hasTrace: r.has_trace > 0,
        }),
      ),
      page,
      pageSize,
      total,
    },
    clusters: clusterRows.map((c) => ({ ...c, sample: c.sample ?? c.fingerprint })),
  };
}
