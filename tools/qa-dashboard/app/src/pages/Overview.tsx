import { Link } from 'react-router-dom';
import { ArrowRight, GitBranch, GitCommit, Timer } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import { DurationTrend, FailureFlakyTrend, PassFailTrend, PassRateTrend } from '@/components/Charts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RunsTable } from '@/pages/Runs';
import { RunCiButton } from '@/components/RunCiButton';
import { useOverview } from '@/lib/api';
import { useScope } from '@/hooks/useScope';
import { formatDuration, formatPercent, shortSha, timeAgo } from '@/lib/utils';

export function OverviewPage() {
  const { scope } = useScope();
  const q = useOverview(scope);

  if (q.isLoading) return <LoadingState rows={8} />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data!;
  const latest = d.latest;

  if (!latest) {
    return (
      <>
        <PageHeader title="Overview" description="Executive view of your Playwright automation." />
        <EmptyState
          title="No test runs yet"
          description={
            <>
              Run <code className="rounded bg-muted px-1">npm test</code> to record a local run, import a CI package with{' '}
              <code className="rounded bg-muted px-1">npm run dashboard:import -- &lt;path&gt;</code>, or load demo data with{' '}
              <code className="rounded bg-muted px-1">npm run dashboard:seed</code>.
            </>
          }
        />
      </>
    );
  }

  const c = latest.counts;
  return (
    <>
      <PageHeader
        title="Overview"
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              Latest execution <Link to={`/runs/${latest.id}`} className="text-foreground hover:underline" title={latest.id}>{latest.label}</Link> · {timeAgo(latest.startedAt)}
            </span>
            {d.hasDemoData && (
              <Badge variant="info" title="Demo runs are tagged source=demo and can be removed from Settings">
                demo data loaded
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            <RunCiButton label="Full Suite" buttonLabel="Run full suite" />
            <RunCiButton label="Full Suite" headed buttonLabel="Run full suite (headed)" />
            <Link to={`/runs/${latest.id}`} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
              Open latest run <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        }
      />

      <section className="mb-5 rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-4 py-3">
          <StatusBadge status={latest.status} upper />
          <span className="flex items-center gap-1.5 text-[13px]">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" /> {latest.branch ?? '—'}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[13px]">
            <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
            {latest.commitUrl ? (
              <a href={latest.commitUrl} target="_blank" rel="noreferrer" className="hover:underline">
                {shortSha(latest.commitSha)}
              </a>
            ) : (
              shortSha(latest.commitSha)
            )}
          </span>
          <Badge variant="outline">{latest.environment}</Badge>
          {latest.projects.map((p) => (
            <Badge key={p.name} variant="outline">
              {p.name}
              {p.browser && p.browser !== p.name ? ` · ${p.browser}` : ''}
            </Badge>
          ))}
          <span className="ml-auto flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Timer className="h-3.5 w-3.5" /> {formatDuration(latest.durationMs)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total tests', value: c.total },
            { label: 'Passed', value: c.passed, tone: 'passed' as const },
            { label: 'Failed', value: c.failed, tone: 'failed' as const },
            { label: 'Flaky', value: c.flaky, tone: 'flaky' as const },
            { label: 'Skipped', value: c.skipped, tone: 'skipped' as const },
            { label: 'Pass rate', value: formatPercent(latest.passRate), tone: latest.passRate >= 0.95 ? ('passed' as const) : latest.passRate >= 0.8 ? ('flaky' as const) : ('failed' as const) },
          ].map((s) => (
            <div key={s.label} className="bg-card px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div
                className={`mt-0.5 text-xl font-semibold tabular ${s.tone === 'passed' ? 'text-status-passed' : s.tone === 'failed' ? 'text-status-failed' : s.tone === 'flaky' ? 'text-status-flaky' : s.tone === 'skipped' ? 'text-status-skipped' : ''}`}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Pass rate" value={formatPercent(d.window.passRate)} hint={`last ${d.window.runs} runs`} tone={d.window.passRate >= 0.95 ? 'passed' : d.window.passRate >= 0.8 ? 'flaky' : 'failed'} />
        <StatCard label="Failure rate" value={formatPercent(d.window.failureRate)} hint={`last ${d.window.runs} runs`} tone={d.window.failureRate > 0.05 ? 'failed' : 'default'} />
        <StatCard label="Flaky tests" value={d.window.flakyTests} hint="currently flagged" tone={d.window.flakyTests > 0 ? 'flaky' : 'default'} />
        <StatCard label="Avg run duration" value={formatDuration(d.window.avgRunDurationMs)} hint="total execution" />
        <StatCard label="Avg test duration" value={formatDuration(d.window.avgTestDurationMs)} hint="per executed test" />
      </section>

      <section className="mb-5 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pass / fail trend</CardTitle>
              <CardDescription>Outcome per run, last {d.trends.length} runs</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <PassFailTrend data={d.trends} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Execution duration</CardTitle>
              <CardDescription>Wall-clock time per run</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <DurationTrend data={d.trends} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pass rate</CardTitle>
              <CardDescription>Passed + flaky over executed tests</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <PassRateTrend data={d.trends} height={160} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Failures &amp; flaky tests</CardTitle>
              <CardDescription>Count per run</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <FailureFlakyTrend data={d.trends} height={160} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <Link to="/runs" className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </CardHeader>
        <RunsTable runs={d.recentRuns} compact />
      </Card>
    </>
  );
}
