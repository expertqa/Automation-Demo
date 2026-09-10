import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

export type DashboardDb = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  db: DashboardDb;
  sqlite: Database.Database;
  file: string;
  close(): void;
}

const MIGRATIONS_FOLDER = path.join(__dirname, 'migrations');

/**
 * Open (creating if necessary) the SQLite database and apply pending migrations.
 * Pass ':memory:' for tests.
 */
export function openDatabase(file: string): DbHandle {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db,
    sqlite,
    file,
    close: () => sqlite.close(),
  };
}

export { schema };
