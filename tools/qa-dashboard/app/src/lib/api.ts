import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type {
  FailuresResponse,
  FilterOptions,
  FlakyItem,
  HistoryResponse,
  OverviewResponse,
  Paginated,
  RunDetail,
  RunSummary,
  RunTestDetail,
  SearchResult,
  SettingsResponse,
  SuiteDetail,
  SuiteListItem,
  TestDetailResponse,
  TestListItem,
  TraceOpenResponse,
} from '@shared/api';
import type { FlakyConfig } from '@shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Params = Record<string, string | number | boolean | undefined | null>;

export function qs(params: Params = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, ...init });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

function useApi<T>(key: unknown[], path: string, options?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({ queryKey: key, queryFn: () => api<T>(path), staleTime: 15_000, ...options });
}

export const useOverview = (p: Params) => useApi<OverviewResponse>(['overview', p], `/overview${qs(p)}`);
export const useHistory = (p: Params) => useApi<HistoryResponse>(['history', p], `/history${qs(p)}`);
export const useFilters = () => useApi<FilterOptions>(['filters'], '/filters', { staleTime: 60_000 });
export const useRuns = (p: Params) => useApi<Paginated<RunSummary>>(['runs', p], `/runs${qs(p)}`);
export const useRun = (id: string | undefined) => useApi<RunDetail>(['run', id], `/runs/${id}`, { enabled: !!id });
export const useRunTest = (id: string | undefined) => useApi<RunTestDetail>(['run-test', id], `/run-tests/${id}`, { enabled: !!id });
export const useTests = (p: Params) => useApi<Paginated<TestListItem>>(['tests', p], `/tests${qs(p)}`);
export const useTest = (id: string | undefined, p: Params) => useApi<TestDetailResponse>(['test', id, p], `/tests/${id}${qs(p)}`, { enabled: !!id });
export const useSuites = (p: Params) => useApi<{ items: SuiteListItem[] }>(['suites', p], `/suites${qs(p)}`);
export const useSuite = (id: string | undefined, p: Params) => useApi<SuiteDetail>(['suite', id, p], `/suites/${id}${qs(p)}`, { enabled: !!id });
export const useFailures = (p: Params) => useApi<FailuresResponse>(['failures', p], `/failures${qs(p)}`);
export const useFlaky = (p: Params) => useApi<{ items: FlakyItem[]; config: FlakyConfig }>(['flaky', p], `/flaky${qs(p)}`);
export const useSettings = () => useApi<SettingsResponse>(['settings'], '/settings');
export const useSearch = (q: string) => useApi<{ results: SearchResult[] }>(['search', q], `/search${qs({ q })}`, { enabled: q.trim().length >= 2, staleTime: 5_000 });

export const openTrace = (artifactId: number) => api<TraceOpenResponse>(`/artifacts/${artifactId}/open-trace`, { method: 'POST' });
export const saveSettings = (body: unknown) => api<SettingsResponse>('/settings', { method: 'PUT', body: JSON.stringify(body) });
export const resetSettings = () => api<SettingsResponse>('/settings', { method: 'DELETE' });
export const deleteRun = (id: string) => api<{ ok: boolean }>(`/runs/${id}`, { method: 'DELETE' });

export interface TriggerCiInput {
  testFile?: string;
  grep?: string;
  label: string;
  headed?: boolean;
}
export interface TriggerCiResponse {
  ok: boolean;
  actionsUrl: string;
}
export const triggerCi = (body: TriggerCiInput) => api<TriggerCiResponse>('/ci/run', { method: 'POST', body: JSON.stringify(body) });
export const deleteDemoData = () => api<{ ok: boolean; removed: number }>('/demo-data', { method: 'DELETE' });
