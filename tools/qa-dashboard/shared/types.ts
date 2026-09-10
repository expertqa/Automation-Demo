/**
 * Shared domain types. This module has no runtime dependencies so it can be
 * consumed by the Playwright reporter (running inside the test process), the
 * server and the React app alike.
 */

export const PACKAGE_FORMAT_VERSION = 1;

/** Status of one Playwright TestResult (a single attempt). */
export type AttemptStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

/** Final outcome of a test inside one run. */
export type TestOutcome = 'passed' | 'failed' | 'flaky' | 'skipped' | 'timedOut' | 'interrupted';

/** Outcome of a whole run. */
export type RunStatus = 'passed' | 'failed' | 'timedout' | 'interrupted' | 'running';

export type RunSource = 'local' | 'ci' | 'import' | 'demo';

export type ArtifactKind = 'screenshot' | 'video' | 'trace' | 'text' | 'other';

export interface CiContext {
  provider: string; // 'github-actions' | 'azure-pipelines' | 'generic' | ...
  workflow: string | null;
  jobName: string | null;
  runId: string | null;
  runNumber: string | null;
  runUrl: string | null;
  actor: string | null;
  eventName: string | null;
}

export interface GitContext {
  repositoryUrl: string | null; // normalized https://github.com/org/repo
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  commitAuthor: string | null;
}

export interface PackageErrorRecord {
  message: string;
  stack: string | null;
  snippet: string | null;
  location: { file: string; line: number; column: number } | null;
}

export interface PackageAttachmentRecord {
  name: string;
  contentType: string;
  kind: ArtifactKind;
  /** Path relative to the package root, POSIX separators. */
  path: string;
  size: number;
}

export interface PackageAttemptRecord {
  index: number; // retry index
  status: AttemptStatus;
  startedAt: string; // ISO
  durationMs: number;
  workerIndex: number | null;
  parallelIndex: number | null;
  errors: PackageErrorRecord[];
  stdout: string;
  stderr: string;
  attachments: PackageAttachmentRecord[];
  steps: PackageStepRecord[];
}

export interface PackageStepRecord {
  title: string;
  category: string;
  durationMs: number;
  error: string | null;
  depth: number;
}

export interface PackageTestRecord {
  testId: string;
  playwrightId: string;
  title: string;
  /** Describe hierarchy (without root, project and file). */
  titlePath: string[];
  suite: string;
  suiteId: string;
  file: string; // relative to repo root, POSIX separators
  line: number;
  column: number | null;
  project: string;
  browser: string | null;
  status: TestOutcome;
  expectedStatus: AttemptStatus;
  durationMs: number; // sum of attempts
  retries: number; // number of retries actually executed (attempts - 1)
  tags: string[];
  annotations: { type: string; description: string | null }[];
  attempts: PackageAttemptRecord[];
}

export interface PackageRunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: RunStatus;
  environment: string;
  source: RunSource;
  git: GitContext;
  ci: CiContext | null;
  playwrightVersion: string | null;
  nodeVersion: string | null;
  os: { platform: string; release: string; arch: string } | null;
  projects: { name: string; browser: string | null }[];
  metadata: Record<string, unknown>;
}

export interface RunCounts {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  timedOut: number;
  interrupted: number;
  retries: number;
}

/** The portable result package produced by the reporter and consumed by the importer. */
export interface ResultPackage {
  formatVersion: number;
  generator: { name: string; version: string };
  run: PackageRunRecord;
  counts: RunCounts;
  tests: PackageTestRecord[];
}

export interface FlakyConfig {
  windowRuns: number;
  minExecutions: number;
  failureRateMin: number;
  failureRateMax: number;
  countRetryPass: boolean;
  minTransitions: number;
}

export const DEFAULT_FLAKY_CONFIG: FlakyConfig = {
  windowRuns: 20,
  minExecutions: 3,
  failureRateMin: 0.1,
  failureRateMax: 0.9,
  countRetryPass: true,
  minTransitions: 3,
};

export interface DashboardSettings {
  flaky: FlakyConfig;
  github: {
    /** Optional override of the repository URL used for source links. */
    repositoryUrl: string | null;
  };
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  flaky: DEFAULT_FLAKY_CONFIG,
  github: { repositoryUrl: null },
};
