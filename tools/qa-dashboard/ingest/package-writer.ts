import fs from 'node:fs';
import path from 'node:path';
import type { PackageAttachmentRecord, ResultPackage } from '../shared/types';
import { ARTIFACTS_DIR, RESULTS_FILE, classifyAttachment, contentTypeFor } from '../shared/package-format';
import { sanitizeFileName } from '../artifacts/store';

const MAX_INLINE_BODY_BYTES = 5 * 1024 * 1024;

/**
 * Writes a result package directory:
 *   <dir>/results.json
 *   <dir>/artifacts/<testId>/<name>-r<retry>[-<project>].<ext>
 *
 * Only node built-ins are used so this can run inside the Playwright process
 * on CI machines where the dashboard dependencies are not installed.
 */
export class PackageWriter {
  private readonly used = new Set<string>();

  constructor(public readonly dir: string) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, ARTIFACTS_DIR), { recursive: true });
  }

  /** Copy or write an attachment into the package. Returns the record to embed in results.json, or null if skipped. */
  addAttachment(input: {
    testId: string;
    project: string;
    retry: number;
    name: string;
    contentType: string;
    sourcePath?: string;
    body?: Buffer;
    multiProject: boolean;
  }): PackageAttachmentRecord | null {
    const kind = classifyAttachment(input.name, input.contentType);
    const ext = pickExtension(input.name, input.sourcePath, input.contentType);
    const base = sanitizeFileName(input.name.replace(/\.[A-Za-z0-9]+$/, '')) || kind;
    const projectPart = input.multiProject && input.project ? `-${sanitizeFileName(input.project)}` : '';
    let fileName = `${base}-r${input.retry}${projectPart}${ext}`;
    let counter = 2;
    let rel = `${ARTIFACTS_DIR}/${input.testId}/${fileName}`;
    while (this.used.has(rel)) {
      fileName = `${base}-r${input.retry}${projectPart}-${counter++}${ext}`;
      rel = `${ARTIFACTS_DIR}/${input.testId}/${fileName}`;
    }
    const abs = path.join(this.dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });

    let size = 0;
    if (input.sourcePath) {
      if (!fs.existsSync(input.sourcePath)) return null;
      fs.copyFileSync(input.sourcePath, abs);
      size = fs.statSync(abs).size;
    } else if (input.body) {
      if (input.body.length > MAX_INLINE_BODY_BYTES) return null;
      fs.writeFileSync(abs, input.body);
      size = input.body.length;
    } else {
      return null;
    }
    this.used.add(rel);
    return { name: input.name, contentType: input.contentType || contentTypeFor(fileName), kind, path: rel, size };
  }

  writeResults(pkg: ResultPackage): string {
    const file = path.join(this.dir, RESULTS_FILE);
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2), 'utf8');
    return file;
  }
}

function pickExtension(name: string, sourcePath: string | undefined, contentType: string): string {
  const fromSource = sourcePath ? path.extname(sourcePath) : '';
  if (fromSource) return fromSource.toLowerCase();
  const fromName = path.extname(name);
  if (fromName) return fromName.toLowerCase();
  const ct = contentType.toLowerCase();
  if (ct.startsWith('image/png')) return '.png';
  if (ct.startsWith('image/jpeg')) return '.jpg';
  if (ct.startsWith('video/webm')) return '.webm';
  if (ct === 'application/zip') return '.zip';
  if (ct.startsWith('text/markdown')) return '.md';
  if (ct.startsWith('text/')) return '.txt';
  if (ct === 'application/json') return '.json';
  return '.bin';
}
