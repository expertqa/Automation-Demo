import { describe, expect, it } from 'vitest';
import { buildBranchUrl, buildCommitUrl, buildSourceUrl, normalizeRepositoryUrl, repositorySlug } from '../../shared/github';

const REPO = 'https://github.com/raheelaofficial6/accept-mission-playwright';

describe('normalizeRepositoryUrl', () => {
  it.each([
    ['git@github.com:org/repo.git', 'https://github.com/org/repo'],
    ['https://github.com/org/repo.git', 'https://github.com/org/repo'],
    ['https://github.com/org/repo/', 'https://github.com/org/repo'],
    ['ssh://git@github.com/org/repo.git', 'https://github.com/org/repo'],
    ['https://user:token@github.com/org/repo.git', 'https://github.com/org/repo'],
    ['http://github.com/org/repo', 'https://github.com/org/repo'],
    ['https://ghe.example.com/org/repo.git', 'https://ghe.example.com/org/repo'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeRepositoryUrl(input)).toBe(expected);
  });
  it('rejects garbage', () => {
    expect(normalizeRepositoryUrl('')).toBeNull();
    expect(normalizeRepositoryUrl(null)).toBeNull();
    expect(normalizeRepositoryUrl('not a url')).toBeNull();
  });
});

describe('buildSourceUrl', () => {
  it('builds a commit-pinned permalink with a line anchor', () => {
    expect(buildSourceUrl({ repositoryUrl: REPO, commitSha: 'abc123', file: 'tests/checkout/payment.spec.ts', line: 84 })).toBe(
      `${REPO}/blob/abc123/tests/checkout/payment.spec.ts#L84`,
    );
  });
  it('never falls back to a branch when the sha is missing', () => {
    expect(buildSourceUrl({ repositoryUrl: REPO, commitSha: null, file: 'tests/a.spec.ts', line: 1 })).toBeNull();
    expect(buildSourceUrl({ repositoryUrl: null, commitSha: 'abc', file: 'tests/a.spec.ts', line: 1 })).toBeNull();
  });
  it('encodes special characters and omits the anchor without a line', () => {
    expect(buildSourceUrl({ repositoryUrl: REPO, commitSha: 'abc', file: 'tests/my test.spec.ts' })).toBe(`${REPO}/blob/abc/tests/my%20test.spec.ts`);
  });
  it('rejects traversal in the file path', () => {
    expect(buildSourceUrl({ repositoryUrl: REPO, commitSha: 'abc', file: '../secret.ts', line: 1 })).toBeNull();
  });
});

describe('other links', () => {
  it('commit and branch urls', () => {
    expect(buildCommitUrl('git@github.com:org/repo.git', 'deadbeef')).toBe('https://github.com/org/repo/commit/deadbeef');
    expect(buildBranchUrl(REPO, 'feature/x')).toBe(`${REPO}/tree/feature/x`);
    expect(repositorySlug(REPO)).toBe('raheelaofficial6/accept-mission-playwright');
  });
});
