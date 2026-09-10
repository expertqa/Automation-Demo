import { describe, expect, it } from 'vitest';
import { classifyAttachment, contentTypeFor, isSafeRelativePath, validateResultPackage } from '../../shared/package-format';
import { PACKAGE_FORMAT_VERSION } from '../../shared/types';

describe('isSafeRelativePath', () => {
  it.each(['artifacts/abc/x.png', 'a/b/c.zip', 'file.txt'])('accepts %s', (p) => expect(isSafeRelativePath(p)).toBe(true));
  it.each(['/etc/passwd', '../x', 'a/../../b', 'C:\\x', 'a//b', '', 'a/./b', 'x\0y'])('rejects %j', (p) => expect(isSafeRelativePath(p)).toBe(false));
});

describe('classifyAttachment', () => {
  it('routes by name and content type', () => {
    expect(classifyAttachment('screenshot', 'image/png')).toBe('screenshot');
    expect(classifyAttachment('video', 'video/webm')).toBe('video');
    expect(classifyAttachment('trace', 'application/zip')).toBe('trace');
    expect(classifyAttachment('error-context', 'text/markdown')).toBe('text');
    expect(classifyAttachment('blob', 'application/octet-stream')).toBe('other');
    expect(contentTypeFor('x.webm')).toBe('video/webm');
    expect(contentTypeFor('x.unknown')).toBe('application/octet-stream');
  });
});

describe('validateResultPackage', () => {
  const valid = {
    formatVersion: PACKAGE_FORMAT_VERSION,
    run: { id: 'run_abc123', startedAt: new Date().toISOString() },
    tests: [{ testId: 'a'.repeat(20), file: 'tests/a.spec.ts', attempts: [{ attachments: [{ path: 'artifacts/x/y.png' }] }] }],
  };
  it('accepts a valid package', () => expect(validateResultPackage(valid).ok).toBe(true));
  it('rejects bad versions, ids and unsafe attachment paths', () => {
    expect(validateResultPackage({ ...valid, formatVersion: 99 }).errors[0]).toMatch(/formatVersion/);
    expect(validateResultPackage({ ...valid, run: { id: '../x', startedAt: 'now' } }).errors.length).toBeGreaterThan(0);
    const unsafe = { ...valid, tests: [{ ...valid.tests[0], attempts: [{ attachments: [{ path: '../../etc/passwd' }] }] }] };
    expect(validateResultPackage(unsafe).errors[0]).toMatch(/unsafe/);
    expect(validateResultPackage(null).ok).toBe(false);
  });
});
