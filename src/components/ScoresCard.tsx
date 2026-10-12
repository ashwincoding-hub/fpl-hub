"use client";

import { useState } from "react";
import type { AppData, GwMatch, GwView, TeamGwView } from "@/lib/app-types";
import { FDR_CLASS, useJson, type Lookups } from "./hooks";
import { Kit } from "./Kit";

type Tab = "scores" | "fixtures";

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "TBC";

function MatchRow({ m, lookups, mine }: { m: GwMatch; lookups: Lookups; mine: Set<number> }) {
  const team = (id: number) => lookups.teams.get(id);
  const name = (id: number) => lookups.players.get(id)?.name ?? "?";
  const events = (teamId: number) =>
    m.goals
      .filter((g) => g.team === teamId)
      .map((g) => (
        <span key={`g${g.player}${g.own}`} className={mine.has(g.player) ? "font-semibold text-foreground" : ""}>
          ⚽ {name(g.player)}
          {g.count > 1 ? ` ×${g.count}` : ""}
          {g.own ? " (OG)" : ""}
        </span>
      ))
      .concat(
        m.assists
          .filter((a) => a.team === teamId)
          .map((a) => (
            <span key={`a${a.player}`} className={mine.has(a.player) ? "font-semibold text-foreground" : ""}>
              🅰️ {name(a.player)}
              {a.count > 1 ? ` ×${a.count}` : ""}
            </span>
          )),
      );
  const score = m.status === "upcoming" ? "v" : `${m.homeScore ?? 0} – ${m.awayScore ?? 0}`;
  return (
    <li className="border-t border-line py-2 first:border-t-0">
      <div className="flex items-center gap-2 text-sm">
        <span className="flex flex-1 items-center justify-end gap-1 truncate text-right">
          {team(m.home)?.short}
          <Kit teamCode={team(m.home)?.code ?? 0} size={18} />
        </span>
        <span className={`w-14 rounded px-1 text-center text-xs font-bold tabular-nums ${m.status === "live" ? "bg-fall text-white" : "bg-line"}`}>
          {score}
        </span>
        <span className="flex flex-1 items-center gap-1 truncate">
          <Kit teamCode={team(m.away)?.code ?? 0} size={18} />
          {team(m.away)?.short}
        </span>
      </div>
      <div className="mt-0.5 text-center text-[10px] text-muted">
        {m.status === "live" ? `LIVE · ${m.minutes}'` : m.status === "finished" ? "FT" : time(m.kickoff)}
      </div>
      {(m.goals.length > 0 || m.assists.length > 0) && (
        <div className="mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-muted">
          <div className="flex flex-col items-end text-right">{events(m.home)}</div>
          <div className="flex flex-col">{events(m.away)}</div>
        </div>
      )}
    </li>
  );
}

