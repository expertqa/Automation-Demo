import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DbHandle } from '../../database/client';
import { IngestError, ingestPackage, ingestPackageDirectory, fingerprint } from '../../ingest/ingest-package';
import { extractZip, findPackageDirs, importPath, zipDirectory } from '../../ingest/importer';
import { silentLogger } from '../../server/logger';
import { makePackage, tempPaths, writePackage } from './helpers';

let paths: ReturnType<typeof tempPaths>;
let db: DbHandle;
beforeEach(() => {
  paths = tempPaths();
  fs.mkdirSync(paths.tmpDir, { recursive: true });
  db = openDatabase(paths.databaseFile);
});
afterEach(() => {
  db.close();
  paths.cleanup();
});

const count = (sql: string) => (db.sqlite.prepare(sql).get() as { c: number }).c;

describe('ingestPackage', () => {
  it('stores runs, suites, tests, attempts, errors and artifacts with correct routing', async () => {
    const pkg = makePackage({
      runId: 'run_test_001',
      tests: [
        { file: 'tests/login.spec.ts', title: 'logs in', describes: ['Auth'], status: 'passed' },
        { file: 'tests/login.spec.ts', title: 'rejects bad password', describes: ['Auth'], status: 'failed', attempts: ['failed', 'failed'] },
        { file: 'tests/checkout.spec.ts', title: 'pays', status: 'flaky' },
        { file: 'tests/checkout.spec.ts', title: 'gift cards', status: 'skipped' },
      ],
    });
    const dir = writePackage(pkg, path.join(paths.packagesDir, pkg.run.id));
    const summary = await ingestPackage(pkg, dir, { paths, dbHandle: db, moveArtifacts: true, removePackageDir: true, logger: silentLogger });

    expect(summary.counts).toMatchObject({ total: 4, passed: 1, failed: 1, flaky: 1, skipped: 1, retries: 2 });
    expect(count('SELECT COUNT(*) c FROM runs')).toBe(1);
    expect(count('SELECT COUNT(*) c FROM suites')).toBe(2);
    expect(count('SELECT COUNT(*) c FROM tests')).toBe(4);
    expect(count('SELECT COUNT(*) c FROM run_tests')).toBe(4);
    expect(count('SELECT COUNT(*) c FROM test_attempts')).toBe(6);
    expect(count('SELECT COUNT(*) c FROM errors')).toBe(3);
    // 3 failed attempts × (screenshot + video + trace + error-context)
    expect(count('SELECT COUNT(*) c FROM artifacts')).toBe(12);
    expect(summary.artifacts).toBe(12);
    expect(fs.existsSync(dir)).toBe(false); // package removed after move

    const artifacts = db.sqlite.prepare('SELECT kind, relative_path FROM artifacts ORDER BY id').all() as { kind: string; relative_path: string }[];
    for (const a of artifacts) {
      expect(a.relative_path.startsWith('run_test_001/')).toBe(true);
      expect(fs.existsSync(path.join(paths.artifactsDir, a.relative_path))).toBe(true);
    }
    expect(new Set(artifacts.map((a) => a.kind))).toEqual(new Set(['screenshot', 'video', 'trace', 'text']));

    const run = db.sqlite.prepare('SELECT status, branch, commit_sha, repository_url, failed FROM runs').get() as Record<string, unknown>;
    expect(run).toMatchObject({ status: 'failed', branch: 'main', repository_url: 'https://github.com/org/repo', failed: 1 });
    const suite = db.sqlite.prepare("SELECT name FROM suites WHERE name = 'Auth'").get();
    expect(suite).toBeTruthy();
    const rs = db.sqlite.prepare('SELECT total, passed, failed FROM run_suites ORDER BY total DESC').all();
    expect(rs).toEqual([
      { total: 2, passed: 1, failed: 1 },
      { total: 2, passed: 0, failed: 0 },
    ]);
  });

  it('keeps a stable test identity across runs and updates last_seen', async () => {
    const a = makePackage({ runId: 'run_a', tests: [{ file: 'tests/x.spec.ts', title: 't', status: 'passed' }], startedAt: '2026-01-01T00:00:00.000Z' });
    const b = makePackage({ runId: 'run_b', tests: [{ file: 'tests/x.spec.ts', title: 't', status: 'failed' }], startedAt: '2026-01-02T00:00:00.000Z' });
    await ingestPackage(a, writePackage(a, path.join(paths.packagesDir, 'a')), { paths, dbHandle: db, logger: silentLogger });
    await ingestPackage(b, writePackage(b, path.join(paths.packagesDir, 'b')), { paths, dbHandle: db, logger: silentLogger });
    expect(count('SELECT COUNT(*) c FROM tests')).toBe(1);
    expect(count('SELECT COUNT(*) c FROM run_tests')).toBe(2);
  });

  it('refuses duplicate run ids unless replace is set', async () => {
    const pkg = makePackage({ runId: 'run_dup', tests: [{ file: 'tests/x.spec.ts', title: 't', status: 'failed' }] });
    const dir = writePackage(pkg, path.join(paths.packagesDir, 'dup'));
    await ingestPackage(pkg, dir, { paths, dbHandle: db, logger: silentLogger });
    await expect(ingestPackage(pkg, dir, { paths, dbHandle: db, logger: silentLogger })).rejects.toBeInstanceOf(IngestError);
    await ingestPackage(pkg, dir, { paths, dbHandle: db, logger: silentLogger, replace: true });
    expect(count('SELECT COUNT(*) c FROM runs')).toBe(1);
    expect(count('SELECT COUNT(*) c FROM artifacts')).toBe(4);
  });

  it('rejects invalid packages and skips attachments outside the package', async () => {
    const dir = path.join(paths.packagesDir, 'bad');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'results.json'), '{"formatVersion":1}');
    await expect(ingestPackageDirectory(dir, { paths, dbHandle: db, logger: silentLogger })).rejects.toThrow(/invalid result package/);

    const pkg = makePackage({ runId: 'run_escape', tests: [{ file: 'tests/x.spec.ts', title: 't', status: 'failed' }] });
    const okDir = writePackage(pkg, path.join(paths.packagesDir, 'escape'), false);
    pkg.tests[0]!.attempts[0]!.attachments.push({ name: 'evil', contentType: 'image/png', kind: 'screenshot', path: 'artifacts/../../../etc/passwd', size: 1 });
    fs.writeFileSync(path.join(okDir, 'results.json'), JSON.stringify(pkg));
    await expect(ingestPackageDirectory(okDir, { paths, dbHandle: db, logger: silentLogger })).rejects.toThrow(/unsafe/);
  });

  it('fingerprints error messages by first line without volatile numbers', () => {
    expect(fingerprint('Error: Timeout 30000ms exceeded.\nCall log')).toBe('Error: Timeout Nms exceeded.');
    expect(fingerprint('Error: expect(page).toHaveURL failed https://x.test/12345')).toBe('Error: expect(page).toHaveURL failed URL');
  });
});

