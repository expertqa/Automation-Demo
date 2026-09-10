#!/usr/bin/env node
/* eslint-disable */
/**
 * Bootstrap for `npm run dashboard` from the repository root.
 * Installs the dashboard's own dependencies on first use, then runs the CLI with tsx.
 * Plain JavaScript on purpose: it must work before anything is installed.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`[qa-dashboard] Node.js 20 or newer is required (found ${process.version}).`);
  process.exit(1);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const shell = process.platform === 'win32';

if (!fs.existsSync(path.join(root, 'node_modules', 'tsx')) || !fs.existsSync(path.join(root, 'node_modules', 'better-sqlite3'))) {
  console.log('[qa-dashboard] installing dashboard dependencies (first run)…');
  const install = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell });
  if (install.status !== 0) {
    console.error('[qa-dashboard] dependency installation failed.');
    process.exit(install.status ?? 1);
  }
}

const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const result = spawnSync(process.execPath, [tsx, path.join(root, 'cli', 'index.ts'), ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    QA_DASHBOARD_REPO_ROOT: process.env.QA_DASHBOARD_REPO_ROOT || path.resolve(root, '..', '..'),
    // Where the user typed the command — relative import paths resolve against it.
    QA_DASHBOARD_INVOKE_CWD: process.env.INIT_CWD || process.cwd(),
  },
});
process.exit(result.status ?? 1);
