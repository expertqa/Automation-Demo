import { useCallback, useEffect, useState } from 'react';

const KEY = 'qa-dashboard-theme';

export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(KEY, dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [dark]);
  const toggle = useCallback(() => setDark((d) => !d), []);
  return { dark, toggle };
}
