import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Normalised schema. Binary artifacts are NOT stored here — only relative paths
 * into dashboard-data/artifacts/.
 */

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    createdAt: text('created_at').notNull(),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    status: text('status').notNull(), // RunStatus
    source: text('source').notNull(), // RunSource
    environment: text('environment').notNull().default('local'),
    branch: text('branch'),
    commitSha: text('commit_sha'),
    commitMessage: text('commit_message'),
    commitAuthor: text('commit_author'),
    repositoryUrl: text('repository_url'),
    ciProvider: text('ci_provider'),
    ciWorkflow: text('ci_workflow'),
    ciJobName: text('ci_job_name'),
    ciRunId: text('ci_run_id'),
    ciRunNumber: text('ci_run_number'),
    ciRunUrl: text('ci_run_url'),
    ciActor: text('ci_actor'),
    playwrightVersion: text('playwright_version'),
    nodeVersion: text('node_version'),
    osPlatform: text('os_platform'),
    osRelease: text('os_release'),
    osArch: text('os_arch'),
    /** JSON array of {name, browser}. */
    projectsJson: text('projects_json').notNull().default('[]'),
    /** Comma-joined project names for cheap filtering. */
    projectNames: text('project_names').notNull().default(''),
    browserNames: text('browser_names').notNull().default(''),
    total: integer('total').notNull().default(0),
    passed: integer('passed').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    flaky: integer('flaky').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    timedOut: integer('timed_out').notNull().default(0),
    interrupted: integer('interrupted').notNull().default(0),
    retries: integer('retries').notNull().default(0),
    metadataJson: text('metadata_json').notNull().default('{}'),
  },
  (t) => [
    index('idx_runs_started_at').on(t.startedAt),
    index('idx_runs_status').on(t.status),
    index('idx_runs_branch').on(t.branch),
    index('idx_runs_environment').on(t.environment),
    index('idx_runs_source').on(t.source),
  ],
);

export const suites = sqliteTable(
  'suites',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('uq_suites_name').on(t.name)],
);

export const tests = sqliteTable(
  'tests',
  {
    id: text('id').primaryKey(), // stable test id
    suiteId: text('suite_id')
      .notNull()
      .references(() => suites.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    /** JSON array — describe hierarchy. */
    titlePathJson: text('title_path_json').notNull().default('[]'),
    fullTitle: text('full_title').notNull(),
    file: text('file').notNull(),
    line: integer('line').notNull().default(0),
    column: integer('column'),
    firstSeenAt: text('first_seen_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
  },
  (t) => [index('idx_tests_suite').on(t.suiteId), index('idx_tests_file').on(t.file), index('idx_tests_title').on(t.title)],
);

export const runTests = sqliteTable(
  'run_tests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    testId: text('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'restrict' }),
    suiteId: text('suite_id')
      .notNull()
      .references(() => suites.id, { onDelete: 'restrict' }),
    playwrightId: text('playwright_id'),
    project: text('project').notNull().default(''),
    browser: text('browser'),
    status: text('status').notNull(), // TestOutcome
    expectedStatus: text('expected_status').notNull().default('passed'),
    durationMs: integer('duration_ms').notNull().default(0),
    retries: integer('retries').notNull().default(0),
    attempts: integer('attempts').notNull().default(1),
    startedAt: text('started_at').notNull(),
    /** Snapshot of location at the time of the run — line numbers move between commits. */
    file: text('file').notNull(),
    line: integer('line').notNull().default(0),
    column: integer('column'),
    errorSummary: text('error_summary'),
    tagsJson: text('tags_json').notNull().default('[]'),
    annotationsJson: text('annotations_json').notNull().default('[]'),
  },
  (t) => [
    uniqueIndex('uq_run_tests_run_test_project').on(t.runId, t.testId, t.project),
    index('idx_run_tests_run').on(t.runId),
    index('idx_run_tests_test').on(t.testId),
    index('idx_run_tests_suite').on(t.suiteId),
    index('idx_run_tests_status').on(t.status),
    index('idx_run_tests_started').on(t.startedAt),
    index('idx_run_tests_project').on(t.project),
  ],
);

export const testAttempts = sqliteTable(
  'test_attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runTestId: integer('run_test_id')
      .notNull()
      .references(() => runTests.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    retry: integer('retry').notNull().default(0),
    status: text('status').notNull(), // AttemptStatus
    startedAt: text('started_at').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    workerIndex: integer('worker_index'),
    parallelIndex: integer('parallel_index'),
    stdout: text('stdout').notNull().default(''),
    stderr: text('stderr').notNull().default(''),
    stepsJson: text('steps_json').notNull().default('[]'),
  },
  (t) => [
    uniqueIndex('uq_attempts_run_test_retry').on(t.runTestId, t.retry),
    index('idx_attempts_run').on(t.runId),
    index('idx_attempts_status').on(t.status),
  ],
);

export const errors = sqliteTable(
  'errors',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    attemptId: integer('attempt_id')
      .notNull()
      .references(() => testAttempts.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    message: text('message').notNull(),
    stack: text('stack'),
    snippet: text('snippet'),
    locationFile: text('location_file'),
    locationLine: integer('location_line'),
    locationColumn: integer('location_column'),
    /** First line of the message, for clustering and search. */
    fingerprint: text('fingerprint').notNull().default(''),
  },
  (t) => [index('idx_errors_attempt').on(t.attemptId), index('idx_errors_run').on(t.runId), index('idx_errors_fingerprint').on(t.fingerprint)],
);

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    attemptId: integer('attempt_id')
      .notNull()
      .references(() => testAttempts.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    testId: text('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(), // ArtifactKind
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    /** Relative to the artifact root, POSIX separators. */
    relativePath: text('relative_path').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_artifacts_attempt').on(t.attemptId),
    index('idx_artifacts_run').on(t.runId),
    index('idx_artifacts_test').on(t.testId),
    index('idx_artifacts_kind').on(t.kind),
    uniqueIndex('uq_artifacts_path').on(t.relativePath),
  ],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** Cached suite-level stats are computed on demand; this table records per-run suite summaries for quick run detail. */
export const runSuites = sqliteTable(
  'run_suites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    suiteId: text('suite_id')
      .notNull()
      .references(() => suites.id, { onDelete: 'restrict' }),
    total: integer('total').notNull().default(0),
    passed: integer('passed').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    flaky: integer('flaky').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    avgDurationMs: real('avg_duration_ms').notNull().default(0),
  },
  (t) => [uniqueIndex('uq_run_suites').on(t.runId, t.suiteId), index('idx_run_suites_suite').on(t.suiteId)],
);

export type RunRow = typeof runs.$inferSelect;
export type SuiteRow = typeof suites.$inferSelect;
export type TestRow = typeof tests.$inferSelect;
export type RunTestRow = typeof runTests.$inferSelect;
export type AttemptRow = typeof testAttempts.$inferSelect;
export type ErrorRow = typeof errors.$inferSelect;
export type ArtifactRow = typeof artifacts.$inferSelect;
export type RunSuiteRow = typeof runSuites.$inferSelect;
