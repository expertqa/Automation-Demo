import type { CiContext, GitContext } from '../../shared/types';
import { normalizeRepositoryUrl } from '../../shared/github';

export type Env = Record<string, string | undefined>;

/**
 * A CI adapter recognises the environment it runs in and extracts run + git
 * context from environment variables. Adding Jenkins, GitLab, CircleCI… means
 * adding one class here and registering it in `CI_ADAPTERS`.
 */
export interface CiAdapter {
  readonly provider: string;
  detect(env: Env): boolean;
  ciContext(env: Env): CiContext;
  gitContext(env: Env): Partial<GitContext>;
}

export class GitHubActionsAdapter implements CiAdapter {
  readonly provider = 'github-actions';
  detect(env: Env): boolean {
    return env.GITHUB_ACTIONS === 'true';
  }
  ciContext(env: Env): CiContext {
    const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
    const repo = env.GITHUB_REPOSITORY;
    const runId = env.GITHUB_RUN_ID ?? null;
    const attempt = env.GITHUB_RUN_ATTEMPT;
    const runUrl = repo && runId ? `${server}/${repo}/actions/runs/${runId}${attempt && attempt !== '1' ? `/attempts/${attempt}` : ''}` : null;
    return {
      provider: this.provider,
      workflow: env.GITHUB_WORKFLOW ?? null,
      jobName: env.GITHUB_JOB ?? null,
      runId,
      runNumber: env.GITHUB_RUN_NUMBER ?? null,
      runUrl,
      actor: env.GITHUB_ACTOR ?? null,
      eventName: env.GITHUB_EVENT_NAME ?? null,
    };
  }
  gitContext(env: Env): Partial<GitContext> {
    const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
    const repo = env.GITHUB_REPOSITORY;
    // On pull_request events GITHUB_SHA is the merge commit; GITHUB_HEAD_REF is the source branch.
    const branch = env.GITHUB_HEAD_REF || (env.GITHUB_REF_TYPE === 'branch' ? env.GITHUB_REF_NAME : undefined) || env.GITHUB_REF_NAME;
    return {
      repositoryUrl: repo ? normalizeRepositoryUrl(`${server}/${repo}`) : null,
      branch: branch ?? null,
      commitSha: env.GITHUB_SHA ?? null,
    };
  }
}

export class AzurePipelinesAdapter implements CiAdapter {
  readonly provider = 'azure-pipelines';
  detect(env: Env): boolean {
    return env.TF_BUILD === 'True' || env.TF_BUILD === 'true';
  }
  ciContext(env: Env): CiContext {
    const collection = env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI;
    const project = env.SYSTEM_TEAMPROJECT;
    const buildId = env.BUILD_BUILDID ?? null;
    const runUrl =
      collection && project && buildId ? `${collection.replace(/\/$/, '')}/${encodeURIComponent(project)}/_build/results?buildId=${buildId}` : null;
    return {
      provider: this.provider,
      workflow: env.BUILD_DEFINITIONNAME ?? null,
      jobName: env.AGENT_JOBNAME ?? env.SYSTEM_JOBDISPLAYNAME ?? null,
      runId: buildId,
      runNumber: env.BUILD_BUILDNUMBER ?? null,
      runUrl,
      actor: env.BUILD_REQUESTEDFOR ?? null,
      eventName: env.BUILD_REASON ?? null,
    };
  }
  gitContext(env: Env): Partial<GitContext> {
    const branch = env.SYSTEM_PULLREQUEST_SOURCEBRANCH || env.BUILD_SOURCEBRANCHNAME;
    return {
      repositoryUrl: normalizeRepositoryUrl(env.BUILD_REPOSITORY_URI ?? null),
      branch: branch ? branch.replace(/^refs\/heads\//, '') : null,
      commitSha: env.BUILD_SOURCEVERSION ?? null,
      commitMessage: env.BUILD_SOURCEVERSIONMESSAGE ?? null,
    };
  }
}

/** Any other CI: recognised through CI=true; details come from git. */
export class GenericCiAdapter implements CiAdapter {
  readonly provider = 'generic';
  detect(env: Env): boolean {
    return env.CI === 'true' || env.CI === '1';
  }
  ciContext(env: Env): CiContext {
    return {
      provider: env.QA_DASHBOARD_CI_PROVIDER ?? this.provider,
      workflow: env.QA_DASHBOARD_CI_WORKFLOW ?? null,
      jobName: null,
      runId: env.QA_DASHBOARD_CI_RUN_ID ?? null,
      runNumber: null,
      runUrl: env.QA_DASHBOARD_CI_RUN_URL ?? null,
      actor: null,
      eventName: null,
    };
  }
  gitContext(): Partial<GitContext> {
    return {};
  }
}

export const CI_ADAPTERS: CiAdapter[] = [new GitHubActionsAdapter(), new AzurePipelinesAdapter(), new GenericCiAdapter()];

export function detectCi(env: Env = process.env): { ci: CiContext | null; git: Partial<GitContext>; adapter: CiAdapter | null } {
  for (const adapter of CI_ADAPTERS) {
    if (adapter.detect(env)) return { ci: adapter.ciContext(env), git: adapter.gitContext(env), adapter };
  }
  return { ci: null, git: {}, adapter: null };
}
