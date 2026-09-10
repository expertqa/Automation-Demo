import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FullConfig, FullProject, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { collectTest, flattenSteps, mapError } from '../../reporter/collector';
import { AzurePipelinesAdapter, GitHubActionsAdapter, detectCi } from '../../reporter/ci/adapters';
import { resolveGitContext } from '../../reporter/git-info';
import { PackageWriter } from '../../ingest/package-writer';
import { RESULTS_FILE } from '../../shared/package-format';
import { stableTestId } from '../../shared/identity';

/** Minimal fake Playwright objects — enough for the collector. */
function fakeSuiteChain(file: string, describes: string[], project: FullProject) {
  const root = { type: 'root', title: '', parent: undefined, project: () => undefined } as unknown as Suite;
  const proj = { type: 'project', title: project.name, parent: root, project: () => project } as unknown as Suite;
  const fileSuite = { type: 'file', title: file, parent: proj, project: () => project } as unknown as Suite;
  let parent = fileSuite;
  for (const d of describes) parent = { type: 'describe', title: d, parent, project: () => project } as unknown as Suite;
  return parent;
}

function fakeTest(opts: { file: string; title: string; describes?: string[]; results: Partial<TestResult>[]; outcome: 'expected' | 'unexpected' | 'flaky' | 'skipped'; rootDir: string }): TestCase {
  const project = { name: 'chromium', use: { browserName: 'chromium', channel: undefined } } as unknown as FullProject;
  const parent = fakeSuiteChain(opts.file, opts.describes ?? [], project);
  const results = opts.results.map((r, i) => ({
    retry: i,
    status: 'passed',
    startTime: new Date('2026-01-01T00:00:00Z'),
    duration: 100,
    workerIndex: 0,
    parallelIndex: 0,
    errors: [],
    stdout: [],
    stderr: [],
    attachments: [],
    steps: [],
    annotations: [],
    ...r,
  })) as TestResult[];
  return {
    id: 'pw-id',
    title: opts.title,
    parent,
    location: { file: path.join(opts.rootDir, opts.file), line: 42, column: 5 },
    results,
    outcome: () => opts.outcome,
    expectedStatus: 'passed',
    tags: ['@smoke'],
    annotations: [{ type: 'slow', description: 'yes' }],
    titlePath: () => ['', 'chromium', opts.file, ...(opts.describes ?? []), opts.title],
  } as unknown as TestCase;
}

