/**
 * API contract shared by the Fastify server and the React app.
 */
import type { ArtifactKind, AttemptStatus, DashboardSettings, RunSource, RunStatus, TestOutcome } from './types';
import type { FlakyVerdict } from './flaky';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RunSummary {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: RunStatus;
  source: RunSource;
  environment: string;
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  commitAuthor: string | null;
  repositoryUrl: string | null;
  commitUrl: string | null;
  ci: {
    provider: string | null;
    workflow: string | null;
    jobName: string | null;
    runId: string | null;
    runNumber: string | null;
    runUrl: string | null;
    actor: string | null;
  };
  playwrightVersion: string | null;
  nodeVersion: string | null;
  os: string | null;
  projects: { name: string; browser: string | null }[];
  counts: {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
    timedOut: number;
    interrupted: number;
    retries: number;
  };
  passRate: number;
}

export interface RunFilters {
  q?: string;
  status?: string;
  branch?: string;
  environment?: string;
  project?: string;
  source?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface RunTestSummary {
  runTestId: number;
  runId: string;
  testId: string;
  title: string;
  fullTitle: string;
  suiteId: string;
  suite: string;
  file: string;
  line: number;
  project: string;
  browser: string | null;
  status: TestOutcome;
  durationMs: number;
  retries: number;
  attempts: number;
  startedAt: string;
  errorSummary: string | null;
  sourceUrl: string | null;
  hasTrace: boolean;
  hasVideo: boolean;
  hasScreenshot: boolean;
}

export interface SuiteInRun {
  suiteId: string;
  name: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number;
  files: { file: string; total: number; passed: number; failed: number; flaky: number; skipped: number; tests: RunTestSummary[] }[];
}

export interface RunDetail {
  run: RunSummary;
  suites: SuiteInRun[];
}

export interface ArtifactSummary {
  id: number;
  attemptId: number;
  kind: ArtifactKind;
  name: string;
  contentType: string;
  sizeBytes: number;
  url: string;
  fileName: string;
}

export interface ErrorDetail {
  id: number;
  position: number;
  message: string;
  stack: string | null;
  snippet: string | null;
  location: { file: string; line: number | null; column: number | null } | null;
  sourceUrl: string | null;
}

export interface AttemptDetail {
  id: number;
  retry: number;
  status: AttemptStatus;
  startedAt: string;
  durationMs: number;
  workerIndex: number | null;
  stdout: string;
  stderr: string;
  steps: { title: string; category: string; durationMs: number; error: string | null; depth: number }[];
  errors: ErrorDetail[];
  artifacts: ArtifactSummary[];
}

export interface RunTestDetail {
  test: RunTestSummary;
  run: RunSummary;
  titlePath: string[];
  column: number | null;
  expectedStatus: AttemptStatus;
  tags: string[];
  annotations: { type: string; description: string | null }[];
  attempts: AttemptDetail[];
  links: { sourceUrl: string | null; commitUrl: string | null; ciRunUrl: string | null; repositoryUrl: string | null };
  history: TestHistory;
}

export interface ExecutionPoint {
  runTestId: number;
  runId: string;
  startedAt: string;
  status: TestOutcome;
  retries: number;
  durationMs: number;
  branch: string | null;
  environment: string;
  project: string;
  commitSha: string | null;
}

export interface TestHistory {
  testId: string;
  executions: number;
  passRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  failures: number;
  flakyExecutions: number;
  retries: number;
  lastFailure: ExecutionPoint | null;
  lastSuccess: ExecutionPoint | null;
  lastExecution: ExecutionPoint | null;
  recent: ExecutionPoint[];
  flaky: FlakyVerdict;
}

export interface TestListItem {
  testId: string;
  title: string;
  fullTitle: string;
  suiteId: string;
  suite: string;
  file: string;
  line: number;
  executions: number;
  passRate: number;
  avgDurationMs: number;
  lastStatus: TestOutcome | null;
  lastRunId: string | null;
  lastRunTestId: number | null;
  lastStartedAt: string | null;
  lastProject: string | null;
  recent: TestOutcome[];
  isFlaky: boolean;
  sourceUrl: string | null;
}

export interface TestFilters {
  q?: string;
  status?: string;
  suite?: string;
  file?: string;
  project?: string;
  branch?: string;
  environment?: string;
  flaky?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface TestDetailResponse {
  test: { testId: string; title: string; fullTitle: string; titlePath: string[]; suiteId: string; suite: string; file: string; line: number; column: number | null; firstSeenAt: string; lastSeenAt: string };
  history: TestHistory;
  executions: Paginated<ExecutionPoint & { errorSummary: string | null; sourceUrl: string | null }>;
  links: { sourceUrl: string | null; repositoryUrl: string | null };
}

export interface SuiteListItem {
  suiteId: string;
  name: string;
  tests: number;
  files: number;
  latest: { runId: string; total: number; passed: number; failed: number; flaky: number; skipped: number; durationMs: number; startedAt: string } | null;
  passRate: number; // across the last N runs
  avgDurationMs: number;
  reliability: { runId: string; startedAt: string; passRate: number }[]; // last N runs oldest→newest
  flakyTests: number;
}

export interface SuiteDetail {
  suite: SuiteListItem;
  files: { file: string; tests: TestListItem[] }[];
}

export interface FailureItem {
  runTestId: number;
  runId: string;
  testId: string;
  title: string;
  suite: string;
  file: string;
  line: number;
  project: string;
  status: TestOutcome;
  startedAt: string;
  durationMs: number;
  retries: number;
  errorSummary: string | null;
  fingerprint: string | null;
  branch: string | null;
  environment: string;
  sourceUrl: string | null;
  hasTrace: boolean;
}

export interface FailureCluster {
  fingerprint: string;
  count: number;
  tests: number;
  sample: string;
}

export interface FailuresResponse {
  failures: Paginated<FailureItem>;
  clusters: FailureCluster[];
}

export interface FlakyItem {
  testId: string;
  title: string;
  suite: string;
  suiteId: string;
  file: string;
  line: number;
  verdict: FlakyVerdict;
  lastFailure: ExecutionPoint | null;
  lastExecution: ExecutionPoint | null;
  recent: TestOutcome[];
  sourceUrl: string | null;
}

export interface TrendPoint {
  runId: string;
  startedAt: string;
  status: RunStatus;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number;
  passRate: number;
  branch: string | null;
  environment: string;
}

export interface OverviewResponse {
  latest: RunSummary | null;
  totals: {
    runs: number;
    tests: number;
    suites: number;
    artifacts: number;
    artifactBytes: number;
  };
  window: {
    runs: number;
    passRate: number;
    failureRate: number;
    flakyTests: number;
    avgTestDurationMs: number;
    avgRunDurationMs: number;
  };
  recentRuns: RunSummary[];
  trends: TrendPoint[];
  hasDemoData: boolean;
}

export interface HistoryResponse {
  trends: TrendPoint[];
  daily: { day: string; runs: number; passed: number; failed: number; flaky: number; skipped: number; passRate: number; avgDurationMs: number }[];
  topFailing: { testId: string; title: string; suite: string; failures: number; executions: number; sourceUrl: string | null }[];
  slowest: { testId: string; title: string; suite: string; avgDurationMs: number; executions: number }[];
}

export interface FilterOptions {
  branches: string[];
  environments: string[];
  projects: string[];
  browsers: string[];
  suites: { suiteId: string; name: string }[];
  statuses: TestOutcome[];
  runStatuses: RunStatus[];
}

export interface SettingsResponse {
  settings: DashboardSettings;
  info: {
    dataDir: string;
    databaseFile: string;
    artifactsDir: string;
    repoRoot: string;
    repositoryUrl: string | null;
    version: string;
    traceViewer: { available: boolean; strategy: string; playwrightVersion: string | null };
    demoRuns: number;
  };
}

export interface TraceOpenResponse {
  ok: boolean;
  mode: 'launched' | 'url';
  message: string;
  url?: string;
}

export interface SearchResult {
  kind: 'run' | 'test' | 'suite' | 'file';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}
