import { execFileSync } from 'node:child_process';
import type { GitContext } from '../shared/types';
import { normalizeRepositoryUrl } from '../shared/github';
import { detectCi, type Env } from './ci/adapters';

function git(cwd: string, args: string[]): string | null {
  try {
    // Fixed argument lists only — nothing here is derived from test data.
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim() || null;
  } catch {
    return null;
  }
}

export function gitTopLevel(cwd: string): string | null {
  return git(cwd, ['rev-parse', '--show-toplevel']);
}

/**
 * Resolve git context: explicit overrides → CI environment → local git CLI.
 * Never throws; missing pieces are null so URLs are simply not generated.
 */
export function resolveGitContext(cwd: string, env: Env = process.env, overrides: Partial<GitContext> = {}): GitContext {
  const fromCi = detectCi(env).git;
  const ctx: GitContext = {
    repositoryUrl: overrides.repositoryUrl ?? normalizeRepositoryUrl(env.QA_DASHBOARD_REPO_URL) ?? fromCi.repositoryUrl ?? null,
    branch: overrides.branch ?? env.QA_DASHBOARD_BRANCH ?? fromCi.branch ?? null,
    commitSha: overrides.commitSha ?? env.QA_DASHBOARD_COMMIT_SHA ?? fromCi.commitSha ?? null,
    commitMessage: overrides.commitMessage ?? fromCi.commitMessage ?? null,
    commitAuthor: overrides.commitAuthor ?? fromCi.commitAuthor ?? null,
  };

  if (!ctx.repositoryUrl) ctx.repositoryUrl = normalizeRepositoryUrl(git(cwd, ['config', '--get', 'remote.origin.url']));
  if (!ctx.commitSha) ctx.commitSha = git(cwd, ['rev-parse', 'HEAD']);
  if (!ctx.branch) {
    const b = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    ctx.branch = b && b !== 'HEAD' ? b : null;
  }
  if (!ctx.commitMessage) ctx.commitMessage = git(cwd, ['log', '-1', '--pretty=%s']);
  if (!ctx.commitAuthor) ctx.commitAuthor = git(cwd, ['log', '-1', '--pretty=%an']);
  return ctx;
}
