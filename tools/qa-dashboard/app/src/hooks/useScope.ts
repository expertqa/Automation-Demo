import { useSearchParams } from 'react-router-dom';

/**
 * Global scope (branch / environment / project) persisted in the URL so every
 * page — and any shared link — sees the same slice of data.
 */
export function useScope() {
  const [params, setParams] = useSearchParams();
  const scope = {
    branch: params.get('branch') ?? undefined,
    environment: params.get('environment') ?? undefined,
    project: params.get('project') ?? undefined,
  };
  const setScope = (patch: Partial<typeof scope>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete('page');
    setParams(next, { replace: true });
  };
  return { scope, setScope, params, setParams };
}

export function useQueryParam(key: string, fallback = ''): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = (v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== fallback) next.set(key, v);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  return [value, set];
}
