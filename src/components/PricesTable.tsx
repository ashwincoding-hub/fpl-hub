"use client";

import { useMemo, useState } from "react";
import type { AppData, AppPlayer } from "@/lib/app-types";
import { changeEtaIndex } from "@/lib/prices";
import { money, type Lookups } from "./hooks";
import { StarButton, useMounted } from "./bits";
import { useStore } from "./store";

type Mode = "rise" | "fall";
type Filter = "all" | "squad" | "shortlist";

const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as const;
const PAGE_SIZE = 30;

function deadlineLabel(iso: string | undefined, index: number) {
  if (!iso) return "—";
  if (index === 0) return "Next update";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(-100, Math.min(100, value));
  const rise = v >= 0;
  return (
    <div className="relative h-2 w-24 overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className="absolute inset-y-0 left-1/2 w-px bg-muted/50" />
      <div
        className={`absolute inset-y-0 ${rise ? "left-1/2 bg-rise" : "right-1/2 bg-fall"}`}
        style={{ width: `${Math.abs(v) / 2}%` }}
      />
    </div>
  );
}

export function PricesTable({
  data,
  lookups,
  squadIds = [],
  defaultFilter = "all",
}: {
  data: AppData;
  lookups: Lookups;
  squadIds?: number[];
  defaultFilter?: Filter;
}) {
  const [mode, setMode] = useState<Mode>("rise");
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [pos, setPos] = useState<number>(0);
  const [team, setTeam] = useState<number>(0);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const shortlist = useStore((s) => s.shortlist);
  const threshold = useStore((s) => s.alertThreshold);
  const mounted = useMounted();

  const hasPriceData = data.players.some((p) => p.priceChange);
  const calibrating = data.players.some((p) => p.priceChange?.calibrating);

  const rows = useMemo(() => {
    const squad = new Set(squadIds);
    const shorts = new Set(mounted ? shortlist : []);
    const q = query.trim().toLowerCase();
    const score = (p: AppPlayer) => p.priceChange?.percent ?? 0;
    return data.players
      .filter((p) => p.priceChange)
      .filter((p) => (filter === "squad" ? squad.has(p.id) : filter === "shortlist" ? shorts.has(p.id) : true))
      .filter((p) => (pos ? p.pos === pos : true))
      .filter((p) => (team ? p.team === team : true))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q))
      .sort((a, b) => (mode === "rise" ? score(b) - score(a) : score(a) - score(b)));
  }, [data, squadIds, shortlist, mounted, filter, pos, team, query, mode]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageRows = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  // Any change to sort or filters starts again from page 1.
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };

  if (!hasPriceData) {
    return <p className="rounded-xl border border-line bg-card p-4 text-muted">FPL isn&apos;t publishing price-change data right now.</p>;
  }

  const btn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-brand text-brand-ink" : "border border-line bg-card"}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn(mode === "rise")} onClick={() => reset(setMode)("rise")}>
          ▲ Most likely to rise
        </button>
        <button className={btn(mode === "fall")} onClick={() => reset(setMode)("fall")}>
          ▼ Most likely to fall
        </button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        {(["all", "squad", "shortlist"] as Filter[]).map((f) => (
          <button key={f} className={btn(filter === f)} onClick={() => reset(setFilter)(f)} disabled={f === "squad" && !squadIds.length}>
            {f === "all" ? "All players" : f === "squad" ? "My squad" : "Shortlist"}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select value={pos} onChange={(e) => reset(setPos)(Number(e.target.value))} className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm" aria-label="Position">
          <option value={0}>All positions</option>
          {Object.entries(POS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={team} onChange={(e) => reset(setTeam)(Number(e.target.value))} className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm" aria-label="Team">
          <option value={0}>All teams</option>
          {data.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Search player"
          value={query}
          onChange={(e) => reset(setQuery)(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm"
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        Progress, rate and projections are published by FPL
        {data.priceUpdatedAt ? `, last updated ${new Date(data.priceUpdatedAt).toLocaleString()}` : ""}. Prices change
        once a day at the next price update. {calibrating && "Some players are still calibrating. "}
        Highlight threshold: {threshold}%.
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-2 py-2 text-left">Player</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2 text-right">Own %</th>
              <th className="px-2 py-2 text-left">Progress</th>
              <th className="px-2 py-2 text-right">At next update</th>
              <th className="px-2 py-2 text-right" title="Net transfers per hour">Rate / hr</th>
              <th className="px-2 py-2 text-right">Net transfers (GW)</th>
              <th className="px-2 py-2 text-right">Expected change</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p) => {
              const pc = p.priceChange!;
              const eta = changeEtaIndex(p);
              const direction = (pc.projected[eta] ?? 0) > 0 ? "rise" : "fall";
              const t = lookups.teams.get(p.team);
              const owned = squadIds.includes(p.id);
              return (
                <tr key={p.id} className={`border-t border-line ${owned ? "bg-brand/5" : ""}`}>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <StarButton id={p.id} />
                      <div>
                        <div className="font-medium">
                          {p.name} {owned && <span className="rounded bg-brand px-1 text-[10px] text-brand-ink">SQUAD</span>}
                        </div>
                        <div className="text-xs text-muted">
                          {t?.short} · {POS[p.pos]}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(p.price)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.ownership.toFixed(1)}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={pc.percent} />
                      <span className={`tabular-nums ${pc.percent >= 0 ? "text-rise" : "text-fall"}`}>{pc.percent.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{pc.projected[0] !== undefined ? `${pc.projected[0].toFixed(1)}%` : "—"}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${pc.hourlyRate >= 0 ? "text-rise" : "text-fall"}`}>
                    {pc.hourlyRate >= 0 ? "+" : ""}
                    {pc.hourlyRate.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.netTransfersGw.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">
                    {pc.lockedUntil ? (
                      <span className="text-muted" title="Price is locked after a recent change">
                        Locked
                      </span>
                    ) : eta >= 0 ? (
                      <span className={direction === "rise" ? "text-rise" : "text-fall"}>
                        {direction === "rise" ? "▲" : "▼"} {deadlineLabel(data.priceDeadlines[eta], eta)}
                      </span>
                    ) : Math.abs(pc.percent) >= 90 ? (
                      <span className="text-muted" title="Close, but not projected to cross 100% in the next few updates">
                        Close
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-center text-muted">No players match.</p>}
      </div>
      {rows.length > PAGE_SIZE && (
        <Pager page={current} pages={pages} total={rows.length} onPage={setPage} />
      )}
    </div>
  );
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  // Show first, last and a window around the current page.
  const nums = [...new Set([0, page - 1, page, page + 1, pages - 1])].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b);
  const btn = "min-w-9 rounded-lg border border-line bg-card px-2 py-1.5 text-sm disabled:opacity-40";
  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-2" aria-label="Pages">
      <span className="text-sm text-muted">
        {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total} players
      </span>
      <div className="flex items-center gap-1">
        <button className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>
          ‹ Prev
        </button>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
            <button
              className={`${btn} ${n === page ? "border-brand bg-brand text-brand-ink" : ""}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
            >
              {n + 1}
            </button>
          </span>
        ))}
        <button className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Next ›
        </button>
      </div>
    </nav>
  );
}
