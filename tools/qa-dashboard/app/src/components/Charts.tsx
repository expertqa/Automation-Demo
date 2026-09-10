import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '@shared/api';
import { formatDate, formatDuration, formatPercent } from '@/lib/utils';

const C = {
  passed: 'hsl(var(--status-passed))',
  failed: 'hsl(var(--status-failed))',
  flaky: 'hsl(var(--status-flaky))',
  skipped: 'hsl(var(--status-skipped))',
  accent: 'hsl(var(--chart-accent))',
  muted: 'hsl(var(--muted-foreground))',
};

const axis = { tick: { fontSize: 11, fill: C.muted }, axisLine: false as const, tickLine: false as const };

function TooltipBox({ label, rows }: { label: string; rows: { name: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.color }} />}
            {r.name}
          </span>
          <span className="tabular font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

type TP = TrendPoint & { label: string };
const withLabel = (t: TrendPoint[]): TP[] => t.map((p) => ({ ...p, label: formatDate(p.startedAt) }));
/** Unique category key (run id) with a date formatter — duplicate dates must not collapse points. */
const xAxisProps = (rows: TP[]) => ({
  dataKey: 'runId' as const,
  tickFormatter: (id: string) => rows.find((r) => r.runId === id)?.label ?? '',
  ...axis,
  minTickGap: 28,
});

/** Stacked pass / flaky / failed per run. */
export function PassFailTrend({ data, height = 200 }: { data: TrendPoint[]; height?: number }) {
  const rows = withLabel(data);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} barCategoryGap="25%" margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis {...xAxisProps(rows)} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'hsl(var(--accent))', opacity: 0.5 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as TP | undefined;
            if (!active || !p) return null;
            return (
              <TooltipBox
                label={`${p.runId} · ${formatDate(p.startedAt)}`}
                rows={[
                  { name: 'Passed', value: String(p.passed), color: C.passed },
                  { name: 'Flaky', value: String(p.flaky), color: C.flaky },
                  { name: 'Failed', value: String(p.failed), color: C.failed },
                  { name: 'Skipped', value: String(p.skipped), color: C.skipped },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="passed" stackId="a" fill={C.passed} isAnimationActive={false} />
        <Bar dataKey="flaky" stackId="a" fill={C.flaky} isAnimationActive={false} />
        <Bar dataKey="failed" stackId="a" fill={C.failed} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DurationTrend({ data, height = 200 }: { data: TrendPoint[]; height?: number }) {
  const rows = withLabel(data);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="durGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={C.accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis {...xAxisProps(rows)} />
        <YAxis {...axis} tickFormatter={(v: number) => formatDuration(v)} width={64} />
        <Tooltip
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as TP | undefined;
            if (!active || !p) return null;
            return <TooltipBox label={`${p.runId} · ${formatDate(p.startedAt)}`} rows={[{ name: 'Duration', value: formatDuration(p.durationMs), color: C.accent }]} />;
          }}
        />
        <Area type="monotone" dataKey="durationMs" stroke={C.accent} strokeWidth={1.75} fill="url(#durGrad)" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PassRateTrend({ data, height = 200 }: { data: TrendPoint[]; height?: number }) {
  const rows = withLabel(data).map((p) => ({ ...p, pct: Math.round(p.passRate * 1000) / 10 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis {...xAxisProps(rows)} />
        <YAxis {...axis} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as TP | undefined;
            if (!active || !p) return null;
            return <TooltipBox label={`${p.runId} · ${formatDate(p.startedAt)}`} rows={[{ name: 'Pass rate', value: formatPercent(p.passRate), color: C.passed }]} />;
          }}
        />
        <Line type="monotone" dataKey="pct" stroke={C.passed} strokeWidth={1.75} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function FailureFlakyTrend({ data, height = 200 }: { data: TrendPoint[]; height?: number }) {
  const rows = withLabel(data);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis {...xAxisProps(rows)} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as TP | undefined;
            if (!active || !p) return null;
            return (
              <TooltipBox
                label={`${p.runId} · ${formatDate(p.startedAt)}`}
                rows={[
                  { name: 'Failed', value: String(p.failed), color: C.failed },
                  { name: 'Flaky', value: String(p.flaky), color: C.flaky },
                ]}
              />
            );
          }}
        />
        <Line type="monotone" dataKey="failed" stroke={C.failed} strokeWidth={1.75} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="flaky" stroke={C.flaky} strokeWidth={1.75} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Tiny inline sparkline of pass rate (0..1) used in suite tables. */
export function Sparkline({ values, width = 96, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - v * (height - 4)).toFixed(1)}`).join(' ');
  const last = values[values.length - 1] ?? 1;
  const color = last >= 0.95 ? C.passed : last >= 0.8 ? C.flaky : C.failed;
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function DailyBars({ data, height = 180 }: { data: { day: string; passed: number; failed: number; flaky: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barCategoryGap="30%" margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="day" {...axis} tickFormatter={(d: string) => formatDate(d)} minTickGap={24} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'hsl(var(--accent))', opacity: 0.5 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as { day: string; passed: number; failed: number; flaky: number } | undefined;
            if (!active || !p) return null;
            return (
              <TooltipBox
                label={p.day}
                rows={[
                  { name: 'Passed', value: String(p.passed), color: C.passed },
                  { name: 'Flaky', value: String(p.flaky), color: C.flaky },
                  { name: 'Failed', value: String(p.failed), color: C.failed },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="passed" stackId="a" fill={C.passed} isAnimationActive={false} />
        <Bar dataKey="flaky" stackId="a" fill={C.flaky} isAnimationActive={false} />
        <Bar dataKey="failed" stackId="a" fill={C.failed} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
