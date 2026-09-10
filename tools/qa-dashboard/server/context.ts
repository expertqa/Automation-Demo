import type { DbHandle } from '../database/client';
import { openDatabase } from '../database/client';
import { ArtifactStore } from '../artifacts/store';
import type { DashboardPaths } from '../shared/paths';
import { ensureDashboardDirs, resolveDashboardPaths } from '../shared/paths';
import { SettingsService } from './services/settings';
import { createTraceAdapter, type TraceAdapter } from './trace/adapter';
import { createLogger, type Logger } from './logger';

export interface AppContext {
  paths: DashboardPaths;
  dbHandle: DbHandle;
  store: ArtifactStore;
  settings: SettingsService;
  trace: TraceAdapter;
  logger: Logger;
  version: string;
  close(): void;
}

export function createAppContext(options: { dataDir?: string; repoRoot?: string; dbHandle?: DbHandle; logger?: Logger } = {}): AppContext {
  const paths = resolveDashboardPaths({ dataDir: options.dataDir, repoRoot: options.repoRoot });
  ensureDashboardDirs(paths);
  const logger = options.logger ?? createLogger('server');
  const dbHandle = options.dbHandle ?? openDatabase(paths.databaseFile);
  const store = new ArtifactStore(paths.artifactsDir);
  const settings = new SettingsService(dbHandle.db);
  const trace = createTraceAdapter({ repoRoot: paths.repoRoot, store, logger: logger.child('trace') });
  return {
    paths,
    dbHandle,
    store,
    settings,
    trace,
    logger,
    version: '1.0.0',
    close: () => {
      if (!options.dbHandle) dbHandle.close();
    },
  };
}
