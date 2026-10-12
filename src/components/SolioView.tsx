"use client";

import { useMemo, useState } from "react";
import { normName, SOLIO_SITE_URL, type MatchSide, type SolioData } from "@/lib/solio";
import { money, pts, useJson } from "./hooks";
import { Kit } from "./Kit";
import { StarButton } from "./bits";

type Tab = "matches" | "players";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Attribution({ data }: { data: SolioData }) {
  return (
    <p className="text-sm text-muted">
      Projections by{" "}
      <a href={SOLIO_SITE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline">
        Solio Analytics
      </a>
      , built from sharp betting markets, for GW{data.gameweek}. Updated{" "}
      {new Date(data.generatedAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}; Solio refreshes about
      every 4 hours.
      {!data.sameGwAsSite && " Note: this is for a different gameweek than the rest of FPL Hub, so our comparison column may be blank."}
    </p>
  );
}

function CsBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className="h-full rounded-full bg-rise" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

function Side({ side, data, align }: { side: MatchSide; data: SolioData; align: "left" | "right" }) {
  const team = data.teams.find((t) => t.id === side.team);
  const right = align === "right";
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1 ${right ? "items-end text-right" : ""}`}>
      <div className={`flex items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
        <Kit teamCode={team?.code ?? 0} size={28} />
        <span className="truncate font-semibold">{team?.name ?? "?"}</span>
      </div>
      <div className="text-xs text-muted">
        {side.source ? (
          <>
            <span className="font-semibold text-foreground tabular-nums">{side.goals.toFixed(2)}</span> goals ·{" "}
            <span className="font-semibold text-foreground tabular-nums">{pct(side.cs)}</span> clean sheet
            {side.source === "solio-derived" && (
              <span
                title="Solio didn't list this team, so this comes from Solio's numbers for their opponent"
                className="ml-1 rounded bg-line px-1 text-[10px] font-semibold text-muted"
              >
                VIA OPP.
              </span>
            )}
            {side.source === "fpl-hub" && (
              <span title="Solio didn't publish either team in this match, so this is FPL Hub's own estimate" className="ml-1 rounded bg-line px-1 text-[10px] font-semibold text-muted">
                OURS
              </span>
            )}
          </>
        ) : (
          "No data"
        )}
      </div>
      {side.source && (
        <div className="w-full max-w-[160px]">
          <CsBar value={side.cs} />
        </div>
      )}
    </div>
  );
}

function Matches({ data }: { data: SolioData }) {
  const sides = data.matches.flatMap((m) => [m.home, m.away]);
  const count = (src: MatchSide["source"]) => sides.filter((s) => s.source === src).length;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Expected goals each side scores and their chance of a clean sheet. Solio publishes this for its top clean-sheet and attacking teams
        ({count("solio")} of {sides.length} sides this week). <b>VIA OPP.</b> sides ({count("solio-derived")}) are worked out from Solio&apos;s
        numbers for their opponent. <b>OURS</b> ({count("fpl-hub")}) means Solio published neither team, so it&apos;s FPL Hub&apos;s own model.
      </p>
      {data.matches.length === 0 && <p className="text-muted">No fixtures found for GW{data.gameweek}.</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {data.matches.map((m, i) => (
          <div key={i} className="rounded-xl border border-line bg-card p-3">
            <div className="mb-2 text-center text-[11px] text-muted">
              {m.kickoff ? new Date(m.kickoff).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "TBC"}
            </div>
            <div className="flex items-start gap-3">
              <Side side={m.home} data={data} align="left" />
              <span className="pt-1 text-xs text-muted">v</span>
              <Side side={m.away} data={data} align="right" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Players({ data }: { data: SolioData }) {
  const [team, setTeam] = useState("");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    // Accent-insensitive, so "savio" finds "Sávio".
    const q = normName(query);
    return data.players.filter((p) => (!team || p.teamShort === team) && (!q || normName(p.name).includes(q)));
  }, [data, team, query]);
  const teamsInList = [...new Set(data.players.map((p) => p.teamShort))].sort();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team" className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm">
          <option value="">All teams</option>
          {teamsInList.map((t) => (
            <option key={t} value={t}>
              {data.teams.find((x) => x.short === t)?.name ?? t}
            </option>
          ))}
        </select>
        <input
          placeholder="Search player"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm"
        />
      </div>
      <p className="text-xs text-muted">
        Solio&apos;s top {data.players.length} players by projected points for GW{data.gameweek}. That&apos;s all their free feed ranks. The
        FPL Hub column is our model&apos;s projection for the same player, for comparison.
      </p>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-2 py-2 text-right">#</th>
              <th className="px-2 py-2 text-left">Player</th>
              <th className="px-2 py-2 text-left">Opponent</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2 text-right">Own %</th>
              <th className="px-2 py-2 text-right">Solio pts</th>
              <th className="px-2 py-2 text-right">FPL Hub pts</th>
              <th className="px-2 py-2 text-right" title="FPL Hub minus Solio">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const diff = p.ours === null ? null : p.ours - p.solio;
              return (
                <tr key={`${p.name}-${p.teamShort}`} className="border-t border-line">
                  <td className="px-2 py-2 text-right tabular-nums text-muted">{p.rank}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      {p.fplId !== null && <StarButton id={p.fplId} />}
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted">
                          {p.teamShort} · {p.position}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs">{p.opponents || "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(p.price)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.ownership === null ? "—" : p.ownership.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{pts(p.solio)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.ours === null ? "—" : pts(p.ours)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${diff === null ? "" : diff >= 0 ? "text-rise" : "text-fall"}`}>
                    {diff === null ? "—" : `${diff >= 0 ? "+" : ""}${pts(diff)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-center text-muted">No players match.</p>}
      </div>
    </div>
  );
}

export function SolioView() {
  const { data, error } = useJson<SolioData>("/api/solio");
  const [tab, setTab] = useState<Tab>("matches");

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === t ? "border-brand text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold tracking-tight">Solio odds</h1>
      {error && <p className="rounded-xl border border-fall/40 bg-card p-4 text-fall">{error}. Solio&apos;s feed may be updating; try again shortly.</p>}
      {!data && !error && <p className="py-20 text-center text-muted">Loading Solio&apos;s numbers…</p>}
      {data && (
        <>
          <Attribution data={data} />
          <div className="flex gap-1 border-b border-line">
            {tabBtn("matches", "Matches")}
            {tabBtn("players", "Players")}
          </div>
          {tab === "matches" ? <Matches data={data} /> : <Players data={data} />}
        </>
      )}
    </div>
  );
}
