import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Download, ExternalLink, FileCode2, Github, GitCommit, Globe, History, Image as ImageIcon, Play, Terminal, Video, Workflow, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { HistoryStrip } from '@/components/HistoryStrip';
import { ErrorState, LoadingState, EmptyState } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { openTrace, useRunTest } from '@/lib/api';
import { cn, formatBytes, formatDateTime, formatDuration, formatPercent, shortSha } from '@/lib/utils';
import type { ArtifactSummary, AttemptDetail, RunTestDetail } from '@shared/api';

export function TestExecutionPage() {
  const { runTestId } = useParams();
  const q = useRunTest(runTestId);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  if (q.isLoading) return <LoadingState rows={8} />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data!;
  const { test, run, attempts, links } = d;
  const isFailure = test.status === 'failed' || test.status === 'timedOut' || test.status === 'interrupted';
  const lastAttempt = attempts[attempts.length - 1];
  const all = attempts.flatMap((a) => a.artifacts.map((x) => ({ ...x, retry: a.retry })));
  const screenshots = all.filter((a) => a.kind === 'screenshot');
  const videos = all.filter((a) => a.kind === 'video');
  const traces = all.filter((a) => a.kind === 'trace');
  const texts = all.filter((a) => a.kind === 'text' || a.kind === 'other');
  const errorCount = attempts.reduce((n, a) => n + a.errors.length, 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-1">
            <Link to={`/runs/${run.id}`} className="font-mono hover:text-foreground">
              {run.id}
            </Link>
            <span>/</span>
            <Link to={`/suites/${test.suiteId}`} className="hover:text-foreground">
              {test.suite}
            </Link>
            <span>/</span>
            <Link to={`/tests/${test.testId}`} className="hover:text-foreground">
              history
            </Link>
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {test.title}
            <StatusBadge status={test.status} upper className="text-xs" />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
            <span className="inline-flex items-center gap-1">
              <FileCode2 className="h-3.5 w-3.5" />
              {test.file}:{test.line}
              {d.column ? `:${d.column}` : ''}
            </span>
            <span>{formatDuration(test.durationMs)}</span>
            <span>
              {test.project}
              {test.browser && test.browser !== test.project ? ` · ${test.browser}` : ''}
            </span>
            <span>env: {run.environment}</span>
            <span>
              {test.retries > 0 ? `retry ${test.retries} of ${test.attempts - 1}` : 'no retries'}
            </span>
            <span className="font-sans">{formatDateTime(test.startedAt)}</span>
          </span>
        }
        actions={
          <>
            <ExternalButton href={links.sourceUrl} icon={<Github className="h-3.5 w-3.5" />} label="View Source on GitHub" primary testId="view-source" />
            <ExternalButton href={links.commitUrl} icon={<GitCommit className="h-3.5 w-3.5" />} label="View Commit" />
            <ExternalButton href={links.ciRunUrl} icon={<Workflow className="h-3.5 w-3.5" />} label="View CI Run" />
          </>
        }
      />

      {!links.sourceUrl && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-status-flaky/30 bg-status-flaky/10 px-3 py-2 text-xs">
          <AlertCircle className="h-3.5 w-3.5 text-status-flaky" />
          No GitHub link: this run has no repository URL or commit SHA. Set the repository URL in Settings or run tests inside a git checkout.
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="error" data-testid="tab-error">
            Error {errorCount > 0 && <Count n={errorCount} tone="failed" />}
          </TabsTrigger>
          <TabsTrigger value="trace">
            <Play className="h-3.5 w-3.5" /> Trace {traces.length > 0 && <Count n={traces.length} />}
          </TabsTrigger>
          <TabsTrigger value="screenshots" data-testid="tab-screenshots">
            <ImageIcon className="h-3.5 w-3.5" /> Screenshots {screenshots.length > 0 && <Count n={screenshots.length} />}
          </TabsTrigger>
          <TabsTrigger value="video" data-testid="tab-video">
            <Video className="h-3.5 w-3.5" /> Video {videos.length > 0 && <Count n={videos.length} />}
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Terminal className="h-3.5 w-3.5" /> Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab d={d} isFailure={isFailure} lastAttempt={lastAttempt} />
        </TabsContent>
        <TabsContent value="error">
          <ErrorTab attempts={attempts} sourceUrl={links.sourceUrl} />
        </TabsContent>
        <TabsContent value="trace">
          <TraceTab traces={traces} />
        </TabsContent>
        <TabsContent value="screenshots">
          <ScreenshotsTab screenshots={screenshots} />
        </TabsContent>
        <TabsContent value="video">
          <VideoTab videos={videos} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab attempts={attempts} texts={texts} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Count({ n, tone }: { n: number; tone?: 'failed' }) {
  return <span className={cn('ml-1 rounded bg-muted px-1 text-[10px] tabular', tone === 'failed' && 'bg-status-failed/15 text-status-failed')}>{n}</span>;
}

function ExternalButton({ href, icon, label, primary, testId }: { href: string | null; icon: React.ReactNode; label: string; primary?: boolean; testId?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-testid={testId}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors',
        primary ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border hover:bg-accent',
      )}
    >
      {icon}
      {label}
      <ExternalLink className="h-3 w-3 opacity-60" />
    </a>
  );
}

