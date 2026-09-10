import fs from 'node:fs';
import path from 'node:path';
import { resolveSuiteName, stableTestId, suiteId, toPosixPath } from '../../shared/identity';

export interface InventoryTest {
  testId: string;
  title: string;
  titlePath: string[];
  suite: string;
  suiteId: string;
  file: string;
  line: number;
  column: number;
}

/**
 * Scan the repository's spec files so demo data mirrors the real test inventory
 * (titles, files and line numbers → working GitHub links).
 */
export function scanSpecFiles(repoRoot: string, dirs = ['tests', 'unstable']): InventoryTest[] {
  const out: InventoryTest[] = [];
  for (const dir of dirs) {
    const abs = path.join(repoRoot, dir);
    if (!fs.existsSync(abs)) continue;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(spec|test)\.[cm]?[jt]sx?$/.test(entry.name)) continue;
      const file = toPosixPath(path.join(dir, entry.name));
      const lines = fs.readFileSync(path.join(abs, entry.name), 'utf8').split(/\r?\n/);
      const describes: string[] = [];
      lines.forEach((line, i) => {
        const d = /test\.describe(?:\.(?:serial|parallel|only|skip))?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(line);
        if (d) describes.push(d[2]!);
        const m = /^\s*test(?:\.(?:only|skip|fixme))?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(line);
        if (!m) return;
        const title = m[2]!;
        const titlePath = [...describes, title];
        const suite = resolveSuiteName(file, describes);
        out.push({
          testId: stableTestId(file, titlePath),
          title,
          titlePath,
          suite,
          suiteId: suiteId(suite),
          file,
          line: i + 1,
          column: line.indexOf('test') + 1,
        });
      });
    }
  }
  return out;
}

/** Fallback inventory used when no spec files are found. */
export function builtinInventory(): InventoryTest[] {
  const specs: Record<string, string[]> = {
    'tests/01-login.spec.js': ['TC-01 — Login'],
    'tests/02-createFunnel.spec.js': ['TC-02 — Funnel, Idea & Kanban'],
    'tests/03-createProject.spec.js': ['TC-03 — Project'],
    'tests/04-automation.spec.js': ['TC-04 — Automation rules'],
    'tests/05-branding.spec.js': ['TC-05 — Branding', 'TC-05b — Branding reset'],
    'tests/07-campaign.spec.js': ['TC-07 — Campaign'],
  };
  const out: InventoryTest[] = [];
  for (const [file, titles] of Object.entries(specs)) {
    titles.forEach((title, i) => {
      const suite = resolveSuiteName(file, []);
      out.push({ testId: stableTestId(file, [title]), title, titlePath: [title], suite, suiteId: suiteId(suite), file, line: 12 + i * 40, column: 1 });
    });
  }
  return out;
}
