"use client";

import Link from "next/link";
import { useState } from "react";
import type { LeagueRageRow, RageResult, TeamData } from "@/lib/app-types";
import { RAGE_CONFIG, RAGE_LEVELS, rageLevel, type RageGw } from "@/lib/rage";
import { useJson } from "./hooks";

const SEGMENT_COLORS = ["#22c55e", "#a3e635", "#facc15", "#fb923c", "#ef4444"];

/** Half-circle gauge, 0 on the left, 100 on the right, coloured by level. */
function Gauge({ value }: { value: number }) {
  const cx = 110;
  const cy = 105;
  const r = 90;
  const point = (v: number, radius = r) => {
    const a = Math.PI * (1 - v / 100);
    return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)];
  };
  // Each level's arc runs from the previous level's upper bound to its own.
  const arcs = RAGE_LEVELS.map((l, i) => {
    const from = i === 0 ? 0 : RAGE_LEVELS[i - 1].max;
    const to = Math.min(100, l.max);
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} stroke={SEGMENT_COLORS[i]} strokeWidth={16} fill="none" />;
  });
  const [nx, ny] = point(value, r - 22);
  return (
    <svg viewBox="0 0 220 120" className="w-full max-w-[280px]" role="img" aria-label={`Rage meter ${value.toFixed(0)} out of 100`}>
      {arcs}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={7} fill="currentColor" />
    </svg>
  );
}

