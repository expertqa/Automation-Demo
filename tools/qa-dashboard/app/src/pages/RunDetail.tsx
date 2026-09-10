import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, ExternalLink, FileCode2, GitBranch, GitCommit, Image, Play, Trash2, Video, Workflow } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge, StatusDot } from '@/components/StatusBadge';
import { ErrorState, LoadingState, EmptyState } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { deleteRun, useRun } from '@/lib/api';
import { cn, fileName, formatDateTime, formatDuration, formatPercent, shortSha } from '@/lib/utils';
import type { RunTestSummary, SuiteInRun } from '@shared/api';
import { useQueryClient } from '@tanstack/react-query';

export function RunDetailPage() {
  const { runId } = useParams();
  const q = useRun(runId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  if (q.isLoading) return <LoadingState rows={8} />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { run, suites } = q.data!;
  const c = run.counts;

  const remove = async () => {
    if (!window.confirm(`Delete run ${run.id} and all of its artifacts?`)) return;
    await deleteRun(run.id);
    await qc.invalidateQueries();
    navigate('/runs');
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/runs" className="hover:text-foreground">
            Test Runs
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{run.id}</span>
            <StatusBadge status={run.status} upper />
            {run.source === 'demo' && <Badge variant="info">demo</Badge>}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" /> {run.branch ?? '—'}
            </span>
            <span className="inline-flex items-center gap-1 font-mono">
              <GitCommit className="h-3.5 w-3.5" />
              {run.commitUrl ? (
                <a href={run.commitUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {shortSha(run.commitSha)}
                </a>
              ) : (
                shortSha(run.commitSha)
              )}
              {run.commitMessage && <span className="font-sans text-muted-foreground">— {run.commitMessage}</span>}
            </span>
            <span>env: {run.environment}</span>
            <span>{run.projects.map((p) => `${p.name}${p.browser && p.browser !== p.name ? ` (${p.browser})` : ''}`).join(', ') || 'no projects'}</span>
            <span>{formatDuration(run.durationMs)}</span>
            <span>{formatDateTime(run.startedAt)}</span>
            {run.playwrightVersion && <span>Playwright {run.playwrightVersion}</span>}
            {run.os && <span>{run.os}</span>}
          </span>
        }
        actions={
          <>
            {run.ci.runUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(run.ci.runUrl!, '_blank', 'noreferrer')}>
                <Workflow className="h-3.5 w-3.5" /> View CI run
              </Button>
            )}
            {run.commitUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(run.commitUrl!, '_blank', 'noreferrer')}>
                <GitCommit className="h-3.5 w-3.5" /> View commit
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={remove} title="Delete this run">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        }
      />

      {run.ci.provider && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">CI</span>
          <span>{run.ci.provider}</span>
          {run.ci.workflow && <span>workflow: {run.ci.workflow}</span>}
          {run.ci.jobName && <span>job: {run.ci.jobName}</span>}
          {run.ci.runNumber && <span>#{run.ci.runNumber}</span>}
          {run.ci.actor && <span>by {run.ci.actor}</span>}
          {run.ci.runUrl && (
            <a href={run.ci.runUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground hover:underline">
              open <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Total', value: c.total, cls: '' },
          { label: 'Passed', value: c.passed, cls: 'text-status-passed' },
          { label: 'Failed', value: c.failed, cls: 'text-status-failed' },
          { label: 'Flaky', value: c.flaky, cls: 'text-status-flaky' },
          { label: 'Skipped', value: c.skipped, cls: 'text-status-skipped' },
          { label: 'Pass rate', value: formatPercent(run.passRate), cls: '' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className={cn('mt-0.5 text-xl font-semibold tabular', s.cls)}>{s.value}</div>
          </div>
        ))}
      </section>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <span className="text-[13px] font-semibold">Suites</span>
          <span className="text-xs text-muted-foreground">{suites.length} suites · retries {c.retries}</span>
          <div className="ml-auto flex items-center gap-2">
            <Input aria-label="Filter tests" className="w-[220px]" placeholder="Filter tests…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select
              aria-label="Status filter"
              className="w-[130px]"
              placeholder="All statuses"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: 'passed', label: 'Passed' },
                { value: 'failed', label: 'Failed' },
                { value: 'flaky', label: 'Flaky' },
                { value: 'skipped', label: 'Skipped' },
              ]}
            />
          </div>
        </div>
        {suites.length === 0 ? (
          <div className="p-3">
            <EmptyState title="No tests recorded in this run" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {suites.map((s) => (
              <SuiteBlock key={s.suiteId} suite={s} statusFilter={status} search={search} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function matches(t: RunTestSummary, statusFilter: string, search: string): boolean {
  if (statusFilter === 'failed' && !(t.status === 'failed' || t.status === 'timedOut' || t.status === 'interrupted')) return false;
  if (statusFilter && statusFilter !== 'failed' && t.status !== statusFilter) return false;
  if (search && !`${t.title} ${t.file} ${t.suite}`.toLowerCase().includes(search.toLowerCase())) return false;
  return true;
}

function SuiteBlock({ suite, statusFilter, search }: { suite: SuiteInRun; statusFilter: string; search: string }) {
  const [open, setOpen] = useState(suite.failed > 0 || suite.flaky > 0);
  const files = useMemo(() => suite.files.map((f) => ({ ...f, tests: f.tests.filter((t) => matches(t, statusFilter, search)) })).filter((f) => f.tests.length), [suite, statusFilter, search]);
  const filtered = statusFilter || search;
  if (filtered && files.length === 0) return null;
  const good = suite.passed + suite.flaky;
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50" data-testid="suite-row">
        {open || filtered ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <Link to={`/suites/${suite.suiteId}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
          {suite.name}
        </Link>
        <span className={cn('font-mono text-xs tabular', suite.failed ? 'text-status-failed' : 'text-status-passed')}>
          {good}/{suite.total}
        </span>
        <div className="ml-2 hidden h-1.5 w-40 overflow-hidden rounded bg-muted sm:flex">
          <span className="bg-status-passed" style={{ width: `${(suite.passed / suite.total) * 100}%` }} />
          <span className="bg-status-flaky" style={{ width: `${(suite.flaky / suite.total) * 100}%` }} />
          <span className="bg-status-failed" style={{ width: `${(suite.failed / suite.total) * 100}%` }} />
        </div>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {suite.failed > 0 && <span className="text-status-failed">{suite.failed} failed</span>}
          {suite.flaky > 0 && <span className="text-status-flaky">{suite.flaky} flaky</span>}
          {suite.skipped > 0 && <span>{suite.skipped} skipped</span>}
          <span className="tabular">{formatDuration(suite.durationMs)}</span>
        </span>
      </button>
      {(open || filtered) && (
        <div className="border-t border-border bg-muted/30">
          {files.map((f) => (
            <div key={f.file}>
              <div className="flex items-center gap-2 px-3 py-1.5 pl-10 text-xs text-muted-foreground">
                <FileCode2 className="h-3.5 w-3.5" />
                <span className="font-mono">{f.file}</span>
                <span className="tabular">
                  {f.passed + f.flaky}/{f.total}
                </span>
              </div>
              <Table>
                <THead className="sr-only">
                  <TR>
                    <TH>Status</TH>
                    <TH>Test</TH>
                    <TH>Project</TH>
                    <TH>Retries</TH>
                    <TH>Artifacts</TH>
                    <TH>Duration</TH>
                  </TR>
                </THead>
                <TBody>
                  {f.tests.map((t) => (
                    <TestRow key={t.runTestId} t={t} />
                  ))}
                </TBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TestRow({ t }: { t: RunTestSummary }) {
  const navigate = useNavigate();
  return (
    <TR data-clickable="true" onClick={() => navigate(`/executions/${t.runTestId}`)} className="bg-card" data-testid="test-row">
      <TD className="w-8 pl-10">
        <StatusDot status={t.status} />
      </TD>
      <TD>
        <div className="flex items-center gap-2">
          <span className="font-medium">{t.title}</span>
          <StatusBadge status={t.status} />
        </div>
        {t.errorSummary && <div className="mt-0.5 truncate font-mono text-[11px] text-status-failed/90 max-w-[720px]">{t.errorSummary}</div>}
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {fileName(t.file)}:{t.line}
        </div>
      </TD>
      <TD className="text-xs text-muted-foreground">{t.project}</TD>
      <TD className="text-xs text-muted-foreground">{t.retries > 0 ? `${t.retries} ${t.retries === 1 ? 'retry' : 'retries'}` : ''}</TD>
      <TD>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {t.hasScreenshot && <Image className="h-3.5 w-3.5" aria-label="screenshot" />}
          {t.hasVideo && <Video className="h-3.5 w-3.5" aria-label="video" />}
          {t.hasTrace && <Play className="h-3.5 w-3.5" aria-label="trace" />}
        </span>
      </TD>
      <TD className="text-right tabular text-xs">{formatDuration(t.durationMs)}</TD>
    </TR>
  );
}
