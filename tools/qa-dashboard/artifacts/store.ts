import fs from 'node:fs';
import path from 'node:path';
import { isSafeRelativePath } from '../shared/package-format';

/**
 * Artifact store — owns the on-disk layout
 *   <artifactsDir>/<runId>/<testId>/<file>
 * and guarantees no path can escape the root.
 */
export class ArtifactStore {
  constructor(public readonly root: string) {}

  /** Resolve a DB relative path to an absolute path, rejecting traversal. */
  resolve(relativePath: string): string {
    if (!isSafeRelativePath(relativePath)) throw new ArtifactPathError(`unsafe artifact path: ${relativePath}`);
    const abs = path.resolve(this.root, relativePath);
    const rootWithSep = path.resolve(this.root) + path.sep;
    if (!abs.startsWith(rootWithSep)) throw new ArtifactPathError(`artifact path escapes root: ${relativePath}`);
    return abs;
  }

  /** Build the relative path for a new artifact, de-duplicating names inside the test folder. */
  relativePathFor(runId: string, testId: string, fileName: string): string {
    const safeName = sanitizeFileName(fileName);
    if (!/^[A-Za-z0-9_-]+$/.test(runId) || !/^[a-f0-9]+$/.test(testId)) {
      throw new ArtifactPathError('invalid run or test id for artifact path');
    }
    let candidate = `${runId}/${testId}/${safeName}`;
    let i = 2;
    while (fs.existsSync(path.join(this.root, candidate))) {
      const ext = path.extname(safeName);
      candidate = `${runId}/${testId}/${safeName.slice(0, safeName.length - ext.length)}-${i}${ext}`;
      i++;
    }
    return candidate;
  }

  /** Move (or copy when crossing devices) a file into the store. Returns size in bytes. */
  put(sourceAbs: string, relativePath: string, { move = true }: { move?: boolean } = {}): number {
    const dest = this.resolve(relativePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (move) {
      try {
        fs.renameSync(sourceAbs, dest);
      } catch {
        fs.copyFileSync(sourceAbs, dest);
        fs.rmSync(sourceAbs, { force: true });
      }
    } else {
      fs.copyFileSync(sourceAbs, dest);
    }
    return fs.statSync(dest).size;
  }

  exists(relativePath: string): boolean {
    try {
      return fs.existsSync(this.resolve(relativePath));
    } catch {
      return false;
    }
  }

  stat(relativePath: string): fs.Stats | null {
    try {
      return fs.statSync(this.resolve(relativePath));
    } catch {
      return null;
    }
  }

  removeRun(runId: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new ArtifactPathError('invalid run id');
    fs.rmSync(path.join(this.root, runId), { recursive: true, force: true });
  }

  removeAll(): void {
    fs.rmSync(this.root, { recursive: true, force: true });
    fs.mkdirSync(this.root, { recursive: true });
  }
}

export class ArtifactPathError extends Error {}

export function sanitizeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').slice(0, 120);
  return cleaned || 'artifact';
}
