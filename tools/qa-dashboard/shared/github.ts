import { toPosixPath } from './identity';

/**
 * Normalise any git remote to a browsable https URL.
 *   git@github.com:org/repo.git       -> https://github.com/org/repo
 *   https://github.com/org/repo.git   -> https://github.com/org/repo
 *   ssh://git@github.com/org/repo.git -> https://github.com/org/repo
 *   https://user:token@github.com/... -> https://github.com/... (credentials stripped)
 */
export function normalizeRepositoryUrl(remote: string | null | undefined): string | null {
  if (!remote) return null;
  let url = remote.trim();
  if (!url) return null;

  const scp = /^(?:[\w.-]+@)?([\w.-]+):([\w./-]+?)(?:\.git)?\/?$/.exec(url);
  if (scp && !url.includes('://')) {
    url = `https://${scp[1]}/${scp[2]}`;
  } else {
    url = url.replace(/^ssh:\/\/(?:[\w.-]+@)?/, 'https://').replace(/^git:\/\//, 'https://');
    url = url.replace(/^http:\/\//, 'https://');
    // strip credentials
    url = url.replace(/^https:\/\/[^@/]+@/, 'https://');
    url = url.replace(/\.git\/?$/, '').replace(/\/+$/, '');
  }
  if (!/^https:\/\/[\w.-]+\/[^/]+\/[^/]+/.test(url)) return null;
  return url;
}

export interface SourceLinkInput {
  repositoryUrl: string | null | undefined;
  commitSha: string | null | undefined;
  file: string | null | undefined;
  line?: number | null;
  column?: number | null;
}

/**
 * Build a permalink to the exact source that produced a test:
 *   https://github.com/ORG/REPO/blob/<sha>/tests/foo.spec.ts#L84
 * Returns null when the required pieces are missing — never falls back to `main`.
 */
export function buildSourceUrl(input: SourceLinkInput): string | null {
  const repo = normalizeRepositoryUrl(input.repositoryUrl);
  const sha = input.commitSha?.trim();
  const file = input.file ? toPosixPath(input.file).replace(/^\/+/, '') : '';
  if (!repo || !sha || !file || file.includes('..')) return null;
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  const anchor = input.line && input.line > 0 ? `#L${input.line}` : '';
  return `${repo}/blob/${sha}/${encoded}${anchor}`;
}

export function buildCommitUrl(repositoryUrl: string | null | undefined, commitSha: string | null | undefined): string | null {
  const repo = normalizeRepositoryUrl(repositoryUrl);
  const sha = commitSha?.trim();
  if (!repo || !sha) return null;
  return `${repo}/commit/${sha}`;
}

export function buildBranchUrl(repositoryUrl: string | null | undefined, branch: string | null | undefined): string | null {
  const repo = normalizeRepositoryUrl(repositoryUrl);
  if (!repo || !branch) return null;
  return `${repo}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`;
}

/** Parse "org/repo" from a normalized URL. */
export function repositorySlug(repositoryUrl: string | null | undefined): string | null {
  const repo = normalizeRepositoryUrl(repositoryUrl);
  if (!repo) return null;
  const m = /^https:\/\/[^/]+\/([^/]+\/[^/]+)$/.exec(repo);
  return m ? m[1]! : null;
}
