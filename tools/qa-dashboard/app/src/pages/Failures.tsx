import { useNavigate } from 'react-router-dom';
import { Github, Play, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import { Pagination } from '@/components/Pagination';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useFailures } from '@/lib/api';
import { useQueryParam, useScope } from '@/hooks/useScope';
import { fileName, formatDateTime, formatDuration } from '@/lib/utils';

export function FailuresPage() {
  const { scope } = useScope();
  const [run, setRun] = useQueryParam('run', 'latest');
  const [days, setDays] = useQueryParam('days', '7');
  const [q, setQ] = useQueryParam('q');
  const [page, setPage] = useQueryParam('page', '1');
  const navigate = useNavigate();
  const data = useFailures({ ...scope, run: run === 'all' ? undefined : run, days: run === 'all' ? days : undefined, q, page, pageSize: 50 });

  return (
    <>
      <PageHeader title="Failures" description="Failed, timed-out and interrupted executions with their error signatures." />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="relative w-full sm:w-[260px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search failures" className="pl-8" placeholder="Title, file, error…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select
              aria-label="Scope"
              className="w-[150px]"
              value={run}
              onChange={(e) => setRun(e.target.value)}
              options={[
                { value: 'latest', label: 'Latest run' },
                { value: 'all', label: 'All runs' },
              ]}
            />
            {run === 'all' && (
              <Select
                aria-label="Period"
                className="w-[130px]"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                options={[
                  { value: '1', label: 'Last 24h' },
                  { value: '7', label: 'Last 7 days' },
                  { value: '30', label: 'Last 30 days' },
                  { value: '90', label: 'Last 90 days' },
                ]}
              />
            )}
            {data.data && <span className="ml-auto text-xs text-muted-foreground tabular">{data.data.failures.total} failures</span>}
          </div>
          {data.isLoading ? (
            <div className="p-3">
              <LoadingState />
            </div>
          ) : data.error ? (
            <div className="p-3">
              <ErrorState error={data.error} retry={() => data.refetch()} />
            </div>
          ) : data.data!.failures.items.length === 0 ? (
            <div className="p-3">
              <EmptyState title="No failures" description={run === 'latest' ? 'The latest run is green.' : 'Nothing failed in this period.'} />
            </div>
          ) : (
            <>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Test</TH>
                    <TH>Error</TH>
                    <TH>Run</TH>
                    <TH className="text-right">Retries</TH>
                    <TH className="text-right">Duration</TH>
                    <TH className="text-right">When</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {data.data!.failures.items.map((f) => (
                    <TR key={f.runTestId} data-clickable="true" onClick={() => navigate(`/executions/${f.runTestId}?tab=error`)} data-testid="failure-row">
                      <TD>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={f.status} />
                          <span className="font-medium">{f.title}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {f.suite} · {fileName(f.file)}:{f.line} · {f.project}
                        </div>
                      </TD>
                      <TD className="max-w-[360px]">
                        <div className="truncate font-mono text-[11px] text-status-failed/90" title={f.errorSummary ?? ''}>
                          {f.errorSummary ?? '—'}
                        </div>
                      </TD>
                      <TD className="text-xs">
                        <div className="font-mono">{f.runId}</div>
                        <div className="text-muted-foreground">
                          {f.branch ?? '—'} · {f.environment}
                        </div>
                      </TD>
                      <TD className="text-right tabular text-xs">{f.retries}</TD>
                      <TD className="text-right tabular text-xs">{formatDuration(f.durationMs)}</TD>
                      <TD className="text-right text-xs text-muted-foreground">{formatDateTime(f.startedAt)}</TD>
                      <TD>
                        <span className="flex items-center justify-end gap-2 text-muted-foreground">
                          {f.hasTrace && <Play className="h-3.5 w-3.5" aria-label="trace available" />}
                          {f.sourceUrl && (
                            <a href={f.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-foreground" title="View source on GitHub">
                              <Github className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.data!.failures.page} pageSize={data.data!.failures.pageSize} total={data.data!.failures.total} onChange={(p) => setPage(String(p))} />
            </>
          )}
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Error signatures</CardTitle>
            <span className="text-xs text-muted-foreground">grouped by first line</span>
          </CardHeader>
          <div className="divide-y divide-border">
            {(data.data?.clusters ?? []).length === 0 && <div className="px-4 py-3 text-xs text-muted-foreground">No clusters.</div>}
            {(data.data?.clusters ?? []).map((c) => (
              <button
                key={c.fingerprint}
                type="button"
                onClick={() => setQ(c.sample.slice(0, 40))}
                className="flex w-full flex-col gap-1 px-4 py-2.5 text-left hover:bg-accent/50"
                title="Filter failures by this signature"
              >
                <span className="line-clamp-2 font-mono text-[11px]">{c.sample}</span>
                <span className="text-[11px] text-muted-foreground">
                  {c.count} failure(s) · {c.tests} test(s)
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
