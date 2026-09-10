import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { DailyBars, DurationTrend, PassRateTrend } from '@/components/Charts';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useHistory } from '@/lib/api';
import { useQueryParam, useScope } from '@/hooks/useScope';
import { formatDuration, formatPercent } from '@/lib/utils';

export function HistoryPage() {
  const { scope } = useScope();
  const [days, setDays] = useQueryParam('days', '30');
  const q = useHistory({ ...scope, days, runs: 60 });
  if (q.isLoading) return <LoadingState rows={8} />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <>
      <PageHeader
        title="History"
        description="Long-range trends across runs and days."
        actions={
          <Select
            aria-label="Period"
            className="w-[140px]"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            options={[
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' },
              { value: '365', label: 'Last year' },
            ]}
          />
        }
      />
      {d.trends.length === 0 ? (
        <EmptyState title="No history yet" />
      ) : (
        <>
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Results per day</CardTitle>
                  <CardDescription>Passed / flaky / failed test executions summed per day</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                <DailyBars data={d.daily} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Pass rate per run</CardTitle>
                  <CardDescription>Last {d.trends.length} runs</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                <PassRateTrend data={d.trends} height={180} />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Run duration</CardTitle>
                  <CardDescription>Wall-clock time per run</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                <DurationTrend data={d.trends} height={160} />
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Most failing tests</CardTitle>
                <CardDescription>in the selected period</CardDescription>
              </CardHeader>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Test</TH>
                    <TH className="text-right">Failures</TH>
                    <TH className="text-right">Executions</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.topFailing.length === 0 && (
                    <TR>
                      <TD colSpan={3} className="text-xs text-muted-foreground">
                        No failures in this period.
                      </TD>
                    </TR>
                  )}
                  {d.topFailing.map((t) => (
                    <TR key={t.testId}>
                      <TD>
                        <Link to={`/tests/${t.testId}`} className="font-medium hover:underline">
                          {t.title}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">{t.suite}</div>
                      </TD>
                      <TD className="text-right tabular text-status-failed">{t.failures}</TD>
                      <TD className="text-right tabular text-muted-foreground">
                        {t.executions} ({formatPercent(t.failures / Math.max(1, t.executions), 0)})
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Slowest tests</CardTitle>
                <CardDescription>average duration</CardDescription>
              </CardHeader>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Test</TH>
                    <TH className="text-right">Avg duration</TH>
                    <TH className="text-right">Executions</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.slowest.map((t) => (
                    <TR key={t.testId}>
                      <TD>
                        <Link to={`/tests/${t.testId}`} className="font-medium hover:underline">
                          {t.title}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">{t.suite}</div>
                      </TD>
                      <TD className="text-right tabular">{formatDuration(t.avgDurationMs)}</TD>
                      <TD className="text-right tabular text-muted-foreground">{t.executions}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
