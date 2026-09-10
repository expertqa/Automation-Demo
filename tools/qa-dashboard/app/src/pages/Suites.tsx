import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileCode2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Sparkline } from '@/components/Charts';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { TestsTable } from '@/pages/Tests';
import { RunCiButton } from '@/components/RunCiButton';
import { useSuite, useSuites } from '@/lib/api';
import { useScope } from '@/hooks/useScope';
import { formatDuration, formatPercent, timeAgo } from '@/lib/utils';

export function SuitesPage() {
  const { scope } = useScope();
  const q = useSuites(scope);
  const navigate = useNavigate();
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const items = q.data!.items;
  return (
    <>
      <PageHeader title="Test Suites" description="Suite = first describe() block, or the spec file name when there is none. Reliability covers the last 20 runs." />
      <Card>
        {items.length === 0 ? (
          <div className="p-3">
            <EmptyState title="No suites yet" />
          </div>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Suite</TH>
                <TH className="text-right">Tests</TH>
                <TH className="text-right">Files</TH>
                <TH>Latest run</TH>
                <TH className="text-right">Passed</TH>
                <TH className="text-right">Failed</TH>
                <TH className="text-right">Flaky</TH>
                <TH className="text-right">Pass rate</TH>
                <TH className="text-right">Avg test duration</TH>
                <TH>Reliability</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((s) => (
                <TR key={s.suiteId} data-clickable="true" onClick={() => navigate(`/suites/${s.suiteId}`)} data-testid="suite-list-row">
                  <TD className="font-medium">
                    {s.name}
                    {s.flakyTests > 0 && (
                      <Badge variant="flaky" className="ml-2">
                        {s.flakyTests} flaky
                      </Badge>
                    )}
                  </TD>
                  <TD className="text-right tabular">{s.tests}</TD>
                  <TD className="text-right tabular text-muted-foreground">{s.files}</TD>
                  <TD className="text-xs text-muted-foreground">
                    {s.latest ? (
                      <span className="tabular">
                        <span className={s.latest.failed ? 'text-status-failed' : 'text-status-passed'}>
                          {s.latest.passed + s.latest.flaky}/{s.latest.total}
                        </span>{' '}
                        · {timeAgo(s.latest.startedAt)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD className="text-right tabular text-status-passed">{s.latest?.passed ?? '—'}</TD>
                  <TD className={`text-right tabular ${s.latest?.failed ? 'text-status-failed' : 'text-muted-foreground'}`}>{s.latest?.failed ?? '—'}</TD>
                  <TD className={`text-right tabular ${s.latest?.flaky ? 'text-status-flaky' : 'text-muted-foreground'}`}>{s.latest?.flaky ?? '—'}</TD>
                  <TD className={`text-right tabular ${s.passRate < 0.8 ? 'text-status-failed' : s.passRate < 0.95 ? 'text-status-flaky' : ''}`}>{formatPercent(s.passRate, 0)}</TD>
                  <TD className="text-right tabular">{formatDuration(s.avgDurationMs)}</TD>
                  <TD>
                    <Sparkline values={s.reliability.map((r) => r.passRate)} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

export function SuiteDetailPage() {
  const { suiteId } = useParams();
  const { scope } = useScope();
  const q = useSuite(suiteId, scope);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { suite, files } = q.data!;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/suites" className="hover:text-foreground">
            Test Suites
          </Link>
        }
        title={suite.name}
        description={`${suite.tests} tests in ${suite.files} file(s)`}
        actions={
          suite.latest && (
            <Link to={`/runs/${suite.latest.runId}`} className="text-xs text-muted-foreground hover:text-foreground">
              Latest run {suite.latest.runId} →
            </Link>
          )
        }
      />
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Tests" value={suite.tests} />
        <StatCard label="Passed (latest)" value={suite.latest?.passed ?? '—'} tone="passed" />
        <StatCard label="Failed (latest)" value={suite.latest?.failed ?? '—'} tone={suite.latest?.failed ? 'failed' : 'default'} />
        <StatCard label="Flaky tests" value={suite.flakyTests} tone={suite.flakyTests ? 'flaky' : 'default'} />
        <StatCard label="Pass rate" value={formatPercent(suite.passRate)} hint="last 20 runs" tone={suite.passRate >= 0.95 ? 'passed' : suite.passRate >= 0.8 ? 'flaky' : 'failed'} />
        <StatCard label="Avg test duration" value={formatDuration(suite.avgDurationMs)} />
      </section>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Historical reliability</CardTitle>
          <span className="text-xs text-muted-foreground">pass rate per run, oldest → newest</span>
        </CardHeader>
        <div className="flex items-end gap-1 px-4 py-3" aria-label="reliability bars">
          {suite.reliability.length === 0 && <span className="text-xs text-muted-foreground">no runs yet</span>}
          {suite.reliability.map((r) => (
            <Link
              key={r.runId}
              to={`/runs/${r.runId}`}
              title={`${r.runId} · ${formatPercent(r.passRate)}`}
              className={`w-4 rounded-sm ${r.passRate >= 0.95 ? 'bg-status-passed' : r.passRate >= 0.8 ? 'bg-status-flaky' : 'bg-status-failed'} hover:opacity-80`}
              style={{ height: `${Math.max(6, r.passRate * 48)}px` }}
            />
          ))}
        </div>
      </Card>
      {files.map((f) => (
        <Card key={f.file} className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-mono text-xs">
              <FileCode2 className="h-3.5 w-3.5" /> {f.file}
            </CardTitle>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              {f.tests.length} tests
              <RunCiButton testFile={f.file} label={`${f.file} only`} buttonLabel="Run this suite" />
            </span>
          </CardHeader>
          <TestsTable tests={f.tests} hideSuite />
        </Card>
      ))}
    </>
  );
}
