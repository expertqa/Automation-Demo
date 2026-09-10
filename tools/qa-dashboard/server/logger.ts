/** Tiny structured logger used outside Fastify (CLI, ingest, reporter helpers). */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): number {
  const l = (process.env.QA_DASHBOARD_LOG_LEVEL ?? 'info').toLowerCase() as LogLevel;
  return LEVELS[l] ?? 20;
}

export function createLogger(scope: string): Logger {
  const write = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (LEVELS[level] < currentLevel()) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}\n`;
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line);
  };
  return {
    debug: (m, meta) => write('debug', m, meta),
    info: (m, meta) => write('info', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    error: (m, meta) => write('error', m, meta),
    child: (s) => createLogger(`${scope}:${s}`),
  };
}

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};
