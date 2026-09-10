import type { ArtifactRow, RunRow, RunTestRow } from '../../database/schema';
import type { ArtifactSummary, RunSummary, RunTestSummary } from '../../shared/api';
import { buildCommitUrl, buildSourceUrl } from '../../shared/github';
import { passRate } from '../../shared/status';
import type { RunSource, RunStatus, TestOutcome, ArtifactKind } from '../../shared/types';
import path from 'node:path';

export function mapRun(row: RunRow, repoOverride: string | null): RunSummary {
  const repositoryUrl = repoOverride ?? row.repositoryUrl;
  const counts = {
    total: row.total,
    passed: row.passed,
    failed: row.failed,
    flaky: row.flaky,
    skipped: row.skipped,
    timedOut: row.timedOut,
    interrupted: row.interrupted,
    retries: row.retries,
  };
  let projects: { name: string; browser: string | null }[] = [];
  try {
    projects = JSON.parse(row.projectsJson);
  } catch {
    projects = [];
  }
  return {
    id: row.id,
    label: row.label || row.id,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    status: row.status as RunStatus,
    source: row.source as RunSource,
    environment: row.environment,
    branch: row.branch,
    commitSha: row.commitSha,
    commitMessage: row.commitMessage,
    commitAuthor: row.commitAuthor,
    repositoryUrl,
    commitUrl: buildCommitUrl(repositoryUrl, row.commitSha),
    ci: {
      provider: row.ciProvider,
      workflow: row.ciWorkflow,
      jobName: row.ciJobName,
      runId: row.ciRunId,
      runNumber: row.ciRunNumber,
      runUrl: row.ciRunUrl,
      actor: row.ciActor,
    },
    playwrightVersion: row.playwrightVersion,
    nodeVersion: row.nodeVersion,
    os: row.osPlatform ? `${row.osPlatform}${row.osArch ? ` ${row.osArch}` : ''}${row.osRelease ? ` (${row.osRelease})` : ''}` : null,
    projects,
    counts,
    passRate: passRate(counts),
  };
}

export interface RunTestJoin {
  rt: RunTestRow;
  title: string;
  fullTitle: string;
  suite: string;
  repositoryUrl: string | null;
  commitSha: string | null;
  hasTrace: number;
  hasVideo: number;
  hasScreenshot: number;
}

export function mapRunTest(j: RunTestJoin, repoOverride: string | null): RunTestSummary {
  return {
    runTestId: j.rt.id,
    runId: j.rt.runId,
    testId: j.rt.testId,
    title: j.title,
    fullTitle: j.fullTitle,
    suiteId: j.rt.suiteId,
    suite: j.suite,
    file: j.rt.file,
    line: j.rt.line,
    project: j.rt.project,
    browser: j.rt.browser,
    status: j.rt.status as TestOutcome,
    durationMs: j.rt.durationMs,
    retries: j.rt.retries,
    attempts: j.rt.attempts,
    startedAt: j.rt.startedAt,
    errorSummary: j.rt.errorSummary,
    sourceUrl: buildSourceUrl({ repositoryUrl: repoOverride ?? j.repositoryUrl, commitSha: j.commitSha, file: j.rt.file, line: j.rt.line }),
    hasTrace: j.hasTrace > 0,
    hasVideo: j.hasVideo > 0,
    hasScreenshot: j.hasScreenshot > 0,
  };
}

export function mapArtifact(row: ArtifactRow): ArtifactSummary {
  return {
    id: row.id,
    attemptId: row.attemptId,
    kind: row.kind as ArtifactKind,
    name: row.name,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    url: `/api/artifacts/${row.id}/${encodeURIComponent(path.posix.basename(row.relativePath))}`,
    fileName: path.posix.basename(row.relativePath),
  };
}
