import { Link, useNavigate } from 'react-router-dom';
import { Github, Settings } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { HistoryStrip } from '@/components/HistoryStrip';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useFlaky } from '@/lib/api';
import { useScope } from '@/hooks/useScope';
import { fileName, formatDateTime, formatPercent } from '@/lib/utils';

export function FlakyPage() {
  const { scope } = useScope();
  const q = useFlaky(scope);
  const navigate = useNavigate();
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { items, config } = q.data!;
  return (
    <>
      <PageHeader
        title="Flaky Tests"
        description={
          <>
            A test is flaky when, over its last {config.windowRuns} executions, it passed after a retry, its failure rate is between {formatPercent(config.failureRateMin, 0)} and {formatPercent(config.failureRateMax, 0)}, or it flipped
            pass↔fail at least {config.minTransitions} times.
          </>
        }
        actions={
          <Link to="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Settings className="h-3.5 w-3.5" /> Tune thresholds
          </Link>
        }
      />
      <Card>
        {items.length === 0 ? (
          <div className="p-3">
            <EmptyState title="No flaky tests detected" description="Nothing in the current window matches the flaky rules." />
          </div>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Test</TH>
                <TH>Suite</TH>
                <TH>History</TH>
                <TH className="text-right">Pass rate</TH>
                <TH className="text-right">Failure rate</TH>
                <TH className="text-right">Retries</TH>
                <TH>Why</TH>
                <TH className="text-right">Last failure</TH>
                <TH className="text-right">Last execution</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((t) => (
                <TR key={t.testId} data-clickable="true" onClick={() => navigate(`/tests/${t.testId}`)} data-testid="flaky-row">
                  <TD>
                    <div className="font-medium">{t.title}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {fileName(t.file)}:{t.line}
                    </div>
                  </TD>
                  <TD>
                    <Link to={`/suites/${t.suiteId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      {t.suite}
                    </Link>
                  </TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    <HistoryStrip items={t.recent} reverse />
                  </TD>
                  <TD className="text-right tabular">{formatPercent(t.verdict.passRate, 0)}</TD>
                  <TD className="text-right tabular text-status-failed">{formatPercent(t.verdict.failureRate, 0)}</TD>
                  <TD className="text-right tabular">{t.verdict.retries}</TD>
                  <TD className="max-w-[260px] text-xs text-muted-foreground">{t.verdict.reasons.join('; ')}</TD>
                  <TD className="text-right text-xs text-muted-foreground">{t.lastFailure ? formatDateTime(t.lastFailure.startedAt) : '—'}</TD>
                  <TD className="text-right text-xs text-muted-foreground">{t.lastExecution ? formatDateTime(t.lastExecution.startedAt) : '—'}</TD>
                  <TD>
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
        )}
      </Card>
    </>
  );
}
