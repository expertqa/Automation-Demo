import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../database/client';
import { importPath } from '../ingest/importer';
import { zipDirectory } from '../ingest/importer';
import { IngestError } from '../ingest/ingest-package';
import { DEFAULT_PACKAGE_DIR, RESULTS_FILE } from '../shared/package-format';
import { ensureDashboardDirs, resolveDashboardPaths } from '../shared/paths';
import { createLogger } from '../server/logger';
import { DEFAULT_STATIC_DIR, startServer } from '../server';
import type * as SeedModule from '../database/seed/seed';

const log = createLogger('cli');

const HELP = `qa-dashboard — local Playwright test observability

Usage:
  qa-dashboard start [--port 3000] [--host 127.0.0.1] [--no-build] [--open]
  qa-dashboard import <dir|zip> [--replace]
  qa-dashboard package [--out playwright-dashboard-results.zip]
  qa-dashboard seed [--reset]
  qa-dashboard reset [--demo-only] [--yes]
  qa-dashboard migrate
  qa-dashboard <path.zip|dir>        shorthand for "import <path>" followed by "start"

Environment:
  QA_DASHBOARD_DATA_DIR   where SQLite + artifacts live (default <repo>/dashboard-data)
  QA_DASHBOARD_PORT       default 3000
  QA_DASHBOARD_HOST       default 127.0.0.1
`;

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k!] = v;
      else if (argv[i + 1] && !argv[i + 1]!.startsWith('--') && ['port', 'host', 'out', 'data-dir'].includes(k!)) flags[k!] = argv[++i]!;
      else flags[k!] = true;
    } else positionals.push(a);
  }
  let command = positionals.shift() ?? 'start';
  // `npm run dashboard ./results.zip` → import + start
  if (!['start', 'import', 'package', 'seed', 'reset', 'migrate', 'help'].includes(command)) {
    positionals.unshift(command);
    command = 'import-and-start';
  }
  return { command, positionals, flags };
}

async function main(): Promise<void> {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));
  const dataDir = typeof flags['data-dir'] === 'string' ? flags['data-dir'] : undefined;
  const paths = resolveDashboardPaths({ dataDir });

  switch (command) {
    case 'help':
      process.stdout.write(HELP);
      return;

    case 'migrate': {
      ensureDashboardDirs(paths);
      const h = openDatabase(paths.databaseFile);
      h.close();
      log.info(`database ready at ${paths.databaseFile}`);
      return;
    }

    case 'import':
    case 'import-and-start': {
      const target = positionals[0];
      if (!target) throw new IngestError('import needs a path to a result package directory or zip');
      const resolved = path.resolve(process.env.QA_DASHBOARD_INVOKE_CWD ?? process.cwd(), target);
      const summaries = await importPath(resolved, { paths, replace: flags.replace === true, logger: log });
      for (const s of summaries) {
        log.info(`imported ${s.runId}: ${s.counts.passed} passed, ${s.counts.failed} failed, ${s.counts.flaky} flaky, ${s.counts.skipped} skipped, ${s.artifacts} artifacts`);
      }
      if (command === 'import') return;
      await start(flags, paths);
      return;
    }

    case 'package': {
      const packageDir = path.resolve(paths.repoRoot, DEFAULT_PACKAGE_DIR);
      if (!fs.existsSync(path.join(packageDir, RESULTS_FILE))) {
        throw new IngestError(`no package found at ${packageDir}. Run the tests with QA_DASHBOARD_MODE=package first.`);
      }
      const out = path.resolve(process.env.QA_DASHBOARD_INVOKE_CWD ?? paths.repoRoot, typeof flags.out === 'string' ? flags.out : `${DEFAULT_PACKAGE_DIR}.zip`);
      await zipDirectory(packageDir, out);
      log.info(`package zipped to ${out}`);
      return;
    }

    case 'seed': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { seedDemoData } = require('../database/seed/seed') as typeof SeedModule;
      const result = await seedDemoData({ paths, reset: flags.reset === true, logger: log });
      log.info(`seeded ${result.runs} demo runs (${result.tests} test executions, ${result.artifacts} artifacts)`);
      return;
    }

    case 'reset': {
      if (flags['demo-only'] === true) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { removeDemoData } = require('../database/seed/seed') as typeof SeedModule;
        const removed = removeDemoData({ paths, logger: log });
        log.info(`removed ${removed} demo runs`);
        return;
      }
      if (flags.yes !== true) {
        log.warn(`this deletes ${paths.dataDir} (database + all artifacts). Re-run with --yes to confirm.`);
        return;
      }
      fs.rmSync(paths.dataDir, { recursive: true, force: true });
      log.info(`removed ${paths.dataDir}`);
      return;
    }

    case 'start':
    default:
      await start(flags, paths);
  }
}

async function start(flags: Record<string, string | boolean>, paths: ReturnType<typeof resolveDashboardPaths>): Promise<void> {
  const port = typeof flags.port === 'string' ? Number(flags.port) : undefined;
  const host = typeof flags.host === 'string' ? flags.host : undefined;
  if (flags['no-build'] !== true) ensureFrontendBuilt();
  const { url } = await startServer({ port, host, dataDir: paths.dataDir, staticDir: DEFAULT_STATIC_DIR });
  if (flags.open === true) openBrowser(url);
}

/** Build the React app on first start (or when sources are newer than the build). */
function ensureFrontendBuilt(): void {
  const root = path.join(__dirname, '..');
  const indexHtml = path.join(DEFAULT_STATIC_DIR, 'index.html');
  const srcDir = path.join(root, 'app', 'src');
  const needsBuild = !fs.existsSync(indexHtml) || newestMtime(srcDir) > fs.statSync(indexHtml).mtimeMs;
  if (!needsBuild) return;
  log.info('building the dashboard frontend (first start or sources changed)…');
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '--config', 'app/vite.config.ts'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    log.error('frontend build failed; the API will still start but the UI will be unavailable');
  }
}

function newestMtime(dir: string): number {
  let newest = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : fs.statSync(p).mtimeMs);
  }
  return newest;
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawnSync(cmd, args, { stdio: 'ignore' });
}

main().catch((err: unknown) => {
  if (err instanceof IngestError) log.error(err.message);
  else log.error((err as Error).stack ?? String(err));
  process.exit(1);
});
