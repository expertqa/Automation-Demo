import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileCode2, Github } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { HistoryStrip } from '@/components/HistoryStrip';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import { Pagination } from '@/components/Pagination';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useTest } from '@/lib/api';
import { useQueryParam, useScope } from '@/hooks/useScope';
import { formatDateTime, formatDuration, formatPercent, shortSha } from '@/lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

export function TestHistoryPage() {
  const { testId } = useParams();
  const { scope } = useScope();
  const [page, setPage] = useQueryParam('page', '1');
  const q = useTest(testId, { ...scope, page, pageSize: 25 });
  const navigate = useNavigate();

  if (q.isLoading) return <LoadingState rows={8} />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { test, history, executions, links } = q.data!;
  const chart = [...history.recent].reverse().map((p) => ({ ...p, label: formatDateTime(p.startedAt) }));

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1">
            <Link to="/tests" className="hover:text-foreground">
              Tests
            </Link>
            <span>/</span>
            <Link to={`/suites/${test.suiteId}`} className="hover:text-foreground">
              {test.suite}
            </Link>
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {test.title}
            {history.flaky.flaky && <StatusBadge status="flaky" />}
          </span>
        }
        description={
          <span className="inline-flex items-center gap-1 font-mono text-xs">
            <FileCode2 className="h-3.5 w-3.5" />
            {test.file}:{test.line}
            {test.titlePath.length > 1 && <span className="ml-3 font-sans text-muted-foreground">{test.titlePath.slice(0, -1).join(' › ')}</span>}
          </span>
        }
        actions={
          links.sourceUrl && (
            <a href={links.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
              <Github className="h-3.5 w-3.5" /> View Source on GitHub
            </a>
          )
        }
      />

      <section className="mb-4 rounded-lg border border-border bg-card px-4 py-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Last executions (newest first)</div>
        <HistoryStrip items={history.recent} size="md" />
      </section>

      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Pass rate" value={formatPercent(history.passRate)} tone={history.passRate >= 0.95 ? 'passed' : history.passRate >= 0.8 ? 'flaky' : 'failed'} />
        <StatCard label="Executions" value={history.executions} />
        <StatCard label="Avg duration" value={formatDuration(history.avgDurationMs)} hint={`p95 ${formatDuration(history.p95DurationMs)}`} />
        <StatCard label="Failures" value={history.failures} tone={history.failures ? 'failed' : 'default'} />
        <StatCard label="Flaky executions" value={history.flakyExecutions} tone={history.flakyExecutions ? 'flaky' : 'default'} />
        <StatCard label="Retries" value={history.retries} />
        <StatCard label="Last failure" value={history.lastFailure ? <span className="text-base">{formatDateTime(history.lastFailure.startedAt)}</span> : '—'} hint={history.lastSuccess ? `last success ${formatDateTime(history.lastSuccess.startedAt)}` : undefined} />
      </section>

      {history.flaky.flaky && (
        <div className="mb-5 rounded-md border border-status-flaky/30 bg-status-flaky/10 px-3 py-2 text-xs">
          <span className="font-medium text-status-flaky">Flagged as flaky:</span> {history.flaky.reasons.join(' · ')}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Duration per execution</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chart} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" hide />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDuration(v)} width={56} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--accent))', opacity: 0.5 }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof chart)[number] | undefined;
                    if (!active || !p) return null;
                    return (
                      <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
                        <div className="font-medium">{p.label}</div>
                        <div className="text-muted-foreground">
                          {p.status} · {formatDuration(p.durationMs)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="durationMs" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {chart.map((p) => (
                    <Cell key={p.runTestId} fill={p.status === 'passed' ? 'hsl(var(--status-passed))' : p.status === 'flaky' ? 'hsl(var(--status-flaky))' : p.status === 'skipped' ? 'hsl(var(--status-skipped))' : 'hsl(var(--status-failed))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Executions</CardTitle>
            <span className="text-xs text-muted-foreground">{executions.total} total</span>
          </CardHeader>
          {executions.items.length === 0 ? (
            <div className="p-3">
              <EmptyState title="No executions in this scope" />
            </div>
          ) : (
            <>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Status</TH>
                    <TH>Run</TH>
                    <TH>Branch</TH>
                    <TH>Env</TH>
                    <TH>Commit</TH>
                    <TH className="text-right">Retries</TH>
                    <TH className="text-right">Duration</TH>
                    <TH className="text-right">When</TH>
                  </TR>
                </THead>
                <TBody>
                  {executions.items.map((e) => (
                    <TR key={e.runTestId} data-clickable="true" onClick={() => navigate(`/executions/${e.runTestId}`)}>
                      <TD>
                        <StatusBadge status={e.status} />
                        {e.errorSummary && <div className="mt-0.5 max-w-[360px] truncate font-mono text-[11px] text-muted-foreground">{e.errorSummary}</div>}
                      </TD>
                      <TD className="font-mono text-xs">{e.runId}</TD>
                      <TD className="text-xs">{e.branch ?? '—'}</TD>
                      <TD className="text-xs">{e.environment}</TD>
                      <TD className="font-mono text-xs">{shortSha(e.commitSha)}</TD>
                      <TD className="text-right tabular text-xs">{e.retries}</TD>
                      <TD className="text-right tabular text-xs">{formatDuration(e.durationMs)}</TD>
                      <TD className="text-right text-xs text-muted-foreground">{formatDateTime(e.startedAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={executions.page} pageSize={executions.pageSize} total={executions.total} onChange={(p) => setPage(String(p))} />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