describe('collector', () => {
  const rootDir = '/repo';
  const config = { rootDir } as FullConfig;

  it('collects a failed-then-passed test with attachments, errors and stdio', () => {
    const test = fakeTest({
      file: 'tests/checkout.spec.ts',
      title: 'pays',
      describes: ['Checkout'],
      outcome: 'flaky',
      rootDir,
      results: [
        {
          status: 'failed',
          errors: [{ message: '[31mError: boom[0m', stack: 'Error: boom\n    at x', snippet: '> 1 | x', location: { file: '/repo/tests/checkout.spec.ts', line: 43, column: 1 } }],
          stdout: ['hello ', Buffer.from('world')],
          stderr: ['warn'],
          attachments: [
            { name: 'screenshot', contentType: 'image/png', path: '/tmp/shot.png' },
            { name: 'trace', contentType: 'application/zip', path: '/tmp/trace.zip' },
            { name: 'error-context', contentType: 'text/markdown', body: Buffer.from('# ctx') },
            { name: 'ignored', contentType: 'text/plain' },
          ],
          steps: [
            { title: 'step 1', category: 'test.step', duration: 10, steps: [{ title: 'click', category: 'pw:api', duration: 5, steps: [] }], titlePath: () => [] },
            { title: 'before', category: 'hook', duration: 2, steps: [], error: { message: 'hook failed' } },
          ] as never,
        },
        { status: 'passed', retry: 1 },
      ],
    });
    const { record, attachments } = collectTest(test, { config, repoRoot: rootDir });
    expect(record.testId).toBe(stableTestId('tests/checkout.spec.ts', ['Checkout', 'pays']));
    expect(record).toMatchObject({ title: 'pays', suite: 'Checkout', file: 'tests/checkout.spec.ts', line: 42, column: 5, project: 'chromium', browser: 'chromium', status: 'flaky', retries: 1, durationMs: 200, tags: ['@smoke'] });
    expect(record.attempts[0]!.errors[0]!.message).toBe('Error: boom');
    expect(record.attempts[0]!.errors[0]!.location).toEqual({ file: 'tests/checkout.spec.ts', line: 43, column: 1 });
    expect(record.attempts[0]!.stdout).toBe('hello world');
    expect(record.attempts[0]!.stderr).toBe('warn');
    expect(record.attempts[0]!.steps).toEqual([
      { title: 'step 1', category: 'test.step', durationMs: 10, error: null, depth: 0 },
      { title: 'before', category: 'hook', durationMs: 2, error: 'hook failed', depth: 0 },
    ]);
    expect(attachments).toHaveLength(3);
    expect(attachments.map((a) => a.name)).toEqual(['screenshot', 'trace', 'error-context']);
  });

  it('derives the suite from the file name when there is no describe, and handles timeouts', () => {
    const test = fakeTest({ file: 'tests/02-createFunnel.spec.js', title: 'TC-02', outcome: 'unexpected', rootDir, results: [{ status: 'timedOut' }, { status: 'timedOut', retry: 1 }] });
    const { record } = collectTest(test, { config, repoRoot: rootDir });
    expect(record.suite).toBe('Create Funnel');
    expect(record.status).toBe('timedOut');
    expect(record.retries).toBe(1);
  });

  it('maps errors thrown as non-Error values and flattens nested steps', () => {
    expect(mapError({ value: '42' }, rootDir).message).toBe('42');
    const steps = flattenSteps([{ title: 'a', category: 'test.step', duration: 1, steps: [{ title: 'b', category: 'test.step', duration: 1, steps: [] }] }] as never);
    expect(steps.map((s) => [s.title, s.depth])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });
});

describe('PackageWriter', () => {
  it('copies attachments into artifacts/<testId>/ with retry-suffixed names and writes results.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-'));
    const src = path.join(dir, 'src.png');
    fs.writeFileSync(src, 'x');
    const w = new PackageWriter(path.join(dir, 'out'));
    const testId = 'a'.repeat(20);
    const a = w.addAttachment({ testId, project: 'chromium', retry: 0, name: 'screenshot', contentType: 'image/png', sourcePath: src, multiProject: false });
    const b = w.addAttachment({ testId, project: 'chromium', retry: 0, name: 'screenshot', contentType: 'image/png', sourcePath: src, multiProject: false });
    const c = w.addAttachment({ testId, project: 'firefox', retry: 1, name: 'trace', contentType: 'application/zip', body: Buffer.from('zip'), multiProject: true });
    const missing = w.addAttachment({ testId, project: 'chromium', retry: 0, name: 'video', contentType: 'video/webm', sourcePath: '/nope.webm', multiProject: false });
    expect(a?.path).toBe(`artifacts/${testId}/screenshot-r0.png`);
    expect(b?.path).toBe(`artifacts/${testId}/screenshot-r0-2.png`);
    expect(c?.path).toBe(`artifacts/${testId}/trace-r1-firefox.zip`);
    expect(c?.kind).toBe('trace');
    expect(missing).toBeNull();
    w.writeResults({ formatVersion: 1 } as never);
    expect(fs.existsSync(path.join(dir, 'out', RESULTS_FILE))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('CI adapters', () => {
  it('detects GitHub Actions and builds run + commit context', () => {
    const env = {
      GITHUB_ACTIONS: 'true',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'org/repo',
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_NUMBER: '7',
      GITHUB_WORKFLOW: 'Playwright Tests',
      GITHUB_JOB: 'test',
      GITHUB_SHA: 'abc',
      GITHUB_REF_NAME: 'main',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_ACTOR: 'me',
      GITHUB_EVENT_NAME: 'push',
    };
    const { ci, git, adapter } = detectCi(env);
    expect(adapter).toBeInstanceOf(GitHubActionsAdapter);
    expect(ci).toMatchObject({ provider: 'github-actions', workflow: 'Playwright Tests', runId: '123', runUrl: 'https://github.com/org/repo/actions/runs/123', runNumber: '7' });
    expect(git).toEqual({ repositoryUrl: 'https://github.com/org/repo', branch: 'main', commitSha: 'abc' });
    const pr = detectCi({ ...env, GITHUB_HEAD_REF: 'feature/pr', GITHUB_REF_NAME: '12/merge', GITHUB_RUN_ATTEMPT: '2' });
    expect(pr.git.branch).toBe('feature/pr');
    expect(pr.ci?.runUrl).toBe('https://github.com/org/repo/actions/runs/123/attempts/2');
  });
  it('detects Azure Pipelines and generic CI', () => {
    const azure = detectCi({ TF_BUILD: 'True', SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: 'https://dev.azure.com/org/', SYSTEM_TEAMPROJECT: 'proj', BUILD_BUILDID: '55', BUILD_SOURCEBRANCHNAME: 'main', BUILD_SOURCEVERSION: 'def', BUILD_REPOSITORY_URI: 'https://github.com/org/repo' });
    expect(azure.adapter).toBeInstanceOf(AzurePipelinesAdapter);
    expect(azure.ci?.runUrl).toBe('https://dev.azure.com/org/proj/_build/results?buildId=55');
    expect(azure.git.commitSha).toBe('def');
    const generic = detectCi({ CI: 'true', QA_DASHBOARD_CI_RUN_URL: 'https://ci.example/1' });
    expect(generic.ci?.provider).toBe('generic');
    expect(generic.ci?.runUrl).toBe('https://ci.example/1');
    expect(detectCi({}).ci).toBeNull();
  });
  it('resolveGitContext prefers explicit env overrides and never throws outside a repo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-'));
    const ctx = resolveGitContext(dir, { QA_DASHBOARD_REPO_URL: 'git@github.com:org/repo.git', QA_DASHBOARD_COMMIT_SHA: 'abc', QA_DASHBOARD_BRANCH: 'main' });
    expect(ctx).toMatchObject({ repositoryUrl: 'https://github.com/org/repo', commitSha: 'abc', branch: 'main' });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
