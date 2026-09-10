import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import type { PackageTestRecord, ResultPackage, RunSource } from '../shared/types';
import { PACKAGE_FORMAT_VERSION } from '../shared/types';
import { newRunId } from '../shared/identity';
import { countOutcomes, resolveRunStatus } from '../shared/status';
import { DEFAULT_PACKAGE_DIR } from '../shared/package-format';
import { resolveDashboardPaths } from '../shared/paths';
import { detectCi } from './ci/adapters';
import { gitTopLevel, resolveGitContext } from './git-info';
import { browserForProject, collectTest, type CollectedAttachment } from './collector';
import { PackageWriter } from '../ingest/package-writer';
import type * as IngestModule from '../ingest/ingest-package';

export type ReporterMode = 'auto' | 'local' | 'package' | 'off';

export interface QaDashboardReporterOptions {
  /** auto (default): package on CI, local otherwise. */
  mode?: ReporterMode;
  /** Where dashboard-data lives (local mode). Defaults to <repo>/dashboard-data. */
  dataDir?: string;
  /** Where the portable package is written (package mode). Defaults to <repo>/playwright-dashboard-results. */
  packageDir?: string;
  /** Environment label, e.g. "qa", "staging". Defaults to QA_DASHBOARD_ENV or "ci"/"local". */
  environment?: string;
  /** Override the repository URL used for GitHub links. */
  repositoryUrl?: string;
  quiet?: boolean;
}

const REPORTER_VERSION = '1.0.0';

/**
 * QA Dashboard reporter.
 *
 * Runs alongside the existing html/junit reporters. It never throws into the
 * Playwright process: any failure is logged and the test run continues.
 */
export default class QaDashboardReporter implements Reporter {
  private readonly options: QaDashboardReporterOptions;
  private config!: FullConfig;
  private rootSuite!: Suite;
  private repoRoot = process.cwd();
  private runId = newRunId();
  private startedAt = new Date();
  private readonly records: PackageTestRecord[] = [];
  private readonly attachments: CollectedAttachment[] = [];
  private mode: Exclude<ReporterMode, 'auto'> = 'local';

  constructor(options: QaDashboardReporterOptions = {}) {
    this.options = options;
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.rootSuite = suite;
    this.startedAt = new Date();
    this.repoRoot = gitTopLevel(config.rootDir) ?? config.rootDir;
    this.mode = this.resolveMode();
    if (this.mode !== 'off' && !this.options.quiet) {
      this.log(`run ${this.runId} (${this.mode} mode)`);
    }
  }