function OverviewTab({ d, isFailure, lastAttempt }: { d: RunTestDetail; isFailure: boolean; lastAttempt: AttemptDetail | undefined }) {
  const { test, run, history, attempts } = d;
  const firstError = lastAttempt?.errors[0] ?? attempts.flatMap((a) => a.errors)[0];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {isFailure && firstError && (
          <Card className="border-status-failed/30">
            <CardHeader>
              <CardTitle className="text-status-failed">Failure</CardTitle>
              <Link to="?tab=error" className="text-xs text-muted-foreground hover:text-foreground">
                Full error →
              </Link>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{firstError.message.split('\n').slice(0, 12).join('\n')}</pre>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Attempts</CardTitle>
            <span className="text-xs text-muted-foreground">{attempts.length} attempt(s)</span>
          </CardHeader>
          <div className="divide-y divide-border">
            {attempts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-16 font-mono text-xs text-muted-foreground">#{a.retry}</span>
                <StatusBadge status={a.status} />
                <span className="tabular">{formatDuration(a.durationMs)}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.startedAt)}</span>
                {a.workerIndex !== null && <span className="text-xs text-muted-foreground">worker {a.workerIndex}</span>}
                <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  {a.errors.length > 0 && <span className="text-status-failed">{a.errors.length} error(s)</span>}
                  {a.artifacts.length > 0 && <span>{a.artifacts.length} artifact(s)</span>}
                </span>
              </div>
            ))}
          </div>
        </Card>
        {lastAttempt && lastAttempt.steps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Steps (last attempt)</CardTitle>
            </CardHeader>
            <div className="divide-y divide-border">
              {lastAttempt.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-1.5 text-[13px]" style={{ paddingLeft: 16 + s.depth * 16 }}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', s.error ? 'bg-status-failed' : 'bg-status-passed')} />
                  <span className={cn(s.error && 'text-status-failed')}>{s.title}</span>
                  <span className="ml-auto tabular text-xs text-muted-foreground">{formatDuration(s.durationMs)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> History
            </CardTitle>
            <Link to={`/tests/${test.testId}`} className="text-xs text-muted-foreground hover:text-foreground">
              Full history →
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <HistoryStrip items={history.recent} size="md" reverse />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Pass rate</dt>
              <dd className="tabular">{formatPercent(history.passRate)}</dd>
              <dt className="text-muted-foreground">Executions</dt>
              <dd className="tabular">{history.executions}</dd>
              <dt className="text-muted-foreground">Avg duration</dt>
              <dd className="tabular">{formatDuration(history.avgDurationMs)}</dd>
              <dt className="text-muted-foreground">Failures</dt>
              <dd className="tabular">{history.failures}</dd>
              <dt className="text-muted-foreground">Flaky runs</dt>
              <dd className="tabular">{history.flakyExecutions}</dd>
              <dt className="text-muted-foreground">Retries</dt>
              <dd className="tabular">{history.retries}</dd>
            </dl>
            {history.flaky.flaky && (
              <div className="rounded-md border border-status-flaky/30 bg-status-flaky/10 p-2 text-xs">
                <div className="font-medium text-status-flaky">Flagged as flaky</div>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {history.flaky.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Run</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Run</dt>
              <dd>
                <Link to={`/runs/${run.id}`} className="font-mono hover:underline">
                  {run.id}
                </Link>
              </dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={run.status} />
              </dd>
              <dt className="text-muted-foreground">Branch</dt>
              <dd>{run.branch ?? '—'}</dd>
              <dt className="text-muted-foreground">Commit</dt>
              <dd className="font-mono">{shortSha(run.commitSha)}</dd>
              <dt className="text-muted-foreground">Environment</dt>
              <dd>{run.environment}</dd>
              <dt className="text-muted-foreground">Source</dt>
              <dd>{run.source}</dd>
              {run.ci.workflow && (
                <>
                  <dt className="text-muted-foreground">Workflow</dt>
                  <dd>{run.ci.workflow}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Expected</dt>
              <dd>{d.expectedStatus}</dd>
              {d.tags.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {d.tags.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </dd>
                </>
              )}
              {d.annotations.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Annotations</dt>
                  <dd>{d.annotations.map((a) => `${a.type}${a.description ? `: ${a.description}` : ''}`).join(', ')}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Light syntax colouring for Playwright error text and snippets. */
function ErrorText({ text, kind }: { text: string; kind: 'message' | 'stack' | 'snippet' }) {
  const lines = text.split('\n');
  return (
    <pre className="overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed" data-testid={`error-${kind}`}>
      {lines.map((line, i) => {
        let cls = '';
        if (kind === 'snippet') {
          if (/^\s*>/.test(line)) cls = 'text-status-failed font-semibold';
          else if (/^\s*\|?\s*\^/.test(line)) cls = 'text-status-failed';
          else cls = 'text-muted-foreground';
        } else if (kind === 'stack') {
          cls = /node_modules/.test(line) ? 'text-muted-foreground/70' : /^\s+at /.test(line) ? 'text-muted-foreground' : 'text-foreground';
        } else {
          if (/^(Error|TimeoutError|AssertionError|TypeError)[:\s]/.test(line) || /failed$/.test(line)) cls = 'font-semibold text-status-failed';
          else if (/^\s*(Expected|Received|Locator|Timeout|Expected pattern|Received string)[:\s]/.test(line)) cls = 'text-foreground';
          else if (/^\s*-\s/.test(line)) cls = 'text-muted-foreground';
          else if (/^\s*\d+ ×/.test(line)) cls = 'text-muted-foreground';
        }
        return (
          <span key={i} className={cn('block', cls)}>
            {line || ' '}
          </span>
        );
      })}
    </pre>
  );
}

function ErrorTab({ attempts, sourceUrl }: { attempts: AttemptDetail[]; sourceUrl: string | null }) {
  const withErrors = attempts.filter((a) => a.errors.length > 0);
  if (withErrors.length === 0) return <EmptyState title="No errors recorded" description="This execution passed or was skipped." />;
  return (
    <div className="space-y-4">
      {withErrors.map((a) => (
        <Card key={a.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Attempt #{a.retry} <StatusBadge status={a.status} />
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {a.errors.length} error(s) · {formatDuration(a.durationMs)}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            {a.errors.map((e) => (
              <div key={e.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium">Error message</span>
                  {e.location && (
                    <span className="font-mono text-muted-foreground">
                      {e.location.file}
                      {e.location.line ? `:${e.location.line}` : ''}
                      {e.location.column ? `:${e.location.column}` : ''}
                    </span>
                  )}
                  {(e.sourceUrl ?? sourceUrl) && (
                    <a href={e.sourceUrl ?? sourceUrl ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground hover:underline">
                      <Github className="h-3 w-3" /> View Source on GitHub
                    </a>
                  )}
                </div>
                <ErrorText text={e.message} kind="message" />
                {e.snippet && (
                  <>
                    <div className="text-xs font-medium">Source</div>
                    <ErrorText text={e.snippet} kind="snippet" />
                  </>
                )}
                {e.stack && (
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Stack trace</summary>
                    <div className="mt-2">
                      <ErrorText text={e.stack} kind="stack" />
                    </div>
                  </details>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TraceTab({ traces }: { traces: (ArtifactSummary & { retry: number })[] }) {
  const [state, setState] = useState<Record<number, { busy: boolean; message?: string; ok?: boolean }>>({});
  if (traces.length === 0) {
    return (
      <EmptyState
        title="No trace recorded"
        description={
          <>
            Traces are kept for failed tests (<code className="rounded bg-muted px-1">trace: 'retain-on-failure'</code>). Passed tests do not keep a trace.
          </>
        }
      />
    );
  }
  const launch = async (a: ArtifactSummary) => {
    setState((s) => ({ ...s, [a.id]: { busy: true } }));
    try {
      const r = await openTrace(a.id);
      setState((s) => ({ ...s, [a.id]: { busy: false, ok: r.ok, message: r.message } }));
    } catch (err) {
      setState((s) => ({ ...s, [a.id]: { busy: false, ok: false, message: (err as Error).message } }));
    }
  };
  return (
    <div className="space-y-3">
      {traces.map((t) => {
        const absUrl = `${window.location.origin}${t.url}`;
        const hosted = `https://trace.playwright.dev/?trace=${encodeURIComponent(absUrl)}`;
        const st = state[t.id];
        return (
          <Card key={t.id}>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Play className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <div className="font-medium">
                  Playwright trace · attempt #{t.retry}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {t.fileName} · {formatBytes(t.sizeBytes)}
                </div>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button onClick={() => launch(t)} disabled={st?.busy} data-testid="open-trace">
                  <Play className="h-3.5 w-3.5" /> {st?.busy ? 'Launching…' : 'Open Playwright Trace'}
                </Button>
                <Button variant="outline" onClick={() => window.open(hosted, '_blank', 'noreferrer')} title="Opens trace.playwright.dev pointed at this local file (needs internet)">
                  <Globe className="h-3.5 w-3.5" /> trace.playwright.dev
                </Button>
                <a href={`/api/artifacts/${t.id}/download`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] hover:bg-accent">
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </div>
              {st?.message && (
                <div className={cn('w-full text-xs', st.ok ? 'text-status-passed' : 'text-status-failed')} data-testid="trace-status">
                  {st.message}
                  {st.ok && ' — the viewer opens in a separate browser window on this machine.'}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">
        "Open Playwright Trace" runs <code className="rounded bg-muted px-1">playwright show-trace</code> with the repository's own Playwright install, so the viewer version always matches the recorded trace.
      </p>
    </div>
  );
}

function ScreenshotsTab({ screenshots }: { screenshots: (ArtifactSummary & { retry: number })[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (screenshots.length === 0) return <EmptyState title="No screenshots" description="Screenshots are captured only on failure (screenshot: 'only-on-failure')." />;
  const current = active !== null ? screenshots.find((s) => s.id === active) : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {screenshots.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(s.id)}
            className="group overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-foreground/40"
            data-testid="screenshot-thumb"
          >
            <div className="aspect-video overflow-hidden bg-muted">
              <img src={s.url} alt={s.name} loading="lazy" className="h-full w-full object-cover object-top" />
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5 text-xs">
              <span className="truncate font-mono">{s.fileName}</span>
              <span className="text-muted-foreground">#{s.retry}</span>
            </div>
          </button>
        ))}
      </div>
      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent title={current?.fileName}>
          {current && (
            <div className="space-y-2">
              <img src={current.url} alt={current.name} className="mx-auto max-h-[78vh] w-auto rounded border border-border" data-testid="screenshot-preview" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  attempt #{current.retry} · {formatBytes(current.sizeBytes)}
                </span>
                <a href={`/api/artifacts/${current.id}/download`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Download className="h-3 w-3" /> Download
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function VideoTab({ videos }: { videos: (ArtifactSummary & { retry: number })[] }) {
  if (videos.length === 0) return <EmptyState title="No video" description="Videos are kept only for failed attempts (video: 'retain-on-failure')." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {videos.map((v) => (
        <Card key={v.id}>
          <CardHeader>
            <CardTitle>Attempt #{v.retry}</CardTitle>
            <span className="font-mono text-xs text-muted-foreground">
              {v.fileName} · {formatBytes(v.sizeBytes)}
            </span>
          </CardHeader>
          <CardContent>
            {/* preload=metadata: nothing heavy is downloaded until the user presses play */}
            <video controls preload="metadata" className="w-full rounded bg-black" data-testid="video-player">
              <source src={v.url} type={v.contentType || 'video/webm'} />
              Your browser cannot play this video.{' '}
              <a href={`/api/artifacts/${v.id}/download`} className="underline">
                Download it
              </a>
              .
            </video>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LogsTab({ attempts, texts }: { attempts: AttemptDetail[]; texts: (ArtifactSummary & { retry: number })[] }) {
  const [attemptId, setAttemptId] = useState<number>(attempts[attempts.length - 1]?.id ?? 0);
  const a = attempts.find((x) => x.id === attemptId) ?? attempts[0];
  const attempTexts = useMemo(() => texts.filter((t) => t.attemptId === a?.id), [texts, a]);
  if (!a) return <EmptyState title="No logs" />;
  return (
    <div className="space-y-4">
      {attempts.length > 1 && (
        <div className="flex items-center gap-1">
          {attempts.map((x) => (
            <Button key={x.id} size="sm" variant={x.id === a.id ? 'default' : 'outline'} onClick={() => setAttemptId(x.id)}>
              Attempt #{x.retry}
            </Button>
          ))}
        </div>
      )}
      <LogBlock title="stdout" text={a.stdout} />
      <LogBlock title="stderr" text={a.stderr} tone="failed" />
      {a.errors.length > 0 && <LogBlock title="errors" text={a.errors.map((e) => e.message.split('\n')[0]).join('\n')} tone="failed" />}
      <LogBlock
        title="retries"
        text={attempts.map((x) => `attempt #${x.retry}: ${x.status} (${formatDuration(x.durationMs)}) at ${formatDateTime(x.startedAt)}`).join('\n')}
      />
      {attempTexts.map((t) => (
        <TextArtifact key={t.id} artifact={t} />
      ))}
    </div>
  );
}

function LogBlock({ title, text, tone }: { title: string; text: string; tone?: 'failed' }) {
  return (
    <Card>
      <CardHeader className="py-2">
        <CardTitle className={cn('font-mono text-xs', tone === 'failed' && text && 'text-status-failed')}>{title}</CardTitle>
        <span className="text-[11px] text-muted-foreground">{text ? `${text.split('\n').filter(Boolean).length} lines` : 'empty'}</span>
      </CardHeader>
      {text ? (
        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed">{text}</pre>
      ) : (
        <div className="px-3 py-2 text-xs text-muted-foreground">Nothing captured.</div>
      )}
    </Card>
  );
}

function TextArtifact({ artifact }: { artifact: ArtifactSummary }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (artifact.sizeBytes > 512 * 1024) return;
    fetch(artifact.url)
      .then((r) => r.text())
      .then((t) => !cancelled && setText(t))
      .catch(() => !cancelled && setText('(failed to load)'));
    return () => {
      cancelled = true;
    };
  }, [artifact.url, artifact.sizeBytes]);
  return (
    <Card>
      <CardHeader className="py-2">
        <CardTitle className="font-mono text-xs">{artifact.name}</CardTitle>
        <a href={`/api/artifacts/${artifact.id}/download`} className="text-[11px] text-muted-foreground hover:text-foreground">
          {artifact.fileName} · {formatBytes(artifact.sizeBytes)}
        </a>
      </CardHeader>
      <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed">{text ?? (artifact.sizeBytes > 512 * 1024 ? 'Too large to preview — download instead.' : 'Loading…')}</pre>
    </Card>
  );
}
