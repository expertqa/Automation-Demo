import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type DbHandle } from '../../database/client';
import { ingestPackage } from '../../ingest/ingest-package';
import { buildApp } from '../../server/app';
import { createAppContext } from '../../server/context';
import { silentLogger } from '../../server/logger';
import type { FailuresResponse, FlakyItem, OverviewResponse, Paginated, RunDetail, RunSummary, RunTestDetail, SuiteListItem, TestDetailResponse, TestListItem } from '../../shared/api';
import { makePackage, tempPaths, writePackage } from './helpers';

let paths: ReturnType<typeof tempPaths>;
let db: DbHandle;
let app: FastifyInstance;

beforeAll(async () => {
  paths = tempPaths();
  fs.mkdirSync(paths.tmpDir, { recursive: true });
  db = openDatabase(paths.databaseFile);
  // 6 runs: test "flappy" alternates, "solid" always passes, "broken" fails in the last 2 runs.
  for (let i = 0; i < 6; i++) {
    const pkg = makePackage({
      runId: `run_api_${i}`,
      startedAt: new Date(Date.UTC(2026, 8, 1 + i, 10)).toISOString(),
      branch: i === 2 ? 'feature/x' : 'main',
      environment: i === 2 ? 'staging' : 'qa',
      sha: `sha${i}`.padEnd(40, '0'),
      tests: [
        { file: 'tests/01-login.spec.js', title: 'TC-01 — Login', status: 'passed', durationMs: 5000 },
        { file: 'tests/02-createFunnel.spec.js', title: 'TC-02 — Funnel', status: i % 2 ? 'failed' : 'flaky', durationMs: 20000 },
        { file: 'tests/03-createProject.spec.js', title: 'TC-03 — Project', status: i >= 4 ? 'failed' : 'passed', durationMs: 9000 },
      ],
    });
    await ingestPackage(pkg, writePackage(pkg, path.join(paths.packagesDir, pkg.run.id)), { paths, dbHandle: db, moveArtifacts: true, logger: silentLogger });
  }
  const ctx = createAppContext({ dataDir: paths.dataDir, repoRoot: paths.repoRoot, dbHandle: db, logger: silentLogger });
  app = await buildApp({ ctx, staticDir: null, logger: false });
});
afterAll(async () => {
  await app.close();
  db.close();
  paths.cleanup();
});

const get = async <T>(url: string): Promise<T> => {
  const res = await app.inject({ method: 'GET', url });
  expect(res.statusCode, `${url} → ${res.body}`).toBe(200);
  return res.json() as T;
};

