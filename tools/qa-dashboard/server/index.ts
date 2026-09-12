import path from 'node:path';
import { buildApp } from './app';
import { createAppContext } from './context';
import { createLogger } from './logger';
import { syncCiRuns } from './services/ci-sync';

const CI_SYNC_INTERVAL_MS = 20_000;

export interface StartOptions {
  host?: string;
  port?: number;
  dataDir?: string;
  repoRoot?: string;
  staticDir?: string | null;
  quiet?: boolean;
}

export const DEFAULT_STATIC_DIR = path.join(__dirname, '..', 'app', 'dist');

export async function startServer(options: StartOptions = {}) {
  const logger = createLogger('server');
  const host = options.host ?? process.env.QA_DASHBOARD_HOST ?? '127.0.0.1';
  const port = options.port ?? Number(process.env.QA_DASHBOARD_PORT ?? 3000);
  const ctx = createAppContext({ dataDir: options.dataDir, repoRoot: options.repoRoot, logger });
  const app = await buildApp({ ctx, staticDir: options.staticDir === undefined ? DEFAULT_STATIC_DIR : options.staticDir, logger: !options.quiet });

  if (host !== '127.0.0.1' && host !== 'localhost') {
    logger.warn(`binding to ${host} exposes the dashboard beyond this machine — make sure that is intended`);
  }
  await app.listen({ host, port });
  const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
  logger.info(`QA dashboard listening on ${url}`);
  logger.info(`data directory: ${ctx.paths.dataDir}`);

  // While GITHUB_TOKEN is set, pull finished CI runs of the Playwright workflow
  // in automatically — so a "Run"/"Run headed" click from the UI shows up here
  // without anyone downloading the artifact zip by hand.
  let ciSyncTimer: ReturnType<typeof setInterval> | undefined;
  if (process.env.GITHUB_TOKEN) {
    const syncLogger = logger.child('ci-sync');
    const runSync = () => {
      syncCiRuns(ctx).catch((err: unknown) => syncLogger.error(`sync failed: ${(err as Error).message}`));
    };
    runSync();
    ciSyncTimer = setInterval(runSync, CI_SYNC_INTERVAL_MS);
    syncLogger.info(`polling GitHub Actions for finished runs every ${CI_SYNC_INTERVAL_MS / 1000}s`);
  }

  const shutdown = async () => {
    logger.info('shutting down');
    if (ciSyncTimer) clearInterval(ciSyncTimer);
    await app.close();
    ctx.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { app, ctx, url };
}
