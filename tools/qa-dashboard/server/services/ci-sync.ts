import fs from 'node:fs';
import path from 'node:path';
import type { AppContext } from '../context';
import { importPath } from '../../ingest/importer';
import { CI_ARTIFACT_NAME, CI_REPO, CI_WORKFLOW_FILE } from './ci-config';

/**
 * Pulls finished GitHub Actions runs of the Playwright workflow into the local
 * dashboard, so a "Run" click made from the UI shows up here without anyone
 * manually downloading the artifact zip. Runs on a timer from `server/index.ts`
 * and is also exposed as `POST /api/ci/sync` for an on-demand refresh.
 *
 * Dedup relies on `runs.ci_run_id` (the GitHub Actions run id), which the
 * reporter already stamps on every package-mode run — so re-running sync is
 * always safe, it just skips runs already imported.
 */

interface GhWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  run_number: number;
}

interface GhArtifact {
  id: number;
  name: string;
  expired: boolean;
}

export interface CiSyncResult {
  checked: number;
  imported: { runId: string; ghRunId: number; passed: number; failed: number }[];
  skippedNoArtifact: number[];
  errors: { ghRunId: number; message: string }[];
}

const EMPTY_RESULT: CiSyncResult = { checked: 0, imported: [], skippedNoArtifact: [], errors: [] };

export async function syncCiRuns(ctx: AppContext, opts: { limit?: number } = {}): Promise<CiSyncResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return EMPTY_RESULT;

  const result: CiSyncResult = { checked: 0, imported: [], skippedNoArtifact: [], errors: [] };
  const runs = await listWorkflowRuns(token, opts.limit ?? 15);

  for (const run of runs) {
    if (run.status !== 'completed') continue;
    result.checked++;

    const already = ctx.dbHandle.sqlite.prepare('SELECT 1 FROM runs WHERE ci_run_id = ? LIMIT 1').get(String(run.id));
    if (already) continue;

    try {
      const artifact = await findResultsArtifact(token, run.id);
      if (!artifact) {
        result.skippedNoArtifact.push(run.id);
        continue;
      }
      const zipPath = await downloadArtifact(token, artifact.id, ctx.paths.tmpDir);
      try {
        const summaries = await importPath(zipPath, {
          paths: ctx.paths,
          dbHandle: ctx.dbHandle,
          source: 'ci',
          logger: ctx.logger.child('ci-sync'),
        });
        for (const s of summaries) {
          result.imported.push({ runId: s.runId, ghRunId: run.id, passed: s.counts.passed, failed: s.counts.failed });
          ctx.logger.info(`ci-sync: imported ${s.runId} from GitHub Actions run ${run.id} (${s.counts.passed} passed, ${s.counts.failed} failed)`);
        }
      } finally {
        fs.rmSync(zipPath, { force: true });
      }
    } catch (err) {
      result.errors.push({ ghRunId: run.id, message: (err as Error).message });
      ctx.logger.error(`ci-sync: failed for GitHub Actions run ${run.id}: ${(err as Error).message}`);
    }
  }
  return result;
}

async function ghFetch(token: string, url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

async function listWorkflowRuns(token: string, limit: number): Promise<GhWorkflowRun[]> {
  const res = await ghFetch(token, `https://api.github.com/repos/${CI_REPO}/actions/workflows/${CI_WORKFLOW_FILE}/runs?per_page=${limit}`);
  if (!res.ok) throw new Error(`list workflow runs: ${res.status} ${await res.text().catch(() => res.statusText)}`);
  const body = (await res.json()) as { workflow_runs: GhWorkflowRun[] };
  return body.workflow_runs ?? [];
}

async function findResultsArtifact(token: string, runId: number): Promise<GhArtifact | null> {
  const res = await ghFetch(token, `https://api.github.com/repos/${CI_REPO}/actions/runs/${runId}/artifacts?per_page=50`);
  if (!res.ok) throw new Error(`list artifacts for run ${runId}: ${res.status} ${await res.text().catch(() => res.statusText)}`);
  const body = (await res.json()) as { artifacts: GhArtifact[] };
  return body.artifacts.find((a) => a.name === CI_ARTIFACT_NAME && !a.expired) ?? null;
}

/** GitHub's artifact download redirects to a signed, unauthenticated blob URL — follow it manually so the token is never sent cross-host. */
async function downloadArtifact(token: string, artifactId: number, tmpDir: string): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${CI_REPO}/actions/artifacts/${artifactId}/zip`;
  const first = await fetch(apiUrl, {
    redirect: 'manual',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  const location = first.headers.get('location');
  if (!(first.status === 302 || first.status === 301) || !location) {
    throw new Error(`unexpected artifact download response: ${first.status}`);
  }
  const zipRes = await fetch(location);
  if (!zipRes.ok) throw new Error(`download artifact zip: ${zipRes.status}`);

  fs.mkdirSync(tmpDir, { recursive: true });
  const dest = path.join(tmpDir, `ci-artifact-${artifactId}-${Date.now()}.zip`);
  fs.writeFileSync(dest, Buffer.from(await zipRes.arrayBuffer()));
  return dest;
}
