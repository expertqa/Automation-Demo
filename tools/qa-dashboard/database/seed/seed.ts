import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../client';
import { ArtifactStore } from '../../artifacts/store';
import { PackageWriter } from '../../ingest/package-writer';
import { deleteRun, ingestPackage } from '../../ingest/ingest-package';
import { normalizeRepositoryUrl } from '../../shared/github';
import type { DashboardPaths } from '../../shared/paths';
import { ensureDashboardDirs } from '../../shared/paths';
import { countOutcomes, resolveRunStatus } from '../../shared/status';
import type { AttemptStatus, PackageAttemptRecord, PackageTestRecord, ResultPackage, TestOutcome } from '../../shared/types';
import { PACKAGE_FORMAT_VERSION } from '../../shared/types';
import type { Logger } from '../../server/logger';
import { createLogger } from '../../server/logger';
import { builtinInventory, scanSpecFiles, type InventoryTest } from './inventory';

/**
 * Demo data generator. Produces a month of realistic history that mirrors the
 * repository's real spec inventory. Every run is tagged source='demo' so it can
 * be removed with one command and never mixes with real results.
 */
export interface SeedOptions {
  paths: DashboardPaths;
  runs?: number;
  reset?: boolean;
  logger?: Logger;
  now?: Date;
  seed?: number;
}

const ASSETS = path.join(__dirname, 'assets');

