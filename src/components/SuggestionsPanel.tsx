"use client";

import { useMemo, useState } from "react";
import type { AppData } from "@/lib/app-types";
import type { Plan } from "@/lib/planner/plan";
import { chipRadar, ROLL_VALUE, suggestTransfers, type Suggestion } from "@/lib/planner/suggest";
import { money, pts, type Lookups } from "./hooks";

export function SuggestionsPanel({
  plan,
  data,
  lookups,
  onApply,
}: {
  plan: Plan;
  data: AppData;
  lookups: Lookups;
  onApply: (s: Suggestion) => void;
}) {
  const [horizon, setHorizon] = useState(3);
  const [maxTransfers, setMaxTransfers] = useState(2);
  const result = useMemo(
    () => suggestTransfers(plan, lookups.players, data.rules, { horizon, maxTransfers }),
    [plan, lookups, data.rules, horizon, maxTransfers],
  );
  const radar = useMemo(
    () => chipRadar(plan.slots.map((s) => s.id), lookups.players, data.rules, data.gws),
    [plan, lookups, data],
  );
  const name = (id: number) => lookups.players.get(id)?.name ?? "?";
  const best = result.suggestions[0];

  return (
    <div className="space-y-6">
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">Transfer suggestions</h2>
          <label className="text-sm">
            Horizon{" "}
            <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="rounded border border-line bg-card px-2 py-1">
              {[1, 2, 3, 4, 5, 6].filter((h) => h <= data.gws.length).map((h) => (
                <option key={h} value={h}>
                  {h} GW{h > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Up to{" "}
            <select value={maxTransfers} onChange={(e) => setMaxTransfers(Number(e.target.value))} className="rounded border border-line bg-card px-2 py-1">
              <option value={1}>1 transfer</option>
              <option value={2}>2 transfers</option>
            </select>
          </label>
        </div>
        <p className="mt-1 text-sm text-muted">
          Ranked by projected points gained over the next {horizon} GW{horizon > 1 ? "s" : ""} (best XI, captain and
          likely auto-subs each week), minus −{data.rules.hitCost} per extra transfer. A move &quot;beats rolling&quot; if it gains
          more than ~{ROLL_VALUE} pts per free transfer used, which is roughly what saving it for next week is worth.
        </p>
        <div className="mt-3 rounded-xl border border-line bg-card p-3 text-sm">
          {best && best.beatsRolling ? (
            <>
              <b>Best move:</b> {best.outs.map(name).join(" + ")} → {best.ins.map(name).join(" + ")} ({best.net >= 0 ? "+" : ""}
              {pts(best.net)} pts)
            </>
          ) : (
            <>
              <b>Suggestion: roll your transfer.</b> No move gains more than keeping the free transfer is worth.
            </>
          )}
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-2 py-2 text-left">Out</th>
                <th className="px-2 py-2 text-left">In</th>
                <th className="px-2 py-2 text-right">Gain</th>
                <th className="px-2 py-2 text-right">Hit</th>
                <th className="px-2 py-2 text-right">Net</th>
                <th className="px-2 py-2 text-right">Bank after</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {result.suggestions.map((s, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-2 py-2 text-fall">{s.outs.map(name).join(", ")}</td>
                  <td className="px-2 py-2 text-rise">{s.ins.map(name).join(", ")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">+{pts(s.gain)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{s.hits ? `−${s.hits}` : "—"}</td>
                  <td className={`px-2 py-2 text-right font-semibold tabular-nums ${s.net >= 0 ? "text-rise" : "text-fall"}`}>
                    {s.net >= 0 ? "+" : ""}
                    {pts(s.net)}
                    {s.beatsRolling && <span className="ml-1 text-[10px] font-normal text-muted">beats rolling</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(s.bankAfter)}</td>
                  <td className="px-2 py-2 text-right">
                    <button onClick={() => onApply(s)} className="rounded border border-line px-2 py-1 text-xs hover:border-brand">
                      Try it
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result.suggestions.length && <p className="p-4 text-center text-muted">No valid moves found.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold">Chip radar</h2>
        <p className="mt-1 text-sm text-muted">Projected extra points from each chip with your current squad.</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-2 py-2 text-left">GW</th>
                <th className="px-2 py-2 text-right">Bench Boost</th>
                <th className="px-2 py-2 text-right">Triple Captain</th>
                <th className="px-2 py-2 text-left">Best captain</th>
              </tr>
            </thead>
            <tbody>
              {radar.map((r) => (
                <tr key={r.gw} className="border-t border-line">
                  <td className="px-2 py-2">GW{r.gw}</td>
                  <td className="px-2 py-2 text-right tabular-nums">+{pts(r.benchBoost)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">+{pts(r.tripleCaptain)}</td>
                  <td className="px-2 py-2">{name(r.captain)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
