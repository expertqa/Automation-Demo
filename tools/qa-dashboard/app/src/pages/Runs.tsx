import { useNavigate } from 'react-router-dom';
import { Cloud, Laptop, Search, Upload, Database } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import { Pagination } from '@/components/Pagination';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFilters, useRuns } from '@/lib/api';
import { useQueryParam, useScope } from '@/hooks/useScope';
import { formatDateTime, formatDuration, shortSha, timeAgo } from '@/lib/utils';
import type { RunSummary } from '@shared/api';

export function RunsPage() {
  const { scope } = useScope();
  const [q, setQ] = useQueryParam('q');
  const [status, setStatus] = useQueryParam('status');
  const [source, setSource] = useQueryParam('source');
  const [from, setFrom] = useQueryParam('from');
  const [to, setTo] = useQueryParam('to');
  const [page, setPage] = useQueryParam('page', '1');
  const filters = useFilters();
  const runs = useRuns({ ...scope, q, status, source, from, to, page, pageSize: 25 });

  return (
    <>
      <PageHeader title="Test Runs" description="Every recorded execution — local runs and imported CI packages." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative w-full sm:w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search runs" className="pl-8" placeholder="Run ID, commit, message…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="Status" className="w-[140px]" placeholder="Any status" value={status} onChange={(e) => setStatus(e.target.value)} options={(filters.data?.runStatuses ?? []).map((s) => ({ value: s, label: s }))} />
          <Select
            aria-label="Source"
            className="w-[130px]"
            placeholder="Any source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            options={[
              { value: 'local', label: 'Local' },
              { value: 'ci', label: 'CI' },
              { value: 'import', label: 'Imported' },
              { value: 'demo', label: 'Demo' },
            ]}
          />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Input aria-label="From date" type="date" className="w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>–</span>
            <Input aria-label="To date" type="date" className="w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {runs.data && <span className="ml-auto text-xs text-muted-foreground tabular">{runs.data.total} runs</span>}
        </div>
        {runs.isLoading ? (
          <div className="p-3">
            <LoadingState />
          </div>
        ) : runs.error ? (
          <div className="p-3">
            <ErrorState error={runs.error} retry={() => runs.refetch()} />
          </div>
        ) : runs.data!.items.length === 0 ? (
          <div className="p-3">
            <EmptyState title="No runs match" description="Adjust the filters, run the suite locally, or import a CI result package." />
          </div>
        ) : (
          <>
            <RunsTable runs={runs.data!.items} />
            <Pagination page={runs.data!.page} pageSize={runs.data!.pageSize} total={runs.data!.total} onChange={(p) => setPage(String(p))} />
          </>
        )}
      </Card>
    </>
  );
}

function SourceIcon({ source }: { source: RunSummary['source'] }) {
  const Icon = source === 'ci' ? Cloud : source === 'local' ? Laptop : source === 'demo' ? Database : Upload;
  const label = source === 'ci' ? 'CI' : source === 'local' ? 'Local' : source === 'demo' ? 'Demo data' : 'Imported';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function RunsTable({ runs, compact = false }: { runs: RunSummary[]; compact?: boolean }) {
  const navigate = useNavigate();
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH className="w-[220px]">Run</TH>
          <TH>Status</TH>
          <TH>Branch</TH>
          <TH>Commit</TH>
          <TH>Env</TH>
          {!compact && <TH>Project</TH>}
          <TH className="text-right">Passed</TH>
          <TH className="text-right">Failed</TH>
          <TH className="text-right">Flaky</TH>
          <TH className="text-right">Skipped</TH>
          <TH className="text-right">Duration</TH>
          <TH className="text-right">When</TH>
        </TR>
      </THead>
      <TBody>
        {runs.map((r) => (
          <TR key={r.id} data-clickable="true" onClick={() => navigate(`/runs/${r.id}`)} data-testid="run-row">
            <TD>
              <div className="flex items-center gap-2">
                <SourceIcon source={r.source} />
                <span className="font-mono text-xs">{r.id}</span>
              </div>
            </TD>
            <TD>
              <StatusBadge status={r.status} />
            </TD>
            <TD className="max-w-[160px] truncate">{r.branch ?? '—'}</TD>
            <TD className="font-mono text-xs">
              {r.commitUrl ? (
                <a href={r.commitUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">
                  {shortSha(r.commitSha)}
                </a>
              ) : (
                shortSha(r.commitSha)
              )}
            </TD>
            <TD>{r.environment}</TD>
            {!compact && <TD className="text-xs text-muted-foreground">{r.projects.map((p) => p.name).join(', ') || '—'}</TD>}
            <TD className="text-right tabular text-status-passed">{r.counts.passed}</TD>
            <TD className={`text-right tabular ${r.counts.failed ? 'text-status-failed font-medium' : 'text-muted-foreground'}`}>{r.counts.failed}</TD>
            <TD className={`text-right tabular ${r.counts.flaky ? 'text-status-flaky' : 'text-muted-foreground'}`}>{r.counts.flaky}</TD>
            <TD className="text-right tabular text-muted-foreground">{r.counts.skipped}</TD>
            <TD className="text-right tabular">{formatDuration(r.durationMs)}</TD>
            <TD className="text-right text-xs text-muted-foreground" title={formatDateTime(r.startedAt)}>
              {timeAgo(r.startedAt)}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
