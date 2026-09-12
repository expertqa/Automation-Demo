// QA Dashboard v1.5 CI reporter — decoupled bridge.
//
// The v1.5 dashboard app itself lives in its own separate repo (qa-sonic-dashboard),
// so it isn't present here to import from. This file is the one piece that MUST live
// in this test repo, because it runs inside the actual Playwright test process during
// CI. It reuses tools/qa-dashboard's (v1's) stable, unchanged utility modules — shared
// types/identity/status/package-format, the collector/git-info/CI-adapter helpers, and
// the package writer — rather than duplicating them. Nothing here reads from or writes
// to v1's dashboard-data; PackageWriter only ever writes to its own package directory.
import os from 'node:os';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import type { PackageTestRecord, ResultPackage, RunSource } from '../tools/qa-dashboard/shared/types';
import { PACKAGE_FORMAT_VERSION } from '../tools/qa-dashboard/shared/types';
import { newRunId } from '../tools/qa-dashboard/shared/identity';
import { countOutcomes, resolveRunStatus } from '../tools/qa-dashboard/shared/status';
import { DEFAULT_PACKAGE_DIR } from '../tools/qa-dashboard/shared/package-format';
import { detectCi } from '../tools/qa-dashboard/reporter/ci/adapters';
import { gitTopLevel, resolveGitContext } from '../tools/qa-dashboard/reporter/git-info';
import { browserForProject, collectTest, type CollectedAttachment } from '../tools/qa-dashboard/reporter/collector';
import { PackageWriter } from '../tools/qa-dashboard/ingest/package-writer';

export interface DashboardV15ReporterOptions {
  /** Where the portable package is written. Defaults to <repo>/playwright-dashboard-results-v15. */
  packageDir?: string;
  /** Environment label, e.g. "qa", "staging". Defaults to QA_DASHBOARD_ENV or "ci"/"local". */
  environment?: string;
  repositoryUrl?: string;
  quiet?: boolean;
}

const REPORTER_VERSION = '1.5.0';

function mapProgressStatus(status: TestResult['status']): 'passed' | 'failed' | 'skipped' {
  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  return 'failed'; // failed, timedOut, interrupted
}

/**
 * Always writes a package (there's no co-located "local" dashboard-data to ingest into
 * anymore, unlike v1) and posts best-effort progress callbacks when this is a
 * dashboard-v1.5-triggered run (DASHBOARD_RUN_ID/TOKEN/INGEST_URL all present). Never
 * throws into the Playwright process.
 */
export default class DashboardV15Reporter implements Reporter {
  private readonly options: DashboardV15ReporterOptions;
  private config!: FullConfig;
  private rootSuite!: Suite;
  private repoRoot = process.cwd();
  // A dashboard-triggered CI run pins this to the id created (and handed the ingestion
  // token for) at trigger time, so the eventual imported run id matches the live_runs.id
  // used during the live phase — no separate correlation lookup needed.
  private runId = process.env.DASHBOARD_RUN_ID || newRunId();
  private startedAt = new Date();
  private readonly records: PackageTestRecord[] = [];
  private readonly attachments: CollectedAttachment[] = [];

  constructor(options: DashboardV15ReporterOptions = {}) {
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
    if (!this.options.quiet) this.log(`run ${this.runId}`);
  }

  onTestBegin(test: TestCase): void {
    this.reportProgress(test, 'running');
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.reportProgress(test, mapProgressStatus(result.status));
    try {
      const { record, attachments } = collectTest(test, { config: this.config, repoRoot: this.repoRoot });
      const idx = this.records.findIndex((r) => r.testId === record.testId && r.project === record.project);
      if (idx >= 0) this.records[idx] = record;
      else this.records.push(record);
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
    if (this.records.length === 0) {
      this.log('no test results collected; nothing recorded');
      return;
    }
    try {
      const pkg = this.buildPackage(result);
      const packageDir = this.packageDir();
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
      this.log(`result package written to ${packageDir}`);
    } catch (err) {
      this.warn(`could not record run: ${(err as Error).stack ?? String(err)}`);
    }
  }

  // ---------------------------------------------------------------------------

  private packageDir(): string {
    const dir = process.env.QA_DASHBOARD_V15_PACKAGE_DIR ?? this.options.packageDir ?? DEFAULT_PACKAGE_DIR;
    return path.resolve(this.repoRoot, dir);
  }

  private environment(): string {
    return process.env.QA_DASHBOARD_ENV ?? this.options.environment ?? (detectCi().ci ? 'ci' : 'local');
  }

  private computeRunLabel(): string {
    const when = this.startedAt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const files = Array.from(new Set(this.records.map((r) => r.file)));
    const argv = process.argv.slice(2);
    const grepIdx = argv.findIndex((a) => a === '--grep' || a === '-g');
    const grepArg = grepIdx >= 0 ? argv[grepIdx + 1] : argv.find((a) => a.startsWith('--grep='))?.split('=').slice(1).join('=');
    let scope: string;
    if (grepArg) scope = `"${grepArg}"`;
    else if (files.length === 1) scope = `${path.basename(files[0]!, path.extname(files[0]!))} only`;
    else scope = 'Full Suite';
    return `${when} — ${scope}`;
  }

  private buildPackage(result: FullResult): ResultPackage {
    const finishedAt = new Date();
    const { ci } = detectCi();
    const git = resolveGitContext(this.repoRoot, process.env, this.options.repositoryUrl ? { repositoryUrl: this.options.repositoryUrl } : {});
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
      generator: { name: 'qa-dashboard-v1.5-reporter', version: REPORTER_VERSION },
      run: {
        id: this.runId,
        label: this.computeRunLabel(),
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

  /** Best-effort per-test progress line for the live-preview panel. No-op unless dashboard-triggered. */
  private reportProgress(test: TestCase, status: 'running' | 'passed' | 'failed' | 'skipped'): void {
    const runId = process.env.DASHBOARD_RUN_ID;
    const token = process.env.DASHBOARD_RUN_TOKEN;
    const ingestUrl = process.env.DASHBOARD_INGEST_URL;
    if (!runId || !token || !ingestUrl) return;
    const url = `${ingestUrl.replace(/\/$/, '')}/${runId}/progress`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ testId: test.id, title: test.title, status }),
    }).catch(() => {
      /* best-effort only */
    });
  }

  private log(msg: string): void {
    if (!this.options.quiet) process.stdout.write(`[qa-dashboard-v1.5] ${msg}\n`);
  }
  private warn(msg: string): void {
    process.stderr.write(`[qa-dashboard-v1.5] warning: ${msg}\n`);
  }
}
