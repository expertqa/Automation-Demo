import type { FastifyPluginAsync } from 'fastify';
import type { RunFilters, SettingsResponse, TestFilters } from '../../shared/api';
import { deleteRun, deleteRunsBySource, getRunDetail, listRunTests, listRuns } from '../services/runs';
import { getRunTestDetail, getTestDetail, listFlakyTests, listTests, type ExecutionScope } from '../services/tests';
import { getSuiteDetail, listSuites } from '../services/suites';
import { listFailures } from '../services/failures';
import { getFilterOptions, getHistory, getOverview, globalSearch } from '../services/overview';

type Query = Record<string, string | undefined>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 200) : undefined;
}
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function scope(q: Query): ExecutionScope {
  return { branch: str(q.branch), environment: str(q.environment), project: str(q.project) };
}

export const registerApiRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.get('/health', async () => ({ ok: true, version: ctx.version }));

  app.get<{ Querystring: Query }>('/overview', async (req) => getOverview(ctx, scope(req.query)));

  app.get<{ Querystring: Query }>('/history', async (req) => getHistory(ctx, { ...scope(req.query), days: num(req.query.days), runs: num(req.query.runs) }));

  app.get('/filters', async () => getFilterOptions(ctx));

  app.get<{ Querystring: Query }>('/search', async (req) => ({ results: globalSearch(ctx, str(req.query.q) ?? '') }));

  app.get<{ Querystring: Query }>('/runs', async (req) => {
    const q = req.query;
    const filters: RunFilters = {
      q: str(q.q),
      status: str(q.status),
      branch: str(q.branch),
      environment: str(q.environment),
      project: str(q.project),
      source: str(q.source),
      from: str(q.from),
      to: str(q.to),
      page: num(q.page),
      pageSize: num(q.pageSize),
    };
    return listRuns(ctx, filters);
  });

  app.get<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    const detail = getRunDetail(ctx, req.params.id);
    if (!detail) return reply.code(404).send({ error: 'run not found' });
    return detail;
  });

  app.get<{ Params: { id: string }; Querystring: Query }>('/runs/:id/tests', async (req, reply) => {
    const detail = getRunDetail(ctx, req.params.id);
    if (!detail) return reply.code(404).send({ error: 'run not found' });
    return { items: listRunTests(ctx, req.params.id, { status: str(req.query.status), q: str(req.query.q) }) };
  });

  app.delete<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    const ok = deleteRun(ctx, req.params.id);
    if (!ok) return reply.code(404).send({ error: 'run not found' });
    ctx.logger.info(`deleted run ${req.params.id}`);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/run-tests/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid id' });
    const detail = getRunTestDetail(ctx, id);
    if (!detail) return reply.code(404).send({ error: 'test execution not found' });
    return detail;
  });

  app.get<{ Querystring: Query }>('/tests', async (req) => {
    const q = req.query;
    const filters: TestFilters = {
      q: str(q.q),
      status: str(q.status),
      suite: str(q.suite),
      file: str(q.file),
      project: str(q.project),
      branch: str(q.branch),
      environment: str(q.environment),
      flaky: str(q.flaky),
      page: num(q.page),
      pageSize: num(q.pageSize),
      sort: str(q.sort),
    };
    return listTests(ctx, filters);
  });

  app.get<{ Params: { id: string }; Querystring: Query }>('/tests/:id', async (req, reply) => {
    const detail = getTestDetail(ctx, req.params.id, { ...scope(req.query), page: num(req.query.page), pageSize: num(req.query.pageSize) });
    if (!detail) return reply.code(404).send({ error: 'test not found' });
    return detail;
  });

  app.get<{ Querystring: Query }>('/suites', async (req) => ({ items: listSuites(ctx, scope(req.query)) }));

  app.get<{ Params: { id: string }; Querystring: Query }>('/suites/:id', async (req, reply) => {
    const detail = getSuiteDetail(ctx, req.params.id, scope(req.query));
    if (!detail) return reply.code(404).send({ error: 'suite not found' });
    return detail;
  });

  app.get<{ Querystring: Query }>('/failures', async (req) =>
    listFailures(ctx, {
      runId: str(req.query.run),
      ...scope(req.query),
      q: str(req.query.q),
      days: num(req.query.days),
      page: num(req.query.page),
      pageSize: num(req.query.pageSize),
    }),
  );

  app.get<{ Querystring: Query }>('/flaky', async (req) => ({ items: listFlakyTests(ctx, scope(req.query)), config: ctx.settings.get().flaky }));

  app.get('/settings', async (): Promise<SettingsResponse> => settingsResponse());

  app.put<{ Body: unknown }>('/settings', async (req): Promise<SettingsResponse> => {
    ctx.settings.update(req.body);
    ctx.logger.info('settings updated');
    return settingsResponse();
  });

  app.delete('/settings', async (): Promise<SettingsResponse> => {
    ctx.settings.reset();
    return settingsResponse();
  });

  app.delete('/demo-data', async () => {
    const removed = deleteRunsBySource(ctx, 'demo');
    ctx.logger.info(`removed ${removed} demo runs`);
    return { ok: true, removed };
  });

  function settingsResponse(): SettingsResponse {
    const demo = (ctx.dbHandle.sqlite.prepare("SELECT COUNT(*) AS c FROM runs WHERE source = 'demo'").get() as { c: number }).c;
    const lastRepo = (ctx.dbHandle.sqlite.prepare('SELECT repository_url AS v FROM runs WHERE repository_url IS NOT NULL ORDER BY started_at DESC LIMIT 1').get() as { v: string } | undefined)?.v ?? null;
    const settings = ctx.settings.get();
    return {
      settings,
      info: {
        dataDir: ctx.paths.dataDir,
        databaseFile: ctx.paths.databaseFile,
        artifactsDir: ctx.paths.artifactsDir,
        repoRoot: ctx.paths.repoRoot,
        repositoryUrl: settings.github.repositoryUrl ?? lastRepo,
        version: ctx.version,
        traceViewer: { available: ctx.trace.isAvailable(), strategy: ctx.trace.strategy, playwrightVersion: ctx.trace.playwrightVersion() },
        demoRuns: demo,
      },
    };
  }
};