/** Deterministic PRNG (mulberry32) so seeds are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Profile = 'stable' | 'flaky' | 'regressed' | 'unreliable' | 'slow';

const ERRORS: { message: string; snippet: (file: string, line: number) => string }[] = [
  {
    message:
      "Error: expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Create funnel' })\nExpected: visible\nReceived: hidden\nTimeout: 15000ms\n\nCall log:\n  - Expect \"toBeVisible\" with timeout 15000ms\n  - waiting for getByRole('button', { name: 'Create funnel' })\n    14 × locator resolved to <button class=\"btn btn-primary\" style=\"display:none\">…</button>\n       - unexpected value \"hidden\"",
    snippet: (file, line) => `  ${line - 1} |     await page.goto('/studio/funnels');\n> ${line} |     await expect(page.getByRole('button', { name: 'Create funnel' })).toBeVisible();\n      |                                                                          ^\n  ${line + 1} |   });\n    at ${file}:${line}:74`,
  },
  {
    message:
      "Error: expect(page).toHaveURL(expected) failed\n\nExpected pattern: /\\/studio\\/funnels\\/\\d+\\?view=kanban/\nReceived string:  \"https://automationqa-7082.acceptmission.com/studio/funnels\"\nTimeout: 15000ms",
    snippet: (file, line) => `  ${line - 1} |     const { funnelName } = await funnelPage.createFunnel();\n> ${line} |     await expect(page, 'Should land on the funnel Kanban view').toHaveURL(/\\/studio\\/funnels\\/\\d+\\?view=kanban/);\n      |                                                                ^\n    at ${file}:${line}:64`,
  },
  {
    message:
      "TimeoutError: locator.click: Timeout 100000ms exceeded.\nCall log:\n  - waiting for getByText('Too many requests, please try again')\n  - locator resolved to <div class=\"toast toast-error\">Too many requests, please try again in 30s</div>\n  - attempting click action\n    - waiting for element to be visible, enabled and stable\n    - element is not stable",
    snippet: (file, line) => `> ${line} |     await page.getByRole('button', { name: 'Save' }).click();\n      |                                                     ^\n    at ${file}:${line}:53`,
  },
  {
    message: 'Error: Rich text editor "Idea description" never became interactable.\nScreenshot saved to rich-text-timeout-Idea-description.png.\niframes on page at failure time: 2.\nlocator.fill: Timeout 30000ms exceeded.',
    snippet: (file, line) => `> ${line} |     await ideaPage.fillDetailsSection();\n      |                    ^\n    at ${file}:${line}:20`,
  },
  {
    message: 'Test timeout of 240000ms exceeded.',
    snippet: (file, line) => `> ${line} |     await page.waitForURL(/campaign-\\d+\\/settings/);\n      |                ^\n    at ${file}:${line}:16`,
  },
];

function pick<T>(random: () => number, arr: T[]): T {
  return arr[Math.floor(random() * arr.length)]!;
}

export async function seedDemoData(options: SeedOptions): Promise<{ runs: number; tests: number; artifacts: number }> {
  const log = options.logger ?? createLogger('seed');
  const paths = options.paths;
  ensureDashboardDirs(paths);
  const handle = openDatabase(paths.databaseFile);
  const store = new ArtifactStore(paths.artifactsDir);
  try {
    if (options.reset) removeDemoRuns(handle, store);
    const random = rng(options.seed ?? 42);
    const now = options.now ?? new Date();
    const runCount = options.runs ?? 24;
    const repoRoot = paths.repoRoot;
    let inventory = scanSpecFiles(repoRoot);
    if (inventory.length < 4) inventory = builtinInventory();
    const repositoryUrl = detectRepoUrl(repoRoot) ?? 'https://github.com/raheelaofficial6/accept-mission-playwright';
    const headSha = detectHeadSha(repoRoot);

    // Assign behaviour profiles deterministically.
    const profiles = new Map<string, Profile>();
    inventory.forEach((t, i) => {
      const p: Profile = i % 7 === 2 ? 'flaky' : i % 7 === 4 ? 'regressed' : i % 7 === 6 ? 'unreliable' : i % 5 === 3 ? 'slow' : 'stable';
      profiles.set(t.testId, p);
    });

    let totalTests = 0;
    let totalArtifacts = 0;
    const tmpRoot = fs.mkdtempSync(path.join(paths.tmpDir, 'seed-'));
    for (let i = 0; i < runCount; i++) {
      // Oldest run first. Roughly one run per 30 hours with jitter, plus a couple of same-day feature-branch runs.
      const ageHours = (runCount - 1 - i) * 30 + random() * 8;
      const startedAt = new Date(now.getTime() - ageHours * 3_600_000);
      const isFeature = i % 6 === 4;
      const isLocal = i % 8 === 7;
      const branch = isFeature ? 'feature/campaign-settings' : 'main';
      const environment = isFeature ? 'staging' : 'qa';
      const sha = i === runCount - 1 && headSha ? headSha : fakeSha(random);
      const runId = `run_demo_${String(i + 1).padStart(3, '0')}_${sha.slice(0, 6)}`;

      const tests: PackageTestRecord[] = [];
      let cursor = startedAt.getTime();
      const remaining = runCount - 1 - i; // how many runs after this one
      for (const inv of inventory) {
        const profile = profiles.get(inv.testId) ?? 'stable';
        const { status, attempts } = simulate(profile, remaining, random, inv, cursor, i);
        cursor += attempts.reduce((a, b) => a + b.durationMs, 0) + 800;
        tests.push({
          testId: inv.testId,
          playwrightId: `${inv.testId.slice(0, 10)}-${inv.suiteId.slice(0, 8)}`,
          title: inv.title,
          titlePath: inv.titlePath,
          suite: inv.suite,
          suiteId: inv.suiteId,
          file: inv.file,
          line: inv.line,
          column: inv.column,
          project: 'chromium',
          browser: 'chromium',
          status,
          expectedStatus: 'passed',
          durationMs: attempts.reduce((a, b) => a + b.durationMs, 0),
          retries: Math.max(0, attempts.length - 1),
          tags: [],
          annotations: [],
          attempts,
        });
      }
      const counts = countOutcomes(tests);
      const finishedAt = new Date(cursor + 1500);
      const pkg: ResultPackage = {
        formatVersion: PACKAGE_FORMAT_VERSION,
        generator: { name: 'qa-dashboard-seed', version: '1.0.0' },
        run: {
          id: runId,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          status: resolveRunStatus(undefined, counts),
          environment,
          source: 'demo',
          git: {
            repositoryUrl,
            branch,
            commitSha: sha,
            commitMessage: pick(random, [
              'fix: stabilise funnel creation wait',
              'chore: bump playwright',
              'feat: campaign settings coverage',
              'test: add branding reset flow',
              'refactor: page objects for kanban',
              'ci: retry on rate limit',
            ]),
            commitAuthor: pick(random, ['raheelaofficial6', 'HumayunHM', 'ahsan']),
          },
          ci: isLocal
            ? null
            : {
                provider: 'github-actions',
                workflow: 'Playwright Tests',
                jobName: 'test',
                runId: String(17_000_000_000 + i * 1_337),
                runNumber: String(120 + i),
                runUrl: `${repositoryUrl}/actions/runs/${17_000_000_000 + i * 1_337}`,
                actor: pick(random, ['raheelaofficial6', 'HumayunHM']),
                eventName: isFeature ? 'pull_request' : 'push',
              },
          playwrightVersion: '1.61.1',
          nodeVersion: isLocal ? 'v22.23.2' : 'v20.19.0',
          os: isLocal ? { platform: 'darwin', release: '24.6.0', arch: 'arm64' } : { platform: 'linux', release: '6.8.0-1021-azure', arch: 'x64' },
          projects: [{ name: 'chromium', browser: 'chromium' }],
          metadata: { demo: true, workers: 1 },
        },
        counts,
        tests,
      };

      const pkgDir = path.join(tmpRoot, runId);
      const writer = new PackageWriter(pkgDir);
      for (const t of pkg.tests) {
        for (const a of t.attempts) {
          if (a.status === 'passed' || a.status === 'skipped') continue;
          const shot = writer.addAttachment({
            testId: t.testId,
            project: t.project,
            retry: a.index,
            name: 'screenshot',
            contentType: 'image/png',
            sourcePath: path.join(ASSETS, pick(random, ['screenshot-discount.png', 'screenshot-payment.png', 'screenshot-timeout.png'])),
            multiProject: false,
          });
          const video = writer.addAttachment({ testId: t.testId, project: t.project, retry: a.index, name: 'video', contentType: 'video/webm', sourcePath: path.join(ASSETS, 'video.webm'), multiProject: false });
          const trace = writer.addAttachment({ testId: t.testId, project: t.project, retry: a.index, name: 'trace', contentType: 'application/zip', sourcePath: path.join(ASSETS, 'trace.zip'), multiProject: false });
          const ctx = writer.addAttachment({ testId: t.testId, project: t.project, retry: a.index, name: 'error-context', contentType: 'text/markdown', sourcePath: path.join(ASSETS, 'error-context.md'), multiProject: false });
          for (const rec of [shot, video, trace, ctx]) if (rec) a.attachments.push(rec);
        }
      }
      writer.writeResults(pkg);
      const summary = await ingestPackage(pkg, pkgDir, { paths, dbHandle: handle, moveArtifacts: true, removePackageDir: true, replace: true, sourceOverride: 'demo', logger: log.child('ingest') });
      totalTests += summary.tests;
      totalArtifacts += summary.artifacts;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    return { runs: runCount, tests: totalTests, artifacts: totalArtifacts };
  } finally {
    handle.close();
  }
}

function simulate(
  profile: Profile,
  runsAfter: number,
  random: () => number,
  inv: InventoryTest,
  startMs: number,
  runIndex: number,
): { status: TestOutcome; attempts: PackageAttemptRecord[] } {
  const base = profile === 'slow' ? 95_000 : 18_000 + (inv.title.length % 7) * 4_000;
  const dur = () => Math.round(base * (0.8 + random() * 0.5));
  const attempt = (index: number, status: AttemptStatus, withError: boolean): PackageAttemptRecord => {
    const err = withError ? pick(random, ERRORS) : null;
    const d = status === 'timedOut' ? 240_000 : dur();
    const stdoutLines = [`🔄 Retry number: ${index}`, `navigating to /login`, `login as acceptqatest+automationtest80@mailinator.com`];
    if (withError) stdoutLines.push('⏳ Rate limited (hit 1/5) — waiting 80s...');
    return {
      index,
      status,
      startedAt: new Date(startMs + index * (d + 500)).toISOString(),
      durationMs: d,
      workerIndex: 0,
      parallelIndex: 0,
      errors: err
        ? [
            {
              message: err.message,
              stack: `${err.message.split('\n')[0]}\n    at ${inv.file}:${inv.line}:${inv.column}\n    at TestCase.run (node_modules/playwright/lib/runner/testCase.js:112:18)`,
              snippet: err.snippet(inv.file, inv.line),
              location: { file: inv.file, line: inv.line, column: inv.column },
            },
          ]
        : [],
      stdout: stdoutLines.join('\n') + '\n',
      stderr: withError ? `Warning: ${inv.title} hit the application rate limiter\n` : '',
      attachments: [],
      steps: inv.titlePath.length
        ? [
            { title: `${inv.title.split(' — ')[0]}.1 Open page`, category: 'test.step', durationMs: Math.round(d * 0.2), error: null, depth: 0 },
            { title: `${inv.title.split(' — ')[0]}.2 Perform action`, category: 'test.step', durationMs: Math.round(d * 0.5), error: withError ? err!.message.split('\n')[0]! : null, depth: 0 },
            { title: `${inv.title.split(' — ')[0]}.3 Verify result`, category: 'test.step', durationMs: Math.round(d * 0.3), error: null, depth: 0 },
          ]
        : [],
    };
  };
  const r = random();
  switch (profile) {
    case 'flaky':
      if (r < 0.35) return { status: 'flaky', attempts: [attempt(0, 'failed', true), attempt(1, 'passed', false)] };
      if (r < 0.39) return { status: 'failed', attempts: [attempt(0, 'failed', true), attempt(1, 'failed', true), attempt(2, 'failed', true)] };
      return { status: 'passed', attempts: [attempt(0, 'passed', false)] };
    case 'regressed':
      // Green for most of history, failing in the last four runs.
      if (runsAfter < 4) return { status: r < 0.3 ? 'timedOut' : 'failed', attempts: [attempt(0, r < 0.3 ? 'timedOut' : 'failed', true), attempt(1, 'failed', true), attempt(2, 'failed', true)] };
      return { status: 'passed', attempts: [attempt(0, 'passed', false)] };
    case 'unreliable':
      if (r < 0.22) return { status: 'failed', attempts: [attempt(0, 'failed', true), attempt(1, 'failed', true), attempt(2, 'failed', true)] };
      if (r < 0.4) return { status: 'flaky', attempts: [attempt(0, 'failed', true), attempt(1, 'passed', false)] };
      return { status: 'passed', attempts: [attempt(0, 'passed', false)] };
    case 'slow':
      if (runIndex % 9 === 5) return { status: 'skipped', attempts: [{ ...attempt(0, 'skipped', false), durationMs: 0 }] };
      return { status: 'passed', attempts: [attempt(0, 'passed', false)] };
    default:
      if (r < 0.03) return { status: 'flaky', attempts: [attempt(0, 'failed', true), attempt(1, 'passed', false)] };
      return { status: 'passed', attempts: [attempt(0, 'passed', false)] };
  }
}

function fakeSha(random: () => number): string {
  let s = '';
  for (let i = 0; i < 40; i++) s += Math.floor(random() * 16).toString(16);
  return s;
}

function detectRepoUrl(repoRoot: string): string | null {
  try {
    return normalizeRepositoryUrl(execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {
    return null;
  }
}

function detectHeadSha(repoRoot: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function removeDemoRuns(handle: ReturnType<typeof openDatabase>, store: ArtifactStore): number {
  const ids = handle.sqlite.prepare("SELECT id FROM runs WHERE source = 'demo'").all() as { id: string }[];
  for (const { id } of ids) deleteRun(handle.db, store, id);
  return ids.length;
}

export function removeDemoData(options: { paths: DashboardPaths; logger?: Logger }): number {
  ensureDashboardDirs(options.paths);
  const handle = openDatabase(options.paths.databaseFile);
  try {
    return removeDemoRuns(handle, new ArtifactStore(options.paths.artifactsDir));
  } finally {
    handle.close();
  }
}
