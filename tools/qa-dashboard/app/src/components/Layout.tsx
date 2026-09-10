import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, Bug, FlaskConical, Folder, History, LayoutDashboard, ListChecks, Moon, Search, Settings, Sun, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useScope } from '@/hooks/useScope';
import { useFilters, useSearch, useSettings } from '@/lib/api';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/runs', label: 'Test Runs', icon: Activity },
  { to: '/suites', label: 'Test Suites', icon: Folder },
  { to: '/tests', label: 'Tests', icon: ListChecks },
  { to: '/failures', label: 'Failures', icon: Bug },
  { to: '/flaky', label: 'Flaky Tests', icon: AlertTriangle },
  { to: '/history', label: 'History', icon: History },
];

export function Layout() {
  const { dark, toggle } = useTheme();
  const { scope, setScope, params } = useScope();
  const filters = useFilters();
  const settings = useSettings();
  const scopeQuery = params.toString();
  const withScope = (to: string) => {
    const keep = new URLSearchParams();
    for (const k of ['branch', 'environment', 'project']) {
      const v = params.get(k);
      if (v) keep.set(k, v);
    }
    const s = keep.toString();
    return s ? `${to}?${s}` : to;
  };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[216px] shrink-0 flex-col border-r border-border bg-card/60 md:flex">
        <div className="flex h-12 items-center gap-2 border-b border-border px-4">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FlaskConical className="h-3.5 w-3.5" />
          </span>
          <span className="text-[13px] font-semibold tracking-tight">QA Dashboard</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={withScope(n.to)}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  isActive && 'bg-accent text-foreground font-medium',
                )
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-2">
          <NavLink
            to={withScope('/settings')}
            className={({ isActive }) =>
              cn('flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground', isActive && 'bg-accent text-foreground font-medium')
            }
          >
            <Settings className="h-4 w-4" />
            Settings
          </NavLink>
          <div className="px-2.5 pt-2 text-[11px] text-muted-foreground">
            {settings.data?.info.repositoryUrl ? (
              <a href={settings.data.info.repositoryUrl} target="_blank" rel="noreferrer" className="truncate block hover:text-foreground" title={settings.data.info.repositoryUrl}>
                {settings.data.info.repositoryUrl.replace('https://github.com/', '')}
              </a>
            ) : (
              'local · 127.0.0.1'
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
          <Link to="/" className="mr-1 text-[13px] font-semibold md:hidden">
            QA
          </Link>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <Select
              aria-label="Branch"
              className="w-[150px] hidden sm:block"
              placeholder="All branches"
              value={scope.branch ?? ''}
              onChange={(e) => setScope({ branch: e.target.value || undefined })}
              options={(filters.data?.branches ?? []).map((b) => ({ value: b, label: b }))}
            />
            <Select
              aria-label="Environment"
              className="w-[140px] hidden sm:block"
              placeholder="All environments"
              value={scope.environment ?? ''}
              onChange={(e) => setScope({ environment: e.target.value || undefined })}
              options={(filters.data?.environments ?? []).map((b) => ({ value: b, label: b }))}
            />
            <Select
              aria-label="Project"
              className="w-[130px] hidden lg:block"
              placeholder="All projects"
              value={scope.project ?? ''}
              onChange={(e) => setScope({ project: e.target.value || undefined })}
              options={(filters.data?.projects ?? []).map((b) => ({ value: b, label: b }))}
            />
            {(scope.branch || scope.environment || scope.project) && (
              <Button variant="ghost" size="sm" onClick={() => setScope({ branch: undefined, environment: undefined, project: undefined })} title="Clear scope">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1 md:hidden">
          {[...NAV, { to: '/settings', label: 'Settings', icon: Settings, end: false }].map((n) => (
            <NavLink key={n.to} to={withScope(n.to)} end={n.end} className={({ isActive }) => cn('rounded-md px-2 py-1 text-xs whitespace-nowrap', isActive ? 'bg-accent font-medium' : 'text-muted-foreground')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 px-4 py-5 md:px-6" key={scopeQuery.includes('branch') ? 'scoped' : 'all'}>
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const results = useSearch(q);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.querySelector('input')?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  const items = results.data?.results ?? [];
  return (
    <div ref={ref} className="relative w-full max-w-[420px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const first = items[0];
            if (first) {
              navigate(first.href);
              setOpen(false);
            } else if (q.trim()) {
              navigate(`/tests?q=${encodeURIComponent(q.trim())}`);
              setOpen(false);
            }
          }
        }}
        placeholder="Search tests, suites, files, run IDs…  ⌘K"
        aria-label="Global search"
        className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-[13px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-9 z-40 max-h-[360px] overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {items.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">{results.isFetching ? 'Searching…' : 'No matches'}</div>}
          {items.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              type="button"
              onClick={() => {
                navigate(r.href);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent"
            >
              <Badge variant="outline" className="w-12 justify-center uppercase text-[10px]">
                {r.kind}
              </Badge>
              <span className="truncate font-medium">{r.title}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">{r.subtitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
