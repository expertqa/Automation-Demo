import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactPathError, ArtifactStore, sanitizeFileName } from '../../artifacts/store';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-store-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('ArtifactStore', () => {
  it('resolves only inside the root', () => {
    const store = new ArtifactStore(root);
    expect(store.resolve('run_1/abc/x.png')).toBe(path.join(root, 'run_1', 'abc', 'x.png'));
    expect(() => store.resolve('../x.png')).toThrow(ArtifactPathError);
    expect(() => store.resolve('/etc/passwd')).toThrow(ArtifactPathError);
    expect(() => store.resolve('run_1/../../x')).toThrow(ArtifactPathError);
  });
  it('builds de-duplicated relative paths and moves files', () => {
    const store = new ArtifactStore(root);
    const src = path.join(root, 'src.png');
    fs.writeFileSync(src, 'png');
    const rel = store.relativePathFor('run_1', 'abcdef0123', 'screenshot-r0.png');
    expect(rel).toBe('run_1/abcdef0123/screenshot-r0.png');
    expect(store.put(src, rel)).toBe(3);
    expect(fs.existsSync(src)).toBe(false);
    expect(store.exists(rel)).toBe(true);
    const rel2 = store.relativePathFor('run_1', 'abcdef0123', 'screenshot-r0.png');
    expect(rel2).toBe('run_1/abcdef0123/screenshot-r0-2.png');
    expect(() => store.relativePathFor('../bad', 'abcdef', 'x')).toThrow(ArtifactPathError);
    store.removeRun('run_1');
    expect(store.exists(rel)).toBe(false);
  });
  it('sanitises file names', () => {
    expect(sanitizeFileName('../../evil name?.png')).toBe('evil-name-.png');
    expect(sanitizeFileName('C:\\dir\\file.webm')).toBe('file.webm');
    expect(sanitizeFileName('')).toBe('artifact');
  });
});
