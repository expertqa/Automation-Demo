import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { DashboardDb, DbHandle } from '../database/client';

type DbLike = Pick<DashboardDb, 'insert' | 'delete' | 'select'>;
import { openDatabase, schema } from '../database/client';
import { ArtifactStore } from '../artifacts/store';
import type { DashboardPaths } from '../shared/paths';
import { ensureDashboardDirs } from '../shared/paths';
import type { PackageTestRecord, ResultPackage, RunSource } from '../shared/types';
import { RESULTS_FILE, validateResultPackage } from '../shared/package-format';
import { countOutcomes } from '../shared/status';
import { createLogger, type Logger } from '../server/logger';

export interface IngestOptions {
  paths: DashboardPaths;
  /** Reuse an open DB handle (tests / server). */
  dbHandle?: DbHandle;
  /** Move artifacts out of the package instead of copying. */
  moveArtifacts?: boolean;
  /** Delete the package directory after a successful ingest. */
  removePackageDir?: boolean;
  /** Replace a run that already exists with the same id. */
  replace?: boolean;
  /** Override run.source (e.g. 'import' for CI packages imported manually, 'demo' for seed data). */
  sourceOverride?: RunSource;
  logger?: Logger;
}

export interface IngestSummary {
  runId: string;
  status: string;
  counts: ReturnType<typeof countOutcomes>;
  artifacts: number;
  tests: number;
}

export class IngestError extends Error {}

