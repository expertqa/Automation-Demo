import { Link, useNavigate } from 'react-router-dom';
import { Github, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { HistoryStrip } from '@/components/HistoryStrip';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import { Pagination } from '@/components/Pagination';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useFilters, useTests } from '@/lib/api';
import { useQueryParam, useScope } from '@/hooks/useScope';
import { fileName, formatDuration, formatPercent, timeAgo } from '@/lib/utils';
import type { TestListItem } from '@shared/api';

export function TestsPage() {
  const { scope } = useScope();
  const [q, setQ] = useQueryParam('q');
  const [status, setStatus] = useQueryParam('status');
  const [suite, setSuite] = useQueryParam('suite');
  const [flaky, setFlaky] = useQueryParam('flaky');
  const [sort, setSort] = useQueryParam('sort', 'suite');
  const [page, setPage] = useQueryParam('page', '1');
  const filters = useFilters();
  const tests = useTests({ ...scope, q, status, suite, flaky, sort, page, pageSize: 50 });

  return (
    <>
      <PageHeader title="Tests" description="Every test known to the dashboard with its recent history. Identity is stable across runs, files and browsers." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative w-full sm:w-[280px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search tests" className="pl-8" placeholder="Title, suite, file…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select
            aria-label="Last status"
            className="w-[140px]"
            placeholder="Any status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'passed', label: 'Passed' },
              { value: 'failed', label: 'Failed' },
              { value: 'flaky', label: 'Flaky' },
              { value: 'skipped', label: 'Skipped' },
            ]}
          />
          <Select aria-label="Suite" className="w-[170px]" placeholder="All suites" value={suite} onChange={(e) => setSuite(e.target.value)} options={(filters.data?.suites ?? []).map((s) => ({ value: s.suiteId, label: s.name }))} />
          <Select
            aria-label="Flaky filter"
            className="w-[130px]"
            placeholder="All tests"
            value={flaky}
            onChange={(e) => setFlaky(e.target.value)}
            options={[{ value: 'true', label: 'Flaky only' }]}
          />
          <Select
            aria-label="Sort"
            className="ml-auto w-[150px]"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            options={[
              { value: 'suite', label: 'Sort: suite' },
              { value: 'title', label: 'Sort: title' },
              { value: 'lastRun', label: 'Sort: last run' },
              { value: 'passRate', label: 'Sort: pass rate' },
              { value: 'duration', label: 'Sort: duration' },
            ]}
          />
        </div>
        {tests.isLoading ? (
          <div className="p-3">
            <LoadingState />
          </div>
        ) : tests.error ? (
          <div className="p-3">
            <ErrorState error={tests.error} retry={() => tests.refetch()} />
          </div>
        ) : tests.data!.items.length === 0 ? (
          <div className="p-3">
            <EmptyState title="No tests match" />
          </div>
        ) : (
          <>
            <TestsTable tests={tests.data!.items} />
            <Pagination page={tests.data!.page} pageSize={tests.data!.pageSize} total={tests.data!.total} onChange={(p) => setPage(String(p))} />
          </>
        )}
      </Card>
    </>
  );
}

export function TestsTable({ tests, hideSuite = false }: { tests: TestListItem[]; hideSuite?: boolean }) {
  const navigate = useNavigate();
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH>Test</TH>
          {!hideSuite && <TH>Suite</TH>}
          <TH>Last status</TH>
          <TH>History</TH>
          <TH className="text-right">Pass rate</TH>
          <TH className="text-right">Avg duration</TH>
          <TH className="text-right">Runs</TH>
          <TH className="text-right">Last run</TH>
          <TH />
        </TR>
      </THead>
      <TBody>
        {tests.map((t) => (
          <TR key={t.testId} data-clickable="true" onClick={() => navigate(`/tests/${t.testId}`)} data-testid="test-list-row">
            <TD>
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.title}</span>
                {t.isFlaky && <Badge variant="flaky">flaky</Badge>}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {fileName(t.file)}:{t.line}
              </div>
            </TD>
            {!hideSuite && (
              <TD>
                <Link to={`/suites/${t.suiteId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                  {t.suite}
                </Link>
              </TD>
            )}
            <TD>{t.lastStatus ? <StatusBadge status={t.lastStatus} /> : <span className="text-xs text-muted-foreground">never run</span>}</TD>
            <TD onClick={(e) => e.stopPropagation()}>
              <HistoryStrip items={t.recent} reverse />
            </TD>
            <TD className={`text-right tabular ${t.passRate < 0.8 ? 'text-status-failed' : t.passRate < 0.95 ? 'text-status-flaky' : ''}`}>{t.executions ? formatPercent(t.passRate, 0) : '—'}</TD>
            <TD className="text-right tabular">{formatDuration(t.avgDurationMs)}</TD>
            <TD className="text-right tabular text-muted-foreground">{t.executions}</TD>
            <TD className="text-right text-xs text-muted-foreground">{timeAgo(t.lastStartedAt)}</TD>
            <TD className="text-right">
              {t.sourceUrl && (
                <a href={t.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground" title="View source on GitHub">
                  <Github className="h-3.5 w-3.5" />
                </a>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
