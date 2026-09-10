import path from 'node:path';
import type { FullConfig, FullProject, Suite, TestCase, TestResult, TestStep, TestError } from '@playwright/test/reporter';
import type { AttemptStatus, PackageErrorRecord, PackageStepRecord, PackageTestRecord } from '../shared/types';
import { resolveSuiteName, stableTestId, suiteId, toPosixPath } from '../shared/identity';
import { resolveTestOutcome } from '../shared/status';
import { stripAnsi } from '../shared/format';

const MAX_STDIO_CHARS = 200_000;
const MAX_STEPS = 500;

export interface CollectedAttachment {
  testId: string;
  project: string;
  retry: number;
  name: string;
  contentType: string;
  /** Absolute path on disk (when Playwright wrote a file). */
  path?: string;
  /** Inline body (when Playwright kept it in memory). */
  body?: Buffer;
}

export interface TestLocationInfo {
  file: string; // relative, POSIX
  line: number;
  column: number | null;
}

/** Walk up from a test to collect describe titles (innermost last) and the file/project suites. */
export function describeChain(test: TestCase): { describes: string[]; fileSuite: Suite | null; project: FullProject | undefined } {
  const describes: string[] = [];
  let fileSuite: Suite | null = null;
  let s: Suite | undefined = test.parent;
  while (s) {
    if (s.type === 'describe') describes.unshift(s.title);
    if (s.type === 'file') fileSuite = s;
    s = s.parent;
  }
  return { describes, fileSuite, project: test.parent.project() };
}

export function browserForProject(project: FullProject | undefined): string | null {
  if (!project) return null;
  const use = project.use as { browserName?: string; defaultBrowserType?: string; channel?: string };
  const browser = use.browserName ?? use.defaultBrowserType ?? 'chromium';
  return use.channel ? `${browser} (${use.channel})` : browser;
}

export function relativeLocation(test: TestCase, rootDir: string): TestLocationInfo {
  const rel = toPosixPath(path.relative(rootDir, test.location.file));
  return { file: rel.startsWith('..') ? toPosixPath(test.location.file) : rel, line: test.location.line, column: test.location.column ?? null };
}

function stdio(chunks: Array<string | Buffer>): string {
  const text = chunks.map((c) => (Buffer.isBuffer(c) ? c.toString('utf8') : c)).join('');
  const clean = stripAnsi(text);
  return clean.length > MAX_STDIO_CHARS ? `${clean.slice(0, MAX_STDIO_CHARS)}\n…[truncated]` : clean;
}

export function mapError(err: TestError, rootDir: string): PackageErrorRecord {
  const message = stripAnsi(err.message ?? (err.value !== undefined ? String(err.value) : 'Unknown error'));
  return {
    message,
    stack: err.stack ? stripAnsi(err.stack) : null,
    snippet: err.snippet ? stripAnsi(err.snippet) : null,
    location: err.location
      ? { file: toPosixPath(path.relative(rootDir, err.location.file)), line: err.location.line, column: err.location.column }
      : null,
  };
}

export function flattenSteps(steps: TestStep[], depth = 0, out: PackageStepRecord[] = []): PackageStepRecord[] {
  for (const step of steps) {
    if (out.length >= MAX_STEPS) break;
    // Keep the signal: test.step() blocks and hooks. Skip pw:api / expect / fixture noise.
    if (step.category !== 'test.step' && step.category !== 'hook') continue;
    out.push({
      title: step.title,
      category: step.category,
      durationMs: step.duration,
      error: step.error ? stripAnsi(step.error.message ?? '') : null,
      depth,
    });
    flattenSteps(step.steps, depth + 1, out);
  }
  return out;
}

export interface CollectorContext {
  config: FullConfig;
  /** Root used for relative paths (git top-level when available, else config.rootDir). */
  repoRoot: string;
}

/**
 * Build the package record for a finished test case. Attachments are returned
 * separately so the caller can copy them into the package.
 */
export function collectTest(test: TestCase, ctx: CollectorContext): { record: PackageTestRecord; attachments: CollectedAttachment[] } {
  const { describes, project } = describeChain(test);
  const location = relativeLocation(test, ctx.repoRoot);
  const projectName = project?.name ?? '';
  const testId = stableTestId(location.file, [...describes, test.title]);
  const suiteName = resolveSuiteName(location.file, describes);
  const results = test.results;
  const attempts = results.map((r: TestResult) => ({
    index: r.retry,
    status: r.status as AttemptStatus,
    startedAt: r.startTime.toISOString(),
    durationMs: r.duration,
    workerIndex: r.workerIndex ?? null,
    parallelIndex: r.parallelIndex ?? null,
    errors: r.errors.map((e) => mapError(e, ctx.repoRoot)),
    stdout: stdio(r.stdout),
    stderr: stdio(r.stderr),
    attachments: [] as PackageTestRecord['attempts'][number]['attachments'],
    steps: flattenSteps(r.steps),
  }));

  const attachments: CollectedAttachment[] = [];
  results.forEach((r) => {
    r.attachments.forEach((a) => {
      if (!a.path && !a.body) return;
      attachments.push({ testId, project: projectName, retry: r.retry, name: a.name, contentType: a.contentType, path: a.path, body: a.body });
    });
  });

  const status = resolveTestOutcome(test.outcome(), attempts, test.expectedStatus as AttemptStatus);
  const record: PackageTestRecord = {
    testId,
    playwrightId: test.id,
    title: test.title,
    titlePath: [...describes, test.title],
    suite: suiteName,
    suiteId: suiteId(suiteName),
    file: location.file,
    line: location.line,
    column: location.column,
    project: projectName,
    browser: browserForProject(project),
    status,
    expectedStatus: test.expectedStatus as AttemptStatus,
    durationMs: attempts.reduce((acc, a) => acc + a.durationMs, 0),
    retries: Math.max(0, attempts.length - 1),
    tags: test.tags,
    annotations: test.annotations.map((a) => ({ type: a.type, description: a.description ?? null })),
    attempts,
  };
  return { record, attachments };
}
