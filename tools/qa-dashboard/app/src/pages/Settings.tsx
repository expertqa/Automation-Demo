import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { deleteDemoData, resetSettings, saveSettings, useSettings } from '@/lib/api';
import type { FlakyConfig } from '@shared/types';

export function SettingsPage() {
  const q = useSettings();
  const qc = useQueryClient();
  const [flaky, setFlaky] = useState<FlakyConfig | null>(null);
  const [repo, setRepo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.data && !flaky) {
      setFlaky(q.data.settings.flaky);
      setRepo(q.data.settings.github.repositoryUrl ?? '');
    }
  }, [q.data, flaky]);

  if (q.isLoading || !flaky) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const info = q.data!.info;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await saveSettings({ flaky, github: { repositoryUrl: repo.trim() || null } });
      setFlaky(r.settings.flaky);
      setRepo(r.settings.github.repositoryUrl ?? '');
      await qc.invalidateQueries();
      setMsg('Settings saved.');
    } catch (err) {
      setMsg(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    const r = await resetSettings();
    setFlaky(r.settings.flaky);
    setRepo('');
    await qc.invalidateQueries();
    setMsg('Defaults restored.');
  };
  const removeDemo = async () => {
    if (!window.confirm('Remove all demo runs and their artifacts?')) return;
    const r = await deleteDemoData();
    await qc.invalidateQueries();
    setMsg(`Removed ${r.removed} demo run(s).`);
  };

  const num = (k: keyof FlakyConfig, scale = 1) => ({
    value: String(Math.round((flaky[k] as number) * scale * 100) / 100),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFlaky({ ...flaky, [k]: Number(e.target.value) / scale }),
  });

  return (
    <>
      <PageHeader title="Settings" description="Flaky detection thresholds, GitHub linking and local data." />
      {msg && <div className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-xs" data-testid="settings-message">{msg}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Flaky detection</CardTitle>
              <CardDescription>Simple, explainable rules evaluated over each test's recent executions.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Window (executions)" hint="How many recent executions are considered.">
              <Input type="number" min={2} max={500} {...num('windowRuns')} />
            </Field>
            <Field label="Minimum executions" hint="Rate/transition rules need at least this many executions.">
              <Input type="number" min={1} max={500} {...num('minExecutions')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Failure rate min (%)" hint="Above this…">
                <Input type="number" min={0} max={100} {...num('failureRateMin', 100)} />
              </Field>
              <Field label="Failure rate max (%)" hint="…and below this = unstable.">
                <Input type="number" min={0} max={100} {...num('failureRateMax', 100)} />
              </Field>
            </div>
            <Field label="Minimum pass↔fail transitions" hint="Alternating results in the window.">
              <Input type="number" min={1} max={500} {...num('minTransitions')} />
            </Field>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <div className="text-[13px] font-medium">Count pass-after-retry as flaky</div>
                <div className="text-xs text-muted-foreground">Playwright's own "flaky" outcome flags the test.</div>
              </div>
              <Switch checked={flaky.countRetryPass} onCheckedChange={(v) => setFlaky({ ...flaky, countRetryPass: v })} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>GitHub source links</CardTitle>
                <CardDescription>Links use the commit SHA recorded with each run — never a moving branch.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Repository URL override" hint="Leave empty to use the git remote captured by the reporter.">
                <Input placeholder="https://github.com/org/repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
              </Field>
              <div className="text-xs text-muted-foreground">
                Currently linking to: <span className="font-mono text-foreground">{info.repositoryUrl ?? 'not available'}</span>
              </div>
              <div className="rounded-md bg-muted/50 p-2 font-mono text-[11px] text-muted-foreground">{'{repo}/blob/{commitSha}/{file}#L{line}'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Local data</CardTitle>
                <CardDescription>Everything lives on this machine.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Data dir</dt>
                <dd className="break-all font-mono">{info.dataDir}</dd>
                <dt className="text-muted-foreground">Database</dt>
                <dd className="break-all font-mono">{info.databaseFile}</dd>
                <dt className="text-muted-foreground">Artifacts</dt>
                <dd className="break-all font-mono">{info.artifactsDir}</dd>
                <dt className="text-muted-foreground">Repo root</dt>
                <dd className="break-all font-mono">{info.repoRoot}</dd>
                <dt className="text-muted-foreground">Trace viewer</dt>
                <dd>
                  {info.traceViewer.available ? (
                    <Badge variant="passed">available · Playwright {info.traceViewer.playwrightVersion}</Badge>
                  ) : (
                    <Badge variant="failed">Playwright CLI not found — run npm install in the repo</Badge>
                  )}
                </dd>
                <dt className="text-muted-foreground">Demo runs</dt>
                <dd className="flex items-center gap-2">
                  {info.demoRuns}
                  {info.demoRuns > 0 && (
                    <Button variant="outline" size="sm" onClick={removeDemo} data-testid="remove-demo">
                      Remove demo data
                    </Button>
                  )}
                </dd>
              </dl>
              <div className="mt-3 space-y-1 rounded-md bg-muted/50 p-2 font-mono text-[11px] text-muted-foreground">
                <div>npm run dashboard:import -- ./playwright-dashboard-results.zip</div>
                <div>npm run dashboard:seed</div>
                <div>npm run dashboard:reset</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button onClick={save} disabled={busy} data-testid="save-settings">
          Save settings
        </Button>
        <Button variant="outline" onClick={reset}>
          Restore defaults
        </Button>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[13px] font-medium">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </label>
  );
}
