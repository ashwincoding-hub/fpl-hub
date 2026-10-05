"use client";

import { useMemo, useState } from "react";
import type { AppPlayer } from "@/lib/app-types";
import { checkTransfer, type Plan } from "@/lib/planner/plan";
import type { Rules } from "@/lib/rules";
import { money, pts, type Lookups } from "./hooks";
import { PriceBadge, StarButton } from "./bits";

type SortKey = "total" | "gw0" | "gw1" | "gw2" | "price" | "ownership";

export function TransferDrawer({
  plan,
  slotIndex,
  lookups,
  rules,
  gws,
  bankNow,
  onPick,
  onClose,
}: {
  plan: Plan;
  slotIndex: number;
  lookups: Lookups;
  rules: Rules;
  gws: number[];
  bankNow: number;
  onPick: (p: AppPlayer) => void;
  onClose: () => void;
}) {
  const out = lookups.players.get(plan.slots[slotIndex].id)!;
  const sell = plan.slots[slotIndex].sellPrice;
  const [query, setQuery] = useState("");
  const [affordableOnly, setAffordableOnly] = useState(true);
  const [sort, setSort] = useState<SortKey>("total");
  const three = (p: AppPlayer) => p.xp.slice(0, 3).reduce((s, x) => s + x, 0);
  const outTotal = three(out);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...lookups.players.values()]
      .filter((p) => p.pos === out.pos && p.id !== out.id)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q) || lookups.teams.get(p.team)?.short.toLowerCase() === q)
      .map((p) => ({ p, check: checkTransfer(plan, slotIndex, p, lookups.players, rules), total: three(p) }))
      .filter((r) => !affordableOnly || r.check.ok);
    const key = (r: (typeof list)[number]) =>
      sort === "total" ? r.total : sort === "price" ? r.p.price : sort === "ownership" ? r.p.ownership : r.p.xp[Number(sort.slice(2))] ?? 0;
    return list.sort((a, b) => key(b) - key(a)).slice(0, 80);
  }, [lookups, out, plan, slotIndex, rules, query, affordableOnly, sort]);

  const th = (label: string, k: SortKey) => (
    <th className="px-2 py-2 text-right">
      <button onClick={() => setSort(k)} className={sort === k ? "font-bold text-foreground underline" : "hover:text-foreground"}>
        {label}
      </button>
    </th>
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Replace ${out.name}`}
        className="flex h-full w-full max-w-2xl flex-col bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div>
            <div className="text-sm text-muted">Transfer out</div>
            <div className="text-lg font-bold">
              {out.name} <span className="font-normal text-muted">· sells for {money(sell)} · {pts(outTotal)} pts over 3 GWs</span>
            </div>
            <div className="text-sm text-muted">Budget for replacement: {money(bankNow + sell)}</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-line px-3 py-1 text-sm">
            Close
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <input
            placeholder="Search name or team (e.g. ARS)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={affordableOnly} onChange={(e) => setAffordableOnly(e.target.checked)} />
            Only valid moves
          </label>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted">
              <tr>
                <th className="px-2 py-2 text-left">Player</th>
                {th("Price", "price")}
                {th("Own %", "ownership")}
                {th(`GW${gws[0]}`, "gw0")}
                {th(`GW${gws[1]}`, "gw1")}
                {th(`GW${gws[2]}`, "gw2")}
                {th("3 GW", "total")}
                <th className="px-2 py-2 text-right">vs out</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, check, total }) => {
                const delta = total - outTotal;
                return (
                  <tr
                    key={p.id}
                    onClick={() => check.ok && onPick(p)}
                    title={check.ok ? "Click to transfer in" : check.reason}
                    className={`border-t border-line ${check.ok ? "cursor-pointer hover:bg-card" : "opacity-50"}`}
                  >
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <StarButton id={p.id} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {p.name} {p.status !== "a" && <span title={p.news} className="text-amber-500">⚠</span>}
                          </div>
                          <div className="text-xs text-muted">
                            {lookups.teams.get(p.team)?.short} ·{" "}
                            {lookups.opponents(p.team, gws[0]).map((f) => `${f.opp.short} (${f.home ? "H" : "A"})`).join(", ") || "blank"}
                            {!check.ok && ` · ${check.reason}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {money(p.price)} <PriceBadge p={p} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.ownership.toFixed(1)}</td>
                    {[0, 1, 2].map((i) => (
                      <td key={i} className="px-2 py-2 text-right tabular-nums">
                        {pts(p.xp[i] ?? 0)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{pts(total)}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${delta >= 0 ? "text-rise" : "text-fall"}`}>
                      {delta >= 0 ? "+" : ""}
                      {pts(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="p-6 text-center text-muted">No players match.</p>}
        </div>
      </div>
    </div>
  );
}
