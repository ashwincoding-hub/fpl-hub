"use client";

import type { AppData } from "@/lib/app-types";
import { priceSignal } from "@/lib/prices";
import { money, pts, type Lookups } from "./hooks";
import { StarButton, useMounted } from "./bits";
import { useStore } from "./store";

export function ShortlistPanel({ data, lookups, squadIds }: { data: AppData; lookups: Lookups; squadIds: number[] }) {
  const mounted = useMounted();
  const shortlist = useStore((s) => s.shortlist);
  const threshold = useStore((s) => s.alertThreshold);
  const setThreshold = useStore((s) => s.setAlertThreshold);
  const ids = mounted ? shortlist : [];
  const players = ids.map((id) => lookups.players.get(id)).filter((p) => p !== undefined);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">Shortlist</h2>
        <label className="text-sm text-muted">
          Highlight at{" "}
          <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="rounded border border-line bg-card px-2 py-1 text-foreground">
            {[60, 70, 80, 90, 95].map((t) => (
              <option key={t} value={t}>
                {t}%
              </option>
            ))}
          </select>{" "}
          toward a price change
        </label>
      </div>
      <p className="mt-1 text-sm text-muted">
        Star (☆) any player to watch them. Shortlisted players about to <span className="text-rise">rise</span> and squad players
        about to <span className="text-fall">fall</span> are highlighted on the pitch and in the header. Saved in this browser.
      </p>
      {!players.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-line p-6 text-center text-muted">
          Nothing shortlisted yet. Tap ☆ next to any player in the transfer list or price table.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-2 py-2 text-left">Player</th>
                <th className="px-2 py-2 text-right">Price</th>
                <th className="px-2 py-2 text-right">Price progress</th>
                {data.gws.slice(0, 3).map((gw) => (
                  <th key={gw} className="px-2 py-2 text-right">
                    GW{gw}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const sig = priceSignal(p, threshold);
                return (
                  <tr key={p.id} className={`border-t border-line ${sig === "rise" ? "bg-rise/10" : sig === "fall" ? "bg-fall/10" : ""}`}>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <StarButton id={p.id} />
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted">{lookups.teams.get(p.team)?.short}</span>
                        {squadIds.includes(p.id) && <span className="rounded bg-brand px-1 text-[10px] text-brand-ink">SQUAD</span>}
                        {sig && (
                          <span className={`text-xs font-semibold ${sig === "rise" ? "text-rise" : "text-fall"}`}>
                            {sig === "rise" ? "▲ Likely to rise" : "▼ Likely to fall"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(p.price)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.priceChange ? `${p.priceChange.percent.toFixed(1)}%` : "—"}</td>
                    {[0, 1, 2].map((i) => (
                      <td key={i} className="px-2 py-2 text-right tabular-nums">
                        {pts(p.xp[i] ?? 0)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