describe('importer', () => {
  it('imports a package directory (copy, not move) and a zip (safe extraction)', async () => {
    const pkg = makePackage({ runId: 'run_import_dir', tests: [{ file: 'tests/x.spec.ts', title: 't', status: 'failed' }] });
    const src = writePackage(pkg, path.join(paths.dataDir, 'incoming', 'pkg'));
    const summaries = await importPath(src, { paths, dbHandle: db, logger: silentLogger });
    expect(summaries[0]?.runId).toBe('run_import_dir');
    expect(fs.existsSync(path.join(src, 'results.json'))).toBe(true); // directory import copies
    expect(db.sqlite.prepare("SELECT source FROM runs WHERE id = 'run_import_dir'").get()).toEqual({ source: 'import' });

    const pkg2 = makePackage({ runId: 'run_import_zip', tests: [{ file: 'tests/y.spec.ts', title: 'u', status: 'flaky' }] });
    const src2 = writePackage(pkg2, path.join(paths.dataDir, 'incoming', 'pkg2'));
    const zipFile = path.join(paths.dataDir, 'playwright-dashboard-results.zip');
    await zipDirectory(src2, zipFile);
    const fromZip = await importPath(zipFile, { paths, dbHandle: db, logger: silentLogger });
    expect(fromZip[0]?.runId).toBe('run_import_zip');
    expect(count('SELECT COUNT(*) c FROM runs')).toBe(2);
    expect(fs.readdirSync(paths.tmpDir)).toEqual([]); // temp extraction cleaned up
  });

  it('finds nested packages and rejects zip-slip entries', async () => {
    const pkg = makePackage({ runId: 'run_nested', tests: [{ file: 'tests/x.spec.ts', title: 't', status: 'passed' }] });
    writePackage(pkg, path.join(paths.dataDir, 'download', 'artifact-1', 'playwright-dashboard-results'));
    expect(findPackageDirs(path.join(paths.dataDir, 'download'), 3)).toHaveLength(1);
    const summaries = await importPath(path.join(paths.dataDir, 'download'), { paths, dbHandle: db, logger: silentLogger });
    expect(summaries).toHaveLength(1);

    // Hand-craft a stored (uncompressed) zip whose only entry is "../evil.txt".
    const evilPath = path.join(paths.dataDir, 'evil.zip');
    fs.writeFileSync(evilPath, buildStoredZip('../evil.txt', Buffer.from('x')));
    const dest = path.join(paths.tmpDir, 'evil-out');
    fs.mkdirSync(dest, { recursive: true });
    await expect(extractZip(evilPath, dest)).rejects.toThrow(/unsafe zip entry|invalid relative path/);
    expect(fs.existsSync(path.join(paths.tmpDir, 'evil.txt'))).toBe(false);
  });

  it('errors clearly on missing or unsupported paths', async () => {
    await expect(importPath(path.join(paths.dataDir, 'nope'), { paths, dbHandle: db, logger: silentLogger })).rejects.toThrow(/does not exist/);
    const txt = path.join(paths.dataDir, 'x.txt');
    fs.writeFileSync(txt, 'x');
    await expect(importPath(txt, { paths, dbHandle: db, logger: silentLogger })).rejects.toThrow(/unsupported/);
  });
});

/** Minimal ZIP writer (STORE method) so tests can create archives yazl refuses to produce. */
function buildStoredZip(name: string, data: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  const localPart = Buffer.concat([local, nameBuf, data]);
  const centralPart = Buffer.concat([central, nameBuf]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localPart, centralPart, end]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
