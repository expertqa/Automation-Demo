import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PackageWriter } from '../../ingest/package-writer';
import type { DashboardPaths } from '../../shared/paths';
import { stableTestId, suiteId } from '../../shared/identity';
import { countOutcomes, resolveRunStatus } from '../../shared/status';
import type { PackageAttemptRecord, PackageTestRecord, ResultPackage, TestOutcome } from '../../shared/types';
import { PACKAGE_FORMAT_VERSION } from '../../shared/types';

export function tempPaths(): DashboardPaths & { cleanup: () => void } {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-dash-'));
  return {
    repoRoot: dataDir,
    dataDir,
    databaseFile: path.join(dataDir, 'dashboard.sqlite'),
    artifactsDir: path.join(dataDir, 'artifacts'),
    packagesDir: path.join(dataDir, 'packages'),
    tmpDir: path.join(dataDir, 'tmp'),
    cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }),
  };
}

export interface FakeTestSpec {
  file: string;
  title: string;
  describes?: string[];
  status: TestOutcome;
  attempts?: PackageAttemptRecord['status'][];
  withArtifacts?: boolean;
  durationMs?: number;
}

export function makeTest(spec: FakeTestSpec, startedAt: string): PackageTestRecord {
  const describes = spec.describes ?? [];
  const testId = stableTestId(spec.file, [...describes, spec.title]);
  const suite = describes[0] ?? 'Suite';
  const statuses = spec.attempts ?? (spec.status === 'flaky' ? ['failed', 'passed'] : spec.status === 'skipped' ? ['skipped'] : spec.status === 'passed' ? ['passed'] : ['failed']);
  const attempts: PackageAttemptRecord[] = statuses.map((status, index) => ({
    index,
    status,
    startedAt,
    durationMs: spec.durationMs ?? 1000,
    workerIndex: 0,
    parallelIndex: 0,
    errors: status === 'failed' || status === 'timedOut' ? [{ message: `Error: expect(locator).toBeVisible() failed\nfor ${spec.title}`, stack: 'Error: x\n    at file:1:1', snippet: '> 1 | x', location: { file: spec.file, line: 10, column: 3 } }] : [],
    stdout: status === 'failed' ? 'some stdout\n' : '',
    stderr: '',
    attachments: [],
    steps: [],
  }));
  return {
    testId,
    playwrightId: `${testId}-pw`,
    title: spec.title,
    titlePath: [...describes, spec.title],
    suite,
    suiteId: suiteId(suite),
    file: spec.file,
    line: 10,
    column: 3,
    project: 'chromium',
    browser: 'chromium',
    status: spec.status,
    expectedStatus: 'passed',
    durationMs: attempts.reduce((a, b) => a + b.durationMs, 0),
    retries: attempts.length - 1,
    tags: [],
    annotations: [],
    attempts,
  };
}

export function makePackage(opts: { runId: string; startedAt?: string; tests: FakeTestSpec[]; branch?: string; environment?: string; sha?: string; repo?: string | null }): ResultPackage {
  const startedAt = opts.startedAt ?? new Date().toISOString();
  const tests = opts.tests.map((t) => makeTest(t, startedAt));
  const counts = countOutcomes(tests);
  return {
    formatVersion: PACKAGE_FORMAT_VERSION,
    generator: { name: 'test', version: '0' },
    run: {
      id: opts.runId,
      label: opts.runId,
      startedAt,
      finishedAt: new Date(Date.parse(startedAt) + 60_000).toISOString(),
      durationMs: 60_000,
      status: resolveRunStatus('passed', counts),
      environment: opts.environment ?? 'qa',
      source: 'local',
      git: { repositoryUrl: opts.repo === undefined ? 'https://github.com/org/repo' : opts.repo, branch: opts.branch ?? 'main', commitSha: opts.sha ?? 'abcdef1234567890', commitMessage: 'msg', commitAuthor: 'me' },
      ci: null,
      playwrightVersion: '1.61.1',
      nodeVersion: 'v22',
      os: { platform: 'linux', release: '6', arch: 'x64' },
      projects: [{ name: 'chromium', browser: 'chromium' }],
      metadata: {},
    },
    counts,
    tests,
  };
}

/** Write a package directory with real (tiny) artifact files for failed attempts. */
export function writePackage(pkg: ResultPackage, dir: string, withArtifacts = true): string {
  const writer = new PackageWriter(dir);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-att-'));
  const png = path.join(tmp, 'shot.png');
  fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));
  const webm = path.join(tmp, 'video.webm');
  fs.writeFileSync(webm, Buffer.alloc(2048, 1));
  const zip = path.join(tmp, 'trace.zip');
  fs.writeFileSync(zip, Buffer.from('504b0506' + '00'.repeat(18), 'hex'));
  for (const t of pkg.tests) {
    for (const a of t.attempts) {
      if (!withArtifacts || a.status === 'passed' || a.status === 'skipped') continue;
      for (const [name, ct, src] of [
        ['screenshot', 'image/png', png],
        ['video', 'video/webm', webm],
        ['trace', 'application/zip', zip],
      ] as const) {
        const rec = writer.addAttachment({ testId: t.testId, project: t.project, retry: a.index, name, contentType: ct, sourcePath: src, multiProject: false });
        if (rec) a.attachments.push(rec);
      }
      const body = writer.addAttachment({ testId: t.testId, project: t.project, retry: a.index, name: 'error-context', contentType: 'text/markdown', body: Buffer.from('# context'), multiProject: false });
      if (body) a.attachments.push(body);
    }
  }
  writer.writeResults(pkg);
  fs.rmSync(tmp, { recursive: true, force: true });
  return dir;
}