  onTestEnd(test: TestCase, _result: TestResult): void {
    if (this.mode === 'off') return;
    try {
      const { record, attachments } = collectTest(test, { config: this.config, repoRoot: this.repoRoot });
      // A test may end more than once with repeatEach; keep the latest record per (testId, project).
      const idx = this.records.findIndex((r) => r.testId === record.testId && r.project === record.project);
      if (idx >= 0) this.records[idx] = record;
      else this.records.push(record);
      // Replace attachments for this test/project.
      for (let i = this.attachments.length - 1; i >= 0; i--) {
        const a = this.attachments[i]!;
        if (a.testId === record.testId && a.project === record.project) this.attachments.splice(i, 1);
      }
      this.attachments.push(...attachments);
    } catch (err) {
      this.warn(`failed to collect ${test.title}: ${(err as Error).message}`);
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    if (this.mode === 'off') return;
    if (this.records.length === 0) {
      // e.g. `playwright test --list` or a filter that matched nothing — nothing worth recording.
      this.log('no test results collected; nothing recorded');
      return;
    }
    try {
      const pkg = this.buildPackage(result);
      const packageDir = this.mode === 'package' ? this.packageDir() : path.join(this.paths().packagesDir, this.runId);
      const writer = new PackageWriter(packageDir);
      const multiProject = new Set(this.records.map((r) => r.project)).size > 1;
      for (const att of this.attachments) {
        const rec = writer.addAttachment({
          testId: att.testId,
          project: att.project,
          retry: att.retry,
          name: att.name,
          contentType: att.contentType,
          sourcePath: att.path,
          body: att.body,
          multiProject,
        });
        if (!rec) continue;
        const test = pkg.tests.find((t) => t.testId === att.testId && t.project === att.project);
        const attempt = test?.attempts.find((a) => a.index === att.retry);
        attempt?.attachments.push(rec);
      }
      writer.writeResults(pkg);

      if (this.mode === 'package') {
        this.log(`result package written to ${packageDir}`);
        this.log(`import it with: npm run dashboard:import -- ${path.relative(this.repoRoot, packageDir) || '.'}`);
        return;
      }
      await this.ingestLocally(packageDir, pkg);
    } catch (err) {
      this.warn(`could not record run: ${(err as Error).stack ?? String(err)}`);
    }
  }

  // ---------------------------------------------------------------------------

  private resolveMode(): Exclude<ReporterMode, 'auto'> {
    const env = (process.env.QA_DASHBOARD_MODE ?? '').toLowerCase();
    const requested = (env || this.options.mode || 'auto') as ReporterMode;
    if (requested !== 'auto') return requested;
    return detectCi().ci ? 'package' : 'local';
  }

  private paths() {
    return resolveDashboardPaths({ dataDir: this.options.dataDir, repoRoot: this.repoRoot });
  }

  private packageDir(): string {
    const dir = process.env.QA_DASHBOARD_PACKAGE_DIR ?? this.options.packageDir ?? DEFAULT_PACKAGE_DIR;
    return path.resolve(this.repoRoot, dir);
  }

  private environment(): string {
    return process.env.QA_DASHBOARD_ENV ?? this.options.environment ?? (detectCi().ci ? 'ci' : 'local');
  }

  private buildPackage(result: FullResult): ResultPackage {
    const finishedAt = new Date();
    const { ci } = detectCi();
    const git = resolveGitContext(this.repoRoot, process.env, this.options.repositoryUrl ? { repositoryUrl: this.options.repositoryUrl } : {});
    // Fallback to Playwright's own git metadata if git CLI was unavailable.
    const meta = (this.config.metadata ?? {}) as { gitCommit?: { hash?: string; branch?: string; subject?: string; author?: { name?: string } } };
    if (meta.gitCommit) {
      git.commitSha ??= meta.gitCommit.hash ?? null;
      git.branch ??= meta.gitCommit.branch ?? null;
      git.commitMessage ??= meta.gitCommit.subject ?? null;
      git.commitAuthor ??= meta.gitCommit.author?.name ?? null;
    }
    const counts = countOutcomes(this.records);
    const projects = this.config.projects.map((p) => ({ name: p.name, browser: browserForProject(p) }));
    const source: RunSource = ci ? 'ci' : 'local';
    return {
      formatVersion: PACKAGE_FORMAT_VERSION,
      generator: { name: 'qa-dashboard-reporter', version: REPORTER_VERSION },
      run: {
        id: this.runId,
        startedAt: this.startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: result.duration ?? finishedAt.getTime() - this.startedAt.getTime(),
        status: resolveRunStatus(result.status, counts),
        environment: this.environment(),
        source,
        git,
        ci,
        playwrightVersion: this.config.version ?? null,
        nodeVersion: process.version,
        os: { platform: os.platform(), release: os.release(), arch: os.arch() },
        projects,
        metadata: {
          workers: this.config.workers,
          shard: this.config.shard ?? null,
          configFile: this.config.configFile ? path.relative(this.repoRoot, this.config.configFile) : null,
          totalTestsInSuite: this.rootSuite.allTests().length,
        },
      },
      counts,
      tests: this.records,
    };
  }

  private async ingestLocally(packageDir: string, pkg: ResultPackage): Promise<void> {
    const paths = this.paths();
    const depsInstalled = fs.existsSync(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
    if (!depsInstalled) {
      this.warn(`dashboard dependencies are not installed; package kept at ${packageDir}.`);
      this.warn(`run "npm run dashboard:install" once, then "npm run dashboard:import -- ${packageDir}".`);
      return;
    }
    // Lazy-load so the reporter itself has no hard dependency on the DB stack.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ingestPackageDirectory } = require('../ingest/ingest-package') as typeof IngestModule;
    const summary = await ingestPackageDirectory(packageDir, { paths, moveArtifacts: true, removePackageDir: true });
    this.log(
      `stored run ${summary.runId}: ${pkg.counts.passed} passed, ${pkg.counts.failed} failed, ${pkg.counts.flaky} flaky, ${pkg.counts.skipped} skipped → open with "npm run dashboard"`,
    );
  }

  private log(msg: string): void {
    if (!this.options.quiet) process.stdout.write(`[qa-dashboard] ${msg}\n`);
  }
  private warn(msg: string): void {
    process.stderr.write(`[qa-dashboard] warning: ${msg}\n`);
  }
}