export function readResultPackage(packageDir: string): ResultPackage {
  const file = path.join(packageDir, RESULTS_FILE);
  if (!fs.existsSync(file)) throw new IngestError(`no ${RESULTS_FILE} found in ${packageDir}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new IngestError(`invalid JSON in ${file}: ${(err as Error).message}`);
  }
  const validation = validateResultPackage(parsed);
  if (!validation.ok) throw new IngestError(`invalid result package: ${validation.errors.slice(0, 5).join('; ')}`);
  return parsed as ResultPackage;
}

export async function ingestPackageDirectory(packageDir: string, options: IngestOptions): Promise<IngestSummary> {
  const pkg = readResultPackage(packageDir);
  return ingestPackage(pkg, packageDir, options);
}

/**
 * Store a parsed package in the database and its artifacts on disk.
 * Runs in one SQLite transaction; artifact files are rolled back on failure.
 */
export async function ingestPackage(pkg: ResultPackage, packageDir: string, options: IngestOptions): Promise<IngestSummary> {
  const log = options.logger ?? createLogger('ingest');
  ensureDashboardDirs(options.paths);
  const handle = options.dbHandle ?? openDatabase(options.paths.databaseFile);
  const store = new ArtifactStore(options.paths.artifactsDir);
  const runId = pkg.run.id;
  const now = new Date().toISOString();

  try {
    const db = handle.db;
    const existing = db.select({ id: schema.runs.id }).from(schema.runs).where(eq(schema.runs.id, runId)).get();
    if (existing) {
      if (!options.replace) throw new IngestError(`run ${runId} is already in the dashboard (use --replace to overwrite)`);
      deleteRun(db, store, runId);
    }

    const counts = countOutcomes(pkg.tests);
    let artifactCount = 0;

    db.transaction((tx) => {
      const source = options.sourceOverride ?? pkg.run.source;
      tx.insert(schema.runs)
        .values({
          id: runId,
          label: pkg.run.label || runId,
          createdAt: now,
          startedAt: pkg.run.startedAt,
          finishedAt: pkg.run.finishedAt,
          durationMs: pkg.run.durationMs,
          status: pkg.run.status,
          source,
          environment: pkg.run.environment || 'local',
          branch: pkg.run.git.branch,
          commitSha: pkg.run.git.commitSha,
          commitMessage: pkg.run.git.commitMessage,
          commitAuthor: pkg.run.git.commitAuthor,
          repositoryUrl: pkg.run.git.repositoryUrl,
          ciProvider: pkg.run.ci?.provider ?? null,
          ciWorkflow: pkg.run.ci?.workflow ?? null,
          ciJobName: pkg.run.ci?.jobName ?? null,
          ciRunId: pkg.run.ci?.runId ?? null,
          ciRunNumber: pkg.run.ci?.runNumber ?? null,
          ciRunUrl: pkg.run.ci?.runUrl ?? null,
          ciActor: pkg.run.ci?.actor ?? null,
          playwrightVersion: pkg.run.playwrightVersion,
          nodeVersion: pkg.run.nodeVersion,
          osPlatform: pkg.run.os?.platform ?? null,
          osRelease: pkg.run.os?.release ?? null,
          osArch: pkg.run.os?.arch ?? null,
          projectsJson: JSON.stringify(pkg.run.projects),
          projectNames: pkg.run.projects.map((p) => p.name).join(','),
          browserNames: Array.from(new Set(pkg.run.projects.map((p) => p.browser).filter(Boolean))).join(','),
          total: counts.total,
          passed: counts.passed,
          failed: counts.failed,
          flaky: counts.flaky,
          skipped: counts.skipped,
          timedOut: counts.timedOut,
          interrupted: counts.interrupted,
          retries: counts.retries,
          metadataJson: JSON.stringify(pkg.run.metadata ?? {}),
        })
        .run();

      const suiteAgg = new Map<string, { total: number; passed: number; failed: number; flaky: number; skipped: number; durationMs: number }>();

      for (const t of pkg.tests) {
        upsertSuiteAndTest(tx, t, now);
        const runTest = tx
          .insert(schema.runTests)
          .values({
            runId,
            testId: t.testId,
            suiteId: t.suiteId,
            playwrightId: t.playwrightId,
            project: t.project,
            browser: t.browser,
            status: t.status,
            expectedStatus: t.expectedStatus,
            durationMs: t.durationMs,
            retries: t.retries,
            attempts: t.attempts.length,
            startedAt: t.attempts[0]?.startedAt ?? pkg.run.startedAt,
            file: t.file,
            line: t.line,
            column: t.column,
            errorSummary: firstErrorSummary(t),
            tagsJson: JSON.stringify(t.tags ?? []),
            annotationsJson: JSON.stringify(t.annotations ?? []),
          })
          .returning({ id: schema.runTests.id })
          .get();

        for (const a of t.attempts) {
          const attempt = tx
            .insert(schema.testAttempts)
            .values({
              runTestId: runTest.id,
              runId,
              retry: a.index,
              status: a.status,
              startedAt: a.startedAt,
              durationMs: a.durationMs,
              workerIndex: a.workerIndex,
              parallelIndex: a.parallelIndex,
              stdout: a.stdout ?? '',
              stderr: a.stderr ?? '',
              stepsJson: JSON.stringify(a.steps ?? []),
            })
            .returning({ id: schema.testAttempts.id })
            .get();

          a.errors.forEach((e, position) => {
            tx.insert(schema.errors)
              .values({
                attemptId: attempt.id,
                runId,
                position,
                message: e.message,
                stack: e.stack,
                snippet: e.snippet,
                locationFile: e.location?.file ?? null,
                locationLine: e.location?.line ?? null,
                locationColumn: e.location?.column ?? null,
                fingerprint: fingerprint(e.message),
              })
              .run();
          });

          for (const att of a.attachments) {
            const src = path.resolve(packageDir, att.path);
            if (!src.startsWith(path.resolve(packageDir) + path.sep) || !fs.existsSync(src)) {
              log.warn(`skipping missing attachment ${att.path}`);
              continue;
            }
            const rel = store.relativePathFor(runId, t.testId, path.basename(att.path));
            const size = store.put(src, rel, { move: options.moveArtifacts ?? false });
            tx.insert(schema.artifacts)
              .values({
                attemptId: attempt.id,
                runId,
                testId: t.testId,
                kind: att.kind,
                name: att.name,
                contentType: att.contentType,
                relativePath: rel,
                sizeBytes: size,
                createdAt: now,
              })
              .run();
            artifactCount++;
          }
        }

        const agg = suiteAgg.get(t.suiteId) ?? { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, durationMs: 0 };
        agg.total++;
        agg.durationMs += t.durationMs;
        if (t.status === 'passed') agg.passed++;
        else if (t.status === 'flaky') agg.flaky++;
        else if (t.status === 'skipped') agg.skipped++;
        else agg.failed++;
        suiteAgg.set(t.suiteId, agg);
      }

      for (const [sid, agg] of suiteAgg) {
        tx.insert(schema.runSuites)
          .values({
            runId,
            suiteId: sid,
            ...agg,
            avgDurationMs: agg.total ? agg.durationMs / agg.total : 0,
          })
          .run();
      }
    });

    if (options.removePackageDir) fs.rmSync(packageDir, { recursive: true, force: true });
    log.info(`ingested run ${runId} (${pkg.tests.length} tests, ${artifactCount} artifacts)`);
    return { runId, status: pkg.run.status, counts, artifacts: artifactCount, tests: pkg.tests.length };
  } catch (err) {
    // roll back any files moved for this run
    try {
      store.removeRun(runId);
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    if (!options.dbHandle) handle.close();
  }
}

function upsertSuiteAndTest(tx: DbLike, t: PackageTestRecord, now: string): void {
  tx.insert(schema.suites)
    .values({ id: t.suiteId, name: t.suite, createdAt: now })
    .onConflictDoNothing()
    .run();
  tx.insert(schema.tests)
    .values({
      id: t.testId,
      suiteId: t.suiteId,
      title: t.title,
      titlePathJson: JSON.stringify(t.titlePath),
      fullTitle: t.titlePath.join(' › '),
      file: t.file,
      line: t.line,
      column: t.column,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: schema.tests.id,
      set: { title: t.title, titlePathJson: JSON.stringify(t.titlePath), fullTitle: t.titlePath.join(' › '), file: t.file, line: t.line, column: t.column, lastSeenAt: now, suiteId: t.suiteId },
    })
    .run();
}

function firstErrorSummary(t: PackageTestRecord): string | null {
  for (let i = t.attempts.length - 1; i >= 0; i--) {
    const e = t.attempts[i]!.errors[0];
    if (e) return e.message.split('\n')[0]!.slice(0, 500);
  }
  return null;
}

export function fingerprint(message: string): string {
  return message
    .split('\n')[0]!
    .replace(/\d+ms/g, 'Nms')
    .replace(/https?:\/\/\S+/g, 'URL')
    .replace(/\d{3,}/g, 'N')
    .trim()
    .slice(0, 200);
}

/** Delete a run, its rows (cascade) and its artifact files. */
export function deleteRun(db: DashboardDb, store: ArtifactStore, runId: string): void {
  db.delete(schema.runs).where(eq(schema.runs.id, runId)).run();
  store.removeRun(runId);
}
