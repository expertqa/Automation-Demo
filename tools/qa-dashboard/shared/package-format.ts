import type { ArtifactKind, ResultPackage } from './types';
import { PACKAGE_FORMAT_VERSION } from './types';

export const RESULTS_FILE = 'results.json';
export const ARTIFACTS_DIR = 'artifacts';
export const DEFAULT_PACKAGE_DIR = 'playwright-dashboard-results';

/**
 * Validate a relative path from a package (results.json entry or zip entry).
 * Rejects absolute paths, drive letters, traversal and control characters.
 */
export function isSafeRelativePath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > 1024) return false;
  if (p.includes('\0')) return false;
  const posix = p.replace(/\\/g, '/');
  if (posix.startsWith('/') || /^[a-zA-Z]:/.test(posix)) return false;
  const parts = posix.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

export function classifyAttachment(name: string, contentType: string): ArtifactKind {
  const ct = (contentType || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (n === 'trace' || n.endsWith('trace.zip') || (ct === 'application/zip' && n.includes('trace'))) return 'trace';
  if (ct.startsWith('image/')) return 'screenshot';
  if (ct.startsWith('video/') || n.endsWith('.webm') || n.endsWith('.mp4')) return 'video';
  if (ct.startsWith('text/') || ct === 'application/json' || n.endsWith('.md') || n.endsWith('.txt')) return 'text';
  return 'other';
}

export function contentTypeFor(fileName: string, fallback = 'application/octet-stream'): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    webm: 'video/webm',
    mp4: 'video/mp4',
    zip: 'application/zip',
    json: 'application/json',
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    log: 'text/plain; charset=utf-8',
    html: 'text/html; charset=utf-8',
  };
  return map[ext] ?? fallback;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Structural validation of results.json before ingestion. */
export function validateResultPackage(input: unknown): ValidationResult {
  const errors: string[] = [];
  const pkg = input as Partial<ResultPackage> | null;
  if (!pkg || typeof pkg !== 'object') return { ok: false, errors: ['package is not an object'] };
  if (pkg.formatVersion !== PACKAGE_FORMAT_VERSION) {
    errors.push(`unsupported formatVersion ${String(pkg.formatVersion)} (expected ${PACKAGE_FORMAT_VERSION})`);
  }
  if (!pkg.run || typeof pkg.run !== 'object') errors.push('run is missing');
  else {
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(pkg.run.id ?? '')) errors.push('run.id is invalid');
    if (!pkg.run.startedAt || Number.isNaN(Date.parse(pkg.run.startedAt))) errors.push('run.startedAt is invalid');
  }
  if (!Array.isArray(pkg.tests)) errors.push('tests is not an array');
  else {
    pkg.tests.forEach((t, i) => {
      if (!/^[a-f0-9]{20}$/.test(t.testId ?? '')) errors.push(`tests[${i}].testId is invalid`);
      if (!t.file || !isSafeRelativePath(t.file)) errors.push(`tests[${i}].file is invalid`);
      if (!Array.isArray(t.attempts)) errors.push(`tests[${i}].attempts is not an array`);
      else
        t.attempts.forEach((a, j) => {
          (a.attachments ?? []).forEach((att, k) => {
            if (!isSafeRelativePath(att.path)) errors.push(`tests[${i}].attempts[${j}].attachments[${k}].path is unsafe`);
          });
        });
    });
  }
  return { ok: errors.length === 0, errors };
}