/** Meter after each gameweek, as a small line chart. */
function Trend({ gws }: { gws: RageGw[] }) {
  if (gws.length < 2) return null;
  const w = 640;
  const h = 120;
  const pad = 18;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (gws.length - 1);
  const y = (v: number) => h - pad - (v / 100) * (h - 2 * pad);
  const d = gws.map((g, i) => `${i ? "L" : "M"} ${x(i)} ${y(g.meter)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Meter after each gameweek">
      {[20, 40, 60, 80].map((v) => (
        <line key={v} x1={pad} x2={w - pad} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 3" />
      ))}
      <path d={d} fill="none" stroke="var(--brand)" strokeWidth={2.5} className="dark:stroke-accent" />
      {gws.map((g, i) => (
        <g key={g.gw}>
          <circle cx={x(i)} cy={y(g.meter)} r={3.5} fill={SEGMENT_COLORS[RAGE_LEVELS.indexOf(rageLevel(g.meter))]} />
          <text x={x(i)} y={h - 3} textAnchor="middle" fontSize="11" fill="var(--muted)">
            GW{g.gw}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Receipt({ gw }: { gw: RageGw }) {
  const pain = gw.items.filter((i) => i.delta > 0).reduce((s, i) => s + i.delta, 0);
  const relief = gw.items.filter((i) => i.delta < 0).reduce((s, i) => s + i.delta, 0);
  return (
    <details className="rounded-xl border border-line bg-card" open={false}>
      <summary className="flex cursor-pointer items-center gap-3 p-3 text-sm">
        <b>GW{gw.gw}</b>
        <span className="text-muted">{gw.points} pts</span>
        <span className="flex-1" />
        <span className="tabular-nums text-muted">
          {gw.before.toFixed(0)} → <b className="text-foreground">{gw.meter.toFixed(0)}</b>
        </span>
        <span>{rageLevel(gw.meter).emoji}</span>
      </summary>
      <ul className="space-y-1 border-t border-line p-3 text-sm">
        <li className="flex justify-between gap-3 text-muted">
          <span>Last week&apos;s {gw.before.toFixed(1)} × {RAGE_CONFIG.decay} (time heals)</span>
          <span className="tabular-nums">{(gw.before * RAGE_CONFIG.decay).toFixed(1)}</span>
        </li>
        {gw.items.map((i, k) => (
          <li key={k} className="flex justify-between gap-3">
            <span>
              <b>{i.label}</b> <span className="text-muted">{i.detail}</span>
            </span>
            <span className={`shrink-0 font-semibold tabular-nums ${i.delta > 0 ? "text-fall" : "text-rise"}`}>
              {i.delta > 0 ? "+" : ""}
              {i.delta.toFixed(1)}
            </span>
          </li>
        ))}
        {!gw.items.length && <li className="text-muted">A quiet week, nothing to report.</li>}
        <li className="flex justify-between gap-3 border-t border-line pt-1 text-muted">
          <span>
            Pain +{pain.toFixed(1)}, relief {relief.toFixed(1)}
          </span>
          <span className="font-semibold text-foreground tabular-nums">= {gw.meter.toFixed(1)}</span>
        </li>
      </ul>
    </details>
  );
}

function LeagueTable({ leagueId, teamId }: { leagueId: number; teamId: number }) {
  const { data, error, loading } = useJson<{ name: string; hasMore: boolean; rows: LeagueRageRow[] }>(`/api/league/${leagueId}/rage`);
  if (error) return <p className="text-sm text-fall">{error}</p>;
  if (loading || !data) return <p className="py-6 text-center text-sm text-muted">Working out everyone&apos;s rage… (up to ~10 seconds the first time)</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="px-2 py-2 text-left">Rage</th>
            <th className="px-2 py-2 text-left">Manager</th>
            <th className="px-2 py-2 text-right" title="Change in the latest finished gameweek">Last GW</th>
            <th className="px-2 py-2 text-left">Biggest pain last GW</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.entry} className={`border-t border-line ${r.entry === teamId ? "bg-brand/10" : ""}`}>
              <td className="whitespace-nowrap px-2 py-2">
                {r.meter === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className="font-semibold tabular-nums">
                    {r.level?.emoji} {r.meter.toFixed(0)}
                  </span>
                )}
              </td>
              <td className="px-2 py-2">
                <Link href={`/team/${r.entry}`} className="font-medium hover:underline">
                  {r.teamName}
                </Link>
                <div className="text-xs text-muted">
                  {r.manager} · #{r.rank} in league
                </div>
              </td>
              <td className={`px-2 py-2 text-right tabular-nums ${r.lastChange === null ? "" : r.lastChange > 0 ? "text-fall" : "text-rise"}`}>
                {r.lastChange === null ? "—" : `${r.lastChange > 0 ? "+" : ""}${r.lastChange.toFixed(1)}`}
              </td>
              <td className="px-2 py-2 text-xs text-muted">{r.worst ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.hasMore && (
        <p className="border-t border-line p-2 text-xs text-muted">Showing the top {data.rows.length} managers by league rank.</p>
      )}
    </div>
  );
}

export function RagePanel({ team }: { team: TeamData }) {
  const { data, error, loading } = useJson<RageResult>(`/api/team/${team.entry.id}/rage`);
  // Default to the smallest league with at least 3 managers: usually the friends' league.
  const leagues = team.leagues;
  const [leagueId, setLeagueId] = useState<number | null>(
    () => (leagues.find((l) => (l.size ?? 0) >= 3) ?? leagues[0])?.id ?? null,
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-[300px_1fr]">
        <div className="flex flex-col items-center rounded-xl border border-line bg-card p-4 text-center">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Delete-the-App-o-Meter</h2>
          {error && <p className="mt-4 text-sm text-fall">{error}</p>}
          {loading && <p className="py-10 text-sm text-muted">Reading your season…</p>}
          {data && (
            <>
              <Gauge value={data.meter} />
              <div className="text-4xl font-bold tabular-nums">{data.meter.toFixed(0)}</div>
              <div className="mt-1 text-lg">
                {data.level.emoji} {data.level.label}
              </div>
              <p className="mt-2 text-xs text-muted">
                Based on finished gameweeks. Bad calls and bad luck push it up, good ones bring it down, and each week the old score fades by a quarter.
              </p>
            </>
          )}
        </div>
        <div className="space-y-3">
          {data && data.gws.length > 1 && (
            <div className="rounded-xl border border-line bg-card p-3">
              <h3 className="mb-1 text-sm font-semibold">Your season</h3>
              <Trend gws={data.gws} />
            </div>
          )}
          {data && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Gameweek receipts</h3>
              {[...data.gws].reverse().map((g) => (
                <Receipt key={g.gw} gw={g} />
              ))}
              {!data.gws.length && <p className="text-sm text-muted">No finished gameweeks yet.</p>}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">Mini-league rage table</h2>
          {leagues.length > 0 && (
            <select
              value={leagueId ?? ""}
              onChange={(e) => setLeagueId(Number(e.target.value))}
              aria-label="Mini-league"
              className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm"
            >
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.size ?? "?"} managers)
                </option>
              ))}
            </select>
          )}
        </div>
        {leagues.length === 0 ? (
          <p className="text-sm text-muted">This team isn&apos;t in any private mini-leagues.</p>
        ) : (
          leagueId !== null && <LeagueTable key={leagueId} leagueId={leagueId} teamId={team.entry.id} />
        )}
      </section>
    </div>
  );
}