describe('API', () => {
  it('overview aggregates the latest run and trends', async () => {
    const o = await get<OverviewResponse>('/api/overview');
    expect(o.latest?.id).toBe('run_api_5');
    expect(o.totals).toMatchObject({ runs: 6, tests: 3, suites: 1 });
    expect(o.trends).toHaveLength(6);
    expect(o.trends[0]!.runId).toBe('run_api_0');
    expect(o.window.flakyTests).toBeGreaterThanOrEqual(1);
    expect(o.hasDemoData).toBe(false);
  });

  it('lists and filters runs, supports search and pagination', async () => {
    const all = await get<Paginated<RunSummary>>('/api/runs?pageSize=4');
    expect(all.total).toBe(6);
    expect(all.items).toHaveLength(4);
    expect(all.items[0]!.id).toBe('run_api_5');
    const staging = await get<Paginated<RunSummary>>('/api/runs?environment=staging');
    expect(staging.items.map((r) => r.id)).toEqual(['run_api_2']);
    const branch = await get<Paginated<RunSummary>>('/api/runs?branch=feature/x');
    expect(branch.total).toBe(1);
    const failed = await get<Paginated<RunSummary>>('/api/runs?status=failed');
    expect(failed.total).toBe(4);
    const search = await get<Paginated<RunSummary>>('/api/runs?q=sha3');
    expect(search.items.map((r) => r.id)).toEqual(['run_api_3']);
    const dated = await get<Paginated<RunSummary>>('/api/runs?from=2026-09-05&to=2026-09-06');
    expect(dated.items.map((r) => r.id).sort()).toEqual(['run_api_4', 'run_api_5']);
    expect(all.items[0]!.commitUrl).toBe(`https://github.com/org/repo/commit/${'sha5'.padEnd(40, '0')}`);
  });

  it('returns run detail with suites → files → tests', async () => {
    const d = await get<RunDetail>('/api/runs/run_api_5');
    expect(d.run.counts).toMatchObject({ total: 3, passed: 1, failed: 2 });
    expect(d.suites.map((s) => s.name)).toEqual(['Suite']);
    expect(d.suites[0]!.files.map((f) => f.file)).toEqual(['tests/01-login.spec.js', 'tests/02-createFunnel.spec.js', 'tests/03-createProject.spec.js']);
    const funnel = d.suites[0]!.files[1]!.tests[0]!;
    expect(funnel.status).toBe('failed');
    expect(funnel.hasTrace).toBe(true);
    expect(funnel.sourceUrl).toBe(`https://github.com/org/repo/blob/${'sha5'.padEnd(40, '0')}/tests/02-createFunnel.spec.js#L10`);
    const missing = await app.inject({ method: 'GET', url: '/api/runs/nope' });
    expect(missing.statusCode).toBe(404);
  });

  it('returns execution detail with attempts, errors, artifacts, links and history', async () => {
    const d = await get<RunDetail>('/api/runs/run_api_5');
    const rt = d.suites[0]!.files[1]!.tests[0]!.runTestId;
    const x = await get<RunTestDetail>(`/api/run-tests/${rt}`);
    expect(x.attempts).toHaveLength(1);
    expect(x.attempts[0]!.errors[0]!.message).toMatch(/toBeVisible/);
    expect(x.attempts[0]!.artifacts.map((a) => a.kind).sort()).toEqual(['screenshot', 'text', 'trace', 'video']);
    expect(x.links.sourceUrl).toContain('#L10');
    expect(x.links.commitUrl).toContain('/commit/');
    expect(x.history.executions).toBe(6);
    expect(x.history.flaky.flaky).toBe(true);
    expect(x.history.recent[0]!.runId).toBe('run_api_5');
  });

  it('serves artifacts safely with range support and rejects bad ids', async () => {
    const d = await get<RunDetail>('/api/runs/run_api_5');
    const rt = d.suites[0]!.files[1]!.tests[0]!.runTestId;
    const x = await get<RunTestDetail>(`/api/run-tests/${rt}`);
    const video = x.attempts[0]!.artifacts.find((a) => a.kind === 'video')!;
    const full = await app.inject({ method: 'GET', url: video.url });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toBe('video/webm');
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.rawPayload.length).toBe(2048);
    const range = await app.inject({ method: 'GET', url: video.url, headers: { range: 'bytes=0-99' } });
    expect(range.statusCode).toBe(206);
    expect(range.headers['content-range']).toBe('bytes 0-99/2048');
    expect(range.rawPayload.length).toBe(100);
    const shot = x.attempts[0]!.artifacts.find((a) => a.kind === 'screenshot')!;
    const png = await app.inject({ method: 'GET', url: shot.url });
    expect(png.headers['content-type']).toBe('image/png');
    expect((await app.inject({ method: 'GET', url: '/api/artifacts/999999' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/artifacts/abc' })).statusCode).toBe(400);
    const notTrace = await app.inject({ method: 'POST', url: `/api/artifacts/${shot.id}/open-trace` });
    expect(notTrace.statusCode).toBe(400);
  });

  it('lists tests with history, filters and sorting', async () => {
    const tests = await get<Paginated<TestListItem>>('/api/tests');
    expect(tests.total).toBe(3);
    const funnel = tests.items.find((t) => t.title === 'TC-02 — Funnel')!;
    expect(funnel.executions).toBe(6);
    expect(funnel.isFlaky).toBe(true);
    expect(funnel.recent[0]).toBe('failed');
    const flakyOnly = await get<Paginated<TestListItem>>('/api/tests?flaky=true');
    expect(flakyOnly.items.every((t) => t.isFlaky)).toBe(true);
    const q = await get<Paginated<TestListItem>>('/api/tests?q=login');
    expect(q.items.map((t) => t.title)).toEqual(['TC-01 — Login']);
    const failedLast = await get<Paginated<TestListItem>>('/api/tests?status=failed');
    expect(failedLast.items.map((t) => t.title).sort()).toEqual(['TC-02 — Funnel', 'TC-03 — Project']);
    const byDuration = await get<Paginated<TestListItem>>('/api/tests?sort=duration');
    expect(byDuration.items[0]!.title).toBe('TC-02 — Funnel');
    const scoped = await get<Paginated<TestListItem>>('/api/tests?environment=staging');
    expect(scoped.items.every((t) => t.executions === 1)).toBe(true);
  });

  it('returns test history detail', async () => {
    const tests = await get<Paginated<TestListItem>>('/api/tests?q=Project');
    const d = await get<TestDetailResponse>(`/api/tests/${tests.items[0]!.testId}`);
    expect(d.history.executions).toBe(6);
    expect(d.history.failures).toBe(2);
    expect(d.history.lastFailure?.runId).toBe('run_api_5');
    expect(d.history.lastSuccess?.runId).toBe('run_api_3');
    expect(d.executions.items[0]!.runId).toBe('run_api_5');
    expect(d.links.sourceUrl).toContain('/blob/sha5');
  });

  it('computes suites, failures with clusters and flaky tests', async () => {
    const suites = await get<{ items: SuiteListItem[] }>('/api/suites');
    expect(suites.items[0]).toMatchObject({ name: 'Suite', tests: 3, files: 3 });
    expect(suites.items[0]!.reliability).toHaveLength(6);
    expect(suites.items[0]!.latest?.runId).toBe('run_api_5');

    const failures = await get<FailuresResponse>('/api/failures?run=latest');
    expect(failures.failures.total).toBe(2);
    expect(failures.clusters.length).toBeGreaterThan(0);
    const allFailures = await get<FailuresResponse>('/api/failures?days=365');
    expect(allFailures.failures.total).toBe(5);

    const flaky = await get<{ items: FlakyItem[] }>('/api/flaky');
    expect(flaky.items.map((f) => f.title)).toContain('TC-02 — Funnel');
    expect(flaky.items[0]!.verdict.reasons.length).toBeGreaterThan(0);
  });

  it('exposes filters, search and settings; settings changes affect flaky detection', async () => {
    const filters = await get<{ branches: string[]; environments: string[] }>('/api/filters');
    expect(filters.branches).toEqual(['feature/x', 'main']);
    expect(filters.environments).toEqual(['qa', 'staging']);
    const search = await get<{ results: { kind: string }[] }>('/api/search?q=funnel');
    expect(search.results.some((r) => r.kind === 'test')).toBe(true);

    const put = await app.inject({ method: 'PUT', url: '/api/settings', payload: { flaky: { countRetryPass: false, failureRateMin: 0.99, failureRateMax: 1, minTransitions: 100 } } });
    expect(put.statusCode).toBe(200);
    const flaky = await get<{ items: FlakyItem[] }>('/api/flaky');
    expect(flaky.items).toHaveLength(0);
    const reset = await app.inject({ method: 'DELETE', url: '/api/settings' });
    expect(reset.statusCode).toBe(200);
    const again = await get<{ items: FlakyItem[] }>('/api/flaky');
    expect(again.items.length).toBeGreaterThan(0);
    const override = await app.inject({ method: 'PUT', url: '/api/settings', payload: { github: { repositoryUrl: 'git@github.com:other/repo.git' } } });
    expect(override.json().settings.github.repositoryUrl).toBe('https://github.com/other/repo');
    const runs = await get<Paginated<RunSummary>>('/api/runs?pageSize=1');
    expect(runs.items[0]!.commitUrl).toContain('https://github.com/other/repo/commit/');
    await app.inject({ method: 'DELETE', url: '/api/settings' });
  });

  it('deletes a run and its artifacts', async () => {
    const before = fs.existsSync(path.join(paths.artifactsDir, 'run_api_0'));
    expect(before).toBe(true);
    const res = await app.inject({ method: 'DELETE', url: '/api/runs/run_api_0' });
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(path.join(paths.artifactsDir, 'run_api_0'))).toBe(false);
    expect((await get<Paginated<RunSummary>>('/api/runs')).total).toBe(5);
    expect((await app.inject({ method: 'DELETE', url: '/api/runs/run_api_0' })).statusCode).toBe(404);
  });
});
