import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { DbHandle } from '../database/client';
import type { DashboardPaths } from '../shared/paths';
import { ensureDashboardDirs } from '../shared/paths';
import { RESULTS_FILE, isSafeRelativePath } from '../shared/package-format';
import { IngestError, ingestPackageDirectory, type IngestSummary } from './ingest-package';
import { createLogger, type Logger } from '../server/logger';

export interface ImportOptions {
  paths: DashboardPaths;
  dbHandle?: DbHandle;
  replace?: boolean;
  logger?: Logger;
  /** Mark imported runs with this source (default 'import'). */
  source?: 'import' | 'ci' | 'demo';
}

const MAX_ZIP_ENTRIES = 50_000;
const MAX_ZIP_TOTAL_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB guard

/**
 * Import one or more result packages from:
 *   - a package directory (contains results.json)
 *   - a zip file (GitHub Actions artifact download, or `npm run dashboard:package`)
 *   - a directory containing several packages / zips (e.g. `gh run download` output)
 */
export async function importPath(inputPath: string, options: ImportOptions): Promise<IngestSummary[]> {
  const log = options.logger ?? createLogger('import');
  const abs = path.resolve(inputPath);
  if (!fs.existsSync(abs)) throw new IngestError(`path does not exist: ${abs}`);
  ensureDashboardDirs(options.paths);
  const stat = fs.statSync(abs);

  if (stat.isFile()) {
    if (!/\.zip$/i.test(abs)) throw new IngestError(`unsupported file type (expected .zip): ${abs}`);
    return importZip(abs, options, log);
  }

  const packages = findPackageDirs(abs, 3);
  const zips = findZipFiles(abs, 2);
  if (packages.length === 0 && zips.length === 0) {
    throw new IngestError(`no ${RESULTS_FILE} or .zip packages found under ${abs}`);
  }
  const summaries: IngestSummary[] = [];
  for (const dir of packages) {
    summaries.push(await ingestPackageDirectory(dir, { ...options, moveArtifacts: false, sourceOverride: options.source ?? 'import', logger: log }));
  }
  for (const zip of zips) {
    summaries.push(...(await importZip(zip, options, log)));
  }
  return summaries;
}

async function importZip(zipFile: string, options: ImportOptions, log: Logger): Promise<IngestSummary[]> {
  const tmp = fs.mkdtempSync(path.join(options.paths.tmpDir, 'import-'));
  try {
    await extractZip(zipFile, tmp);
    const packages = findPackageDirs(tmp, 3);
    if (packages.length === 0) throw new IngestError(`${zipFile} does not contain a ${RESULTS_FILE}`);
    const out: IngestSummary[] = [];
    for (const dir of packages) {
      out.push(await ingestPackageDirectory(dir, { ...options, moveArtifacts: true, sourceOverride: options.source ?? 'import', logger: log }));
    }
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function findPackageDirs(root: string, maxDepth: number): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (fs.existsSync(path.join(dir, RESULTS_FILE))) {
      found.push(dir);
      return;
    }
    if (depth >= maxDepth) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'artifacts') walk(path.join(dir, entry.name), depth + 1);
    }
  };
  walk(root, 0);
  return found.sort();
}

function findZipFiles(root: string, maxDepth: number): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isFile() && /\.zip$/i.test(entry.name) && !/trace/i.test(entry.name)) found.push(p);
      else if (entry.isDirectory() && depth < maxDepth && entry.name !== 'artifacts') walk(p, depth + 1);
    }
  };
  walk(root, 0);
  return found.sort();
}

/** Extract a zip safely: validates every entry name, refuses symlinks, caps entry count and size. */
export function extractZip(zipFile: string, destDir: string): Promise<void> {
  const destRoot = path.resolve(destDir) + path.sep;
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('failed to open zip'));
      let entries = 0;
      let total = 0;
      zip.on('error', reject);
      zip.on('end', () => resolve());
      zip.on('entry', (entry: yauzl.Entry) => {
        entries++;
        if (entries > MAX_ZIP_ENTRIES) return reject(new IngestError('zip has too many entries'));
        const name = entry.fileName;
        if (!isSafeRelativePath(name.replace(/\/$/, ''))) return reject(new IngestError(`unsafe zip entry: ${name}`));
        const isSymlink = ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000;
        if (isSymlink) return reject(new IngestError(`symlink entries are not allowed: ${name}`));
        const target = path.resolve(destDir, name);
        if (!target.startsWith(destRoot)) return reject(new IngestError(`zip entry escapes destination: ${name}`));
        if (name.endsWith('/')) {
          fs.mkdirSync(target, { recursive: true });
          zip.readEntry();
          return;
        }
        total += entry.uncompressedSize;
        if (total > MAX_ZIP_TOTAL_BYTES) return reject(new IngestError('zip is too large'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error('failed to read zip entry'));
          const out = fs.createWriteStream(target);
          stream.on('error', reject);
          out.on('error', reject);
          out.on('finish', () => zip.readEntry());
          stream.pipe(out);
        });
      });
      zip.readEntry();
    });
  });
}

/** Zip a package directory (used by `npm run dashboard:package` for manual sharing). */
export function zipDirectory(sourceDir: string, zipFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.isFile()) zip.addFile(p, path.relative(sourceDir, p).split(path.sep).join('/'));
      }
    };
    walk(sourceDir);
    zip.end();
    const out = fs.createWriteStream(zipFile);
    out.on('close', () => resolve());
    out.on('error', reject);
    zip.outputStream.on('error', reject);
    zip.outputStream.pipe(out);
  });
}
