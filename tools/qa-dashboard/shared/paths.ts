import fs from 'node:fs';
import path from 'node:path';

/** Directory of the Playwright project (the repository root that owns playwright.config). */
export function resolveRepoRoot(start: string = __dirname): string {
  if (process.env.QA_DASHBOARD_REPO_ROOT) return path.resolve(process.env.QA_DASHBOARD_REPO_ROOT);
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const hasConfig = fs
      .readdirSync(dir, { withFileTypes: true })
      .some((d) => d.isFile() && /^playwright\.config\.(js|ts|mjs|cjs|mts|cts)$/.test(d.name));
    if (hasConfig) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: tools/qa-dashboard/../..
  return path.resolve(__dirname, '..', '..', '..');
}

export interface DashboardPaths {
  repoRoot: string;
  dataDir: string;
  databaseFile: string;
  artifactsDir: string;
  packagesDir: string;
  tmpDir: string;
}

export function resolveDashboardPaths(overrides: { dataDir?: string; repoRoot?: string } = {}): DashboardPaths {
  const repoRoot = overrides.repoRoot ?? resolveRepoRoot();
  const dataDir = path.resolve(overrides.dataDir ?? process.env.QA_DASHBOARD_DATA_DIR ?? path.join(repoRoot, 'dashboard-data'));
  return {
    repoRoot,
    dataDir,
    databaseFile: path.join(dataDir, 'dashboard.sqlite'),
    artifactsDir: path.join(dataDir, 'artifacts'),
    packagesDir: path.join(dataDir, 'packages'),
    tmpDir: path.join(dataDir, 'tmp'),
  };
}

export function ensureDashboardDirs(p: DashboardPaths): void {
  for (const dir of [p.dataDir, p.artifactsDir, p.packagesDir, p.tmpDir]) fs.mkdirSync(dir, { recursive: true });
}
