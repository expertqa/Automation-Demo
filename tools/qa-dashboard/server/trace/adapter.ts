import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ArtifactStore } from '../../artifacts/store';
import type { Logger } from '../logger';

/**
 * Trace handling is isolated behind this interface so the strategy can change
 * (e.g. an embedded viewer) without touching routes or UI.
 */
export interface TraceAdapter {
  readonly strategy: string;
  /** Whether a local Playwright install is available to launch the official viewer. */
  isAvailable(): boolean;
  playwrightVersion(): string | null;
  /** Launch the official Playwright Trace Viewer for a stored artifact (validated relative path). */
  open(relativeArtifactPath: string): Promise<{ ok: boolean; message: string }>;
  /** URL of the hosted viewer pointed at a trace served by this dashboard. */
  hostedViewerUrl(traceUrl: string): string;
}

export interface TraceAdapterOptions {
  repoRoot: string;
  store: ArtifactStore;
  logger: Logger;
}

/**
 * Default strategy: `npx playwright show-trace <file>` using the Playwright that the
 * repository itself has installed (same version that recorded the trace).
 */
export class PlaywrightCliTraceAdapter implements TraceAdapter {
  readonly strategy = 'playwright-cli';
  private readonly cliPath: string | null;
  private readonly version: string | null;

  constructor(private readonly opts: TraceAdapterOptions) {
    const found = findPlaywrightCli(opts.repoRoot);
    this.cliPath = found?.cli ?? null;
    this.version = found?.version ?? null;
  }

  isAvailable(): boolean {
    return this.cliPath !== null;
  }

  playwrightVersion(): string | null {
    return this.version;
  }

  async open(relativeArtifactPath: string): Promise<{ ok: boolean; message: string }> {
    // ArtifactStore.resolve throws on traversal; the path always comes from a DB row, never from the client.
    const abs = this.opts.store.resolve(relativeArtifactPath);
    if (!fs.existsSync(abs)) return { ok: false, message: 'trace file is missing on disk' };
    if (!this.cliPath) return { ok: false, message: 'Playwright CLI not found in the repository; run npm install' };

    const child = spawn(process.execPath, [this.cliPath, 'show-trace', abs], {
      cwd: this.opts.repoRoot,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PW_DISABLE_TELEMETRY: '1' },
    });
    child.unref();
    this.opts.logger.info(`launched trace viewer for ${relativeArtifactPath} (pid ${child.pid ?? '?'})`);
    return { ok: true, message: 'Playwright Trace Viewer launched in a new window' };
  }

  hostedViewerUrl(traceUrl: string): string {
    return `https://trace.playwright.dev/?trace=${encodeURIComponent(traceUrl)}`;
  }
}

export function createTraceAdapter(opts: TraceAdapterOptions): TraceAdapter {
  return new PlaywrightCliTraceAdapter(opts);
}

/** Locate playwright's cli.js starting from the repo root, then from the dashboard itself. */
export function findPlaywrightCli(repoRoot: string): { cli: string; version: string } | null {
  const candidates = [repoRoot, path.join(__dirname, '..', '..')];
  for (const base of candidates) {
    for (const pkg of ['playwright', '@playwright/test']) {
      try {
        const pkgJson = require.resolve(`${pkg}/package.json`, { paths: [base] });
        const dir = path.dirname(pkgJson);
        const cli = path.join(dir, 'cli.js');
        if (fs.existsSync(cli)) {
          const version = (JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as { version?: string }).version ?? 'unknown';
          return { cli, version };
        }
      } catch {
        /* try next */
      }
    }
  }
  return null;
}