function MyPoints({ data, error, view, lookups }: { data?: TeamGwView; error?: string; view: GwView; lookups: Lookups }) {
  if (error) return <p className="text-xs text-muted">{error}</p>;
  if (!data) return <p className="text-xs text-muted">Loading your team…</p>;
  const subbedIn = new Set(data.autoSubs.map((s) => s.in));
  const subbedOut = new Set(data.autoSubs.map((s) => s.out));
  const rows = [...data.picks].sort((a, b) => a.position - b.position);
  const pts = (id: number) => view.points[id]?.[0] ?? 0;
  return (
    <div className="rounded-lg bg-background p-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Your team</span>
        <span className="text-lg font-bold tabular-nums">
          {data.points - data.hitCost}
          <span className="ml-1 text-xs font-normal text-muted">pts{data.hitCost ? ` (−${data.hitCost} hit)` : ""}</span>
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 text-xs">
        {rows.map((p) => {
          const bench = p.position > 11;
          const played = (view.points[p.id]?.[1] ?? 0) > 0;
          const counted = (!bench && !subbedOut.has(p.id)) || subbedIn.has(p.id) || data.chip === "bboost";
          const mult = p.captain ? (data.chip === "3xc" ? 3 : 2) : 1;
          return (
            <li key={p.id} className={`flex justify-between gap-2 py-0.5 ${counted ? "" : "text-muted"}`}>
              <span className="truncate">
                {lookups.players.get(p.id)?.name}
                {p.captain && " (C)"}
                {p.vice && " (V)"}
                {subbedIn.has(p.id) && " ↑"}
                {subbedOut.has(p.id) && " ↓"}
                {!played && view.finished && <span title="Didn't play"> ·</span>}
              </span>
              <span className="tabular-nums">{counted ? pts(p.id) * mult : pts(p.id)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-[10px] text-muted">
        Grey = bench ({data.benchPoints} pts). ↑/↓ = auto-subs.
      </p>
    </div>
  );
}

function Scores({ teamId, app, lookups }: { teamId: number; app: AppData; lookups: Lookups }) {
  // The latest gameweek that has started is the "current" one.
  const current = Math.max(1, app.nextGw - 1);
  const [gw, setGw] = useState(current);
  const { data, error } = useJson<GwView>(`/api/gw/${gw}`);
  const myGw = useJson<TeamGwView>(`/api/team/${teamId}/gw/${gw}`);
  // Your players' goals and assists are highlighted in the match list.
  const mine = new Set((myGw.data?.picks ?? []).map((p) => p.id));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          aria-label="Previous gameweek"
          disabled={gw <= 1}
          onClick={() => setGw(gw - 1)}
          className="rounded-lg border border-line px-2 py-1 text-sm disabled:opacity-30"
        >
          ‹ GW{gw - 1}
        </button>
        <span className="font-semibold">
          Gameweek {gw}
          {data?.matches.some((m) => m.status === "live") && <span className="ml-1 text-xs text-fall">LIVE</span>}
        </span>
        <button
          aria-label="Next gameweek"
          disabled={gw >= current}
          onClick={() => setGw(gw + 1)}
          className="rounded-lg border border-line px-2 py-1 text-sm disabled:opacity-30"
        >
          GW{gw + 1} ›
        </button>
      </div>
      {error && <p className="text-xs text-fall">{error}</p>}
      {!data && !error && <p className="py-6 text-center text-xs text-muted">Loading…</p>}
      {data && (
        <>
          <MyPoints data={myGw.data} error={myGw.error} view={data} lookups={lookups} />
          <ul>
            {data.matches.map((m) => (
              <MatchRow key={m.id} m={m} lookups={lookups} mine={mine} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Fixtures({ app, lookups }: { app: AppData; lookups: Lookups }) {
  const gw = app.nextGw;
  const list = app.fixtures.filter((f) => f.gw === gw).sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""));
  const team = (id: number) => lookups.teams.get(id);
  return (
    <div>
      <div className="mb-1 text-center font-semibold">Gameweek {gw}</div>
      <ul>
        {list.map((f, i) => (
          <li key={i} className="border-t border-line py-2 text-sm first:border-t-0">
            <div className="text-center text-[10px] text-muted">{time(f.kickoff)}</div>
            <div className="flex items-center gap-2">
              <span className="flex flex-1 items-center justify-end gap-1">
                <span className={`rounded px-1 text-[10px] ${FDR_CLASS[f.homeDifficulty]}`}>{f.homeDifficulty}</span>
                {team(f.home)?.short}
                <Kit teamCode={team(f.home)?.code ?? 0} size={18} />
              </span>
              <span className="text-xs text-muted">v</span>
              <span className="flex flex-1 items-center gap-1">
                <Kit teamCode={team(f.away)?.code ?? 0} size={18} />
                {team(f.away)?.short}
                <span className={`rounded px-1 text-[10px] ${FDR_CLASS[f.awayDifficulty]}`}>{f.awayDifficulty}</span>
              </span>
            </div>
            {f.odds && (
              <div className="mt-0.5 grid grid-cols-2 gap-3 text-[10px] text-muted">
                <span className="text-right">
                  {f.odds.homeGoals.toFixed(1)} xG · {Math.round(f.odds.homeCs * 100)}% CS
                </span>
                <span>
                  {f.odds.awayGoals.toFixed(1)} xG · {Math.round(f.odds.awayCs * 100)}% CS
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-muted">Number badge = FPL difficulty. xG and clean-sheet % from the FPL Hub model.</p>
    </div>
  );
}

export function ScoresCard({ teamId, app, lookups }: { teamId: number; app: AppData; lookups: Lookups }) {
  const [tab, setTab] = useState<Tab>("scores");
  const btn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`flex-1 border-b-2 py-2 text-sm font-semibold ${tab === t ? "border-brand text-foreground" : "border-transparent text-muted"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex border-b border-line">
        {btn("scores", "Scores")}
        {btn("fixtures", `Fixtures GW${app.nextGw}`)}
      </div>
      <div className="p-3">{tab === "scores" ? <Scores teamId={teamId} app={app} lookups={lookups} /> : <Fixtures app={app} lookups={lookups} />}</div>
    </div>
  );
}
