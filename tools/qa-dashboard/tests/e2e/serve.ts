import fs from 'node:fs';
import path from 'node:path';
import { seedDemoData } from '../../database/seed/seed';
import { resolveDashboardPaths } from '../../shared/paths';
import { silentLogger } from '../../server/logger';
import { DEFAULT_STATIC_DIR, startServer } from '../../server';

/** Fresh, deterministic demo data + server for the dashboard UI tests. */
async function main(): Promise<void> {
  const dataDir = path.join(__dirname, '.data');
  const repoRoot = path.join(__dirname, '..', '..', '..', '..');
  fs.rmSync(dataDir, { recursive: true, force: true });
  const paths = resolveDashboardPaths({ dataDir, repoRoot });
  await seedDemoData({ paths, runs: 12, logger: silentLogger, seed: 7 });
  if (!fs.existsSync(path.join(DEFAULT_STATIC_DIR, 'index.html'))) {
    throw new Error('Frontend build missing — run "npm run build" in tools/qa-dashboard first.');
  }
  await startServer({ port: Number(process.env.E2E_PORT ?? 3999), host: '127.0.0.1', dataDir, repoRoot, quiet: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
