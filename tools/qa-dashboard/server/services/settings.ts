import { eq } from 'drizzle-orm';
import type { DashboardDb } from '../../database/client';
import { schema } from '../../database/client';
import type { DashboardSettings, FlakyConfig } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { normalizeRepositoryUrl } from '../../shared/github';

const KEY = 'dashboard';

export class SettingsService {
  constructor(private readonly db: DashboardDb) {}

  get(): DashboardSettings {
    const row = this.db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
    if (!row) return structuredClone(DEFAULT_SETTINGS);
    try {
      return mergeSettings(JSON.parse(row.valueJson));
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  update(patch: unknown): DashboardSettings {
    const merged = mergeSettings(patch, this.get());
    this.db
      .insert(schema.settings)
      .values({ key: KEY, valueJson: JSON.stringify(merged), updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: schema.settings.key, set: { valueJson: JSON.stringify(merged), updatedAt: new Date().toISOString() } })
      .run();
    return merged;
  }

  reset(): DashboardSettings {
    this.db.delete(schema.settings).where(eq(schema.settings.key, KEY)).run();
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function clampNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Validate + merge a partial settings object over a base. */
export function mergeSettings(input: unknown, base: DashboardSettings = DEFAULT_SETTINGS): DashboardSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Partial<DashboardSettings>;
  const f = (src.flaky ?? {}) as Partial<FlakyConfig>;
  const flaky: FlakyConfig = {
    windowRuns: Math.round(clampNumber(f.windowRuns, base.flaky.windowRuns, 2, 500)),
    minExecutions: Math.round(clampNumber(f.minExecutions, base.flaky.minExecutions, 1, 500)),
    failureRateMin: clampNumber(f.failureRateMin, base.flaky.failureRateMin, 0, 1),
    failureRateMax: clampNumber(f.failureRateMax, base.flaky.failureRateMax, 0, 1),
    countRetryPass: typeof f.countRetryPass === 'boolean' ? f.countRetryPass : base.flaky.countRetryPass,
    minTransitions: Math.round(clampNumber(f.minTransitions, base.flaky.minTransitions, 1, 500)),
  };
  if (flaky.failureRateMin >= flaky.failureRateMax) {
    flaky.failureRateMin = base.flaky.failureRateMin;
    flaky.failureRateMax = base.flaky.failureRateMax;
  }
  const gh = (src.github ?? {}) as Partial<DashboardSettings['github']>;
  const repositoryUrl =
    gh.repositoryUrl === undefined ? base.github.repositoryUrl : gh.repositoryUrl ? normalizeRepositoryUrl(String(gh.repositoryUrl)) : null;
  return { flaky, github: { repositoryUrl } };
}
