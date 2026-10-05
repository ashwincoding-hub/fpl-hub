"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AppData, AppPlayer, TeamData } from "@/lib/app-types";
import type { Chip } from "@/lib/planner/lineup";
import {
  applySwap,
  applyTransfer,
  bank as planBank,
  freeTransfersLeft,
  initPlan,
  lineupFor,
  lineupPlayers,
  planTotals,
  transfersIn,
  transfersOut,
  type Plan,
} from "@/lib/planner/plan";
import type { Suggestion } from "@/lib/planner/suggest";
import { priceSignal } from "@/lib/prices";
import { Card, useMounted } from "./bits";
import { money, pts, useJson, useLookups } from "./hooks";
import { Pitch, type CardInfo } from "./Pitch";
import { PricesTable } from "./PricesTable";
import { ShortlistPanel } from "./ShortlistPanel";
import { useStore } from "./store";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { TransferDrawer } from "./TransferDrawer";

type Tab = "team" | "suggestions" | "prices" | "shortlist";

const CHIP_LABEL: Record<Chip, string> = {
  wildcard: "Wildcard",
  freehit: "Free Hit",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
};

function relativeDays(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.round(ms / 3600_000);
  if (h < 0) return "passed";
  if (h < 48) return `in ${h}h`;
  return `in ${Math.round(h / 24)} days`;
}

export function TeamView({ teamId }: { teamId: number }) {
  const app = useJson<AppData>("/api/data");
  const team = useJson<TeamData>(`/api/team/${teamId}`);
  const lookups = useLookups(app.data);

  if (app.error || team.error) {
    return (
      <div className="rounded-xl border border-fall/40 bg-card p-6">
        <p className="font-semibold text-fall">{team.error ?? app.error}</p>
        <Link href="/" className="mt-3 inline-block text-sm underline">
          Try another team ID
        </Link>
      </div>
    );
  }
  if (!app.data || !team.data || !lookups) {
    return <p className="py-20 text-center text-muted">Loading your team…</p>;
  }
  return <Planner key={team.data.fetchedAt} app={app.data} team={team.data} lookups={lookups} teamId={teamId} />;
}

function Planner({
  app,
  team,
  lookups,
  teamId,
}: {
  app: AppData;
  team: TeamData;
  lookups: NonNullable<ReturnType<typeof useLookups>>;
  teamId: number;
}) {
  const rules = app.rules;
  // A saved plan is only reused if FPL's data behind it (squad, bank, FT estimate) is unchanged.
  const basedOn = `${team.basedOnGw}:${team.squad.map((s) => s.id).sort().join(",")}:${team.bank}:${team.freeTransfers}`;
  const savePlan = useStore((s) => s.savePlan);
  const clearPlan = useStore((s) => s.clearPlan);
  const rememberTeam = useStore((s) => s.rememberTeam);
  const shortlist = useStore((s) => s.shortlist);
  const threshold = useStore((s) => s.alertThreshold);
  const mounted = useMounted();

  // Restore a saved plan for this exact squad. Planner only renders in the browser after the data
  // has loaded, so the persisted store is already hydrated from localStorage here.
  const [plan, setPlan] = useState<Plan>(() => {
    const s = useStore.getState().plans[teamId];
    return s && s.basedOn === basedOn ? s.plan : initPlan(team);
  });
  const [history, setHistory] = useState<Plan[]>(() => {
    const s = useStore.getState().plans[teamId];
    return s && s.basedOn === basedOn ? s.history : [];
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<"idle" | "sub">("idle");
  const [drawerSlot, setDrawerSlot] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("team");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    rememberTeam(teamId, team.entry.name);
  }, [rememberTeam, teamId, team.entry.name]);

  useEffect(() => {
    savePlan(teamId, plan, history, basedOn);
  }, [plan, history, basedOn, savePlan, teamId]);

  const update = (next: Plan) => {
    setHistory((h) => [...h, plan]);
    setPlan(next);
  };

  const players = lookups.players;
  const priceOf = (id: number) => players.get(id)?.price ?? 0;
  const bankNow = planBank(plan, priceOf);
  const totals = useMemo(() => planTotals(plan, players, rules, Math.min(3, app.gws.length)), [plan, players, rules, app.gws.length]);
  const ins = transfersIn(plan);
  const outs = transfersOut(plan);
  const shortSet = new Set(mounted ? shortlist : []);

  // What's shown on the pitch: the user's own XI for the next GW, or the auto-picked best XI.
  const lp = lineupPlayers(plan, players, 0);
  const lineup = lineupFor(plan, lp, 0, rules);
  const slotOf = (id: number) => plan.slots.findIndex((s) => s.id === id);
  const toCard = (id: number): CardInfo => {
    const p = players.get(id)!;
    return {
      player: p,
      slotIndex: slotOf(id),
      isCaptain: lineup.captain === id,
      isVice: lineup.vice === id,
      signal: (() => {
        const s = priceSignal(p, threshold);
        return s === "fall" ? "fall" : s === "rise" && shortSet.has(id) ? "rise" : null;
      })(),
      shortlisted: shortSet.has(id),
      isNew: ins.includes(id),
    };
  };
  const starters = lineup.starters.map(toCard);
  const bench = lineup.bench.map(toCard);

  const swapTargets = useMemo(() => {
    const out = new Set<number>();
    if (mode !== "sub" || selected === null || plan.autoLineup) return out;
    const posOf = (id: number) => players.get(id)?.pos ?? 3;
    for (let j = 0; j < plan.slots.length; j++) {
      if (j === selected) continue;
      const bothStart = selected < rules.squadPlay && j < rules.squadPlay;
      const bothBench = selected >= rules.squadPlay && j >= rules.squadPlay;
      if (bothStart || bothBench) continue;
      if (applySwap(plan, selected, j, posOf, rules)) out.add(j);
    }
    return out;
  }, [mode, selected, plan, players, rules]);

  const onSelect = (slot: number) => {
    if (mode === "sub" && selected !== null && swapTargets.has(slot)) {
      const next = applySwap(plan, selected, slot, (id) => players.get(id)?.pos ?? 3, rules);
      if (next) update(next);
      setMode("idle");
      setSelected(null);
      return;
    }
    setMode("idle");
    setSelected(slot === selected ? null : slot);
  };

  const applySuggestion = (s: Suggestion) => {
    let next = plan;
    s.outs.forEach((outId, k) => {
      const idx = next.slots.findIndex((x) => x.id === outId);
      const incoming = players.get(s.ins[k]);
      if (idx >= 0 && incoming) next = applyTransfer(next, idx, incoming);
    });
    update(next);
    setTab("team");
    setNotice(`Applied: ${s.outs.map((id) => players.get(id)?.name).join(" + ")} → ${s.ins.map((id) => players.get(id)?.name).join(" + ")}`);
  };

  // Alerts: squad players about to fall, shortlisted players about to rise, flagged starters.
  const squadIds = plan.slots.map((s) => s.id);
  const falling = squadIds.map((id) => players.get(id)!).filter((p) => priceSignal(p, threshold) === "fall");
  const rising = [...shortSet].map((id) => players.get(id)).filter((p): p is AppPlayer => !!p && priceSignal(p, threshold) === "rise");
  const flagged = lineup.starters.map((id) => players.get(id)!).filter((p) => p.status !== "a");

  const sel = selected !== null ? players.get(plan.slots[selected].id) : undefined;
  const selIsStarter = selected !== null && lineup.starters.includes(plan.slots[selected].id);
  const chips = (["wildcard", "freehit", "bboost", "3xc"] as Chip[]).filter((c) => team.chipsAvailable.includes(c));

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === t ? "border-brand text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <div className={`space-y-4 ${selected !== null ? "pb-32" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{team.entry.name}</h1>
          <p className="text-sm text-muted">
            {team.entry.manager} · {team.entry.overallPoints} pts
            {team.entry.overallRank ? ` · rank ${team.entry.overallRank.toLocaleString()}` : ""}
          </p>
        </div>
        <p className="text-xs text-muted">
          Projections: {app.projections.source === "model" ? `FPL Hub model ${app.projections.modelVersion}, updated ${new Date(app.projections.generatedAt!).toLocaleString()}` : "FPL's own estimate (next GW only)"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Card label={`GW${app.nextGw} deadline`} value={relativeDays(app.nextDeadline)} sub={new Date(app.nextDeadline).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} />
        <Card label="In the bank" value={money(bankNow)} sub={bankNow !== team.bank ? `was ${money(team.bank)}` : "after last deadline"} />
        <Card
          label="Free transfers"
          value={
            <span className="flex items-center gap-2">
              {freeTransfersLeft(plan)} / {plan.freeTransfers}
              <span className="flex gap-1 text-sm font-normal">
                <button
                  aria-label="One fewer free transfer"
                  disabled={plan.freeTransfers <= 0}
                  onClick={() => update({ ...plan, freeTransfers: plan.freeTransfers - 1 })}
                  className="h-6 w-6 rounded border border-line disabled:opacity-30"
                >
                  −
                </button>
                <button
                  aria-label="One more free transfer"
                  disabled={plan.freeTransfers >= rules.maxFreeTransfers}
                  onClick={() => update({ ...plan, freeTransfers: plan.freeTransfers + 1 })}
                  className="h-6 w-6 rounded border border-line disabled:opacity-30"
                >
                  +
                </button>
              </span>
            </span>
          }
          sub={plan.freeTransfers !== team.freeTransfers ? `left / available · you set this (we estimated ${team.freeTransfers})` : "left / available (est., adjust if wrong)"}
        />
        <Card label={`Projected GW${app.nextGw}`} value={pts(totals.nextGw)} sub={totals.hits ? `after −${totals.hits} hit` : plan.chip ? CHIP_LABEL[plan.chip] : "incl. captain & auto-subs"} />
        <div className="col-span-2 sm:col-span-1">
          <Card label={`Next ${totals.perGw.length} GWs`} value={pts(totals.horizon)} sub={totals.perGw.map((g, i) => `GW${app.gws[i]} ${pts(g.total)}`).join(" · ")} />
        </div>
      </div>

      {(falling.length > 0 || rising.length > 0 || flagged.length > 0 || team.freeHitReverted) && (
        <div className="space-y-1 rounded-xl border border-line bg-card p-3 text-sm">
          {falling.map((p) => (
            <div key={`f${p.id}`} className="text-fall">
              ▼ <b>{p.name}</b> (in your squad) is {Math.abs(p.priceChange!.percent).toFixed(0)}% toward a price fall. Consider selling before it drops.
            </div>
          ))}
          {rising.map((p) => (
            <div key={`r${p.id}`} className="text-rise">
              ▲ <b>{p.name}</b> (shortlisted) is {p.priceChange!.percent.toFixed(0)}% toward a price rise. Buy before it goes up.
            </div>
          ))}
          {flagged.map((p) => (
            <div key={`i${p.id}`} className="text-amber-600 dark:text-amber-400">
              ⚠ <b>{p.name}</b>: {p.news || "flagged"}
            </div>
          ))}
          {team.freeHitReverted && <div className="text-muted">You played Free Hit in GW{team.basedOnGw + 1}, so this shows the squad it reverts to.</div>}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {tabBtn("team", "Pitch & planner")}
        {tabBtn("suggestions", "Suggestions")}
        {tabBtn("prices", "Price changes")}
        {tabBtn("shortlist", `Shortlist${mounted && shortlist.length ? ` (${shortlist.length})` : ""}`)}
      </div>

      {tab === "team" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1">
                Chip:
                <select
                  value={plan.chip ?? ""}
                  onChange={(e) => update({ ...plan, chip: (e.target.value || null) as Chip | null })}
                  className="rounded border border-line bg-card px-2 py-1"
                >
                  <option value="">None</option>
                  {chips.map((c) => (
                    <option key={c} value={c}>
                      {CHIP_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={plan.autoLineup} onChange={(e) => update({ ...plan, autoLineup: e.target.checked })} />
                Auto-pick best XI &amp; captain
              </label>
              <span className="flex-1" />
              <button
                disabled={!history.length}
                onClick={() => {
                  setPlan(history[history.length - 1]);
                  setHistory((h) => h.slice(0, -1));
                }}
                className="rounded border border-line bg-card px-3 py-1 disabled:opacity-40"
              >
                Undo
              </button>
              <button
                onClick={() => {
                  update(initPlan(team));
                  clearPlan(teamId);
                  setNotice("");
                }}
                className="rounded border border-line bg-card px-3 py-1"
              >
                Reset
              </button>
            </div>

            <Pitch starters={starters} bench={bench} lookups={lookups} gws={app.gws} selectedSlot={selected} swapTargets={swapTargets} onSelect={onSelect} />

            <p className="text-xs text-muted">
              Tap a player to make them captain or vice-captain, substitute them, or transfer them out.
            </p>

            {sel && selected !== null && (
              // Fixed to the bottom of the screen so it's visible wherever the player is on the pitch.
              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 shadow-2xl backdrop-blur">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  <div className="mr-auto min-w-0">
                    <b>{sel.name}</b>
                    {lineup.captain === sel.id && <span className="ml-2 rounded bg-zinc-900 px-1.5 text-[11px] font-bold text-white">C</span>}
                    {lineup.vice === sel.id && <span className="ml-2 rounded bg-zinc-900 px-1.5 text-[11px] font-bold text-white">V</span>}
                    <div className="text-xs text-muted">
                      {money(sel.price)} · sells for {money(plan.slots[selected].sellPrice)} (est.) · {pts(sel.xp[0] ?? 0)} pts GW{app.gws[0]}
                    </div>
                  </div>
                  {selIsStarter && (
                    <>
                      <button
                        disabled={plan.autoLineup || lineup.captain === sel.id}
                        title={plan.autoLineup ? "Turn off auto-pick to choose your own captain" : undefined}
                        onClick={() => update({ ...plan, captain: sel.id, vice: plan.vice === sel.id ? plan.captain : plan.vice })}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
                      >
                        Make captain
                      </button>
                      <button
                        disabled={plan.autoLineup || lineup.vice === sel.id}
                        title={plan.autoLineup ? "Turn off auto-pick to choose your own vice-captain" : undefined}
                        onClick={() => update({ ...plan, vice: sel.id, captain: plan.captain === sel.id ? plan.vice : plan.captain })}
                        className="rounded-lg border border-line px-3 py-1.5 font-semibold disabled:opacity-40"
                      >
                        Make vice
                      </button>
                    </>
                  )}
                  <button
                    disabled={plan.autoLineup}
                    onClick={() => setMode("sub")}
                    className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
                  >
                    Substitute
                  </button>
                  <button onClick={() => setDrawerSlot(selected)} className="rounded-lg bg-brand px-3 py-1.5 text-brand-ink">
                    Transfer out
                  </button>
                  <button onClick={() => { setSelected(null); setMode("idle"); }} aria-label="Close" className="px-2 py-1.5 text-muted">
                    ✕
                  </button>
                  {plan.autoLineup && (
                    <span className="w-full text-xs text-muted">Auto-pick is on, so captain and lineup are chosen for you. Untick it to choose yourself.</span>
                  )}
                  {mode === "sub" && <span className="w-full text-xs text-accent">Now tap a highlighted player on the pitch to swap with.</span>}
                  {sel.news && <span className="w-full text-xs text-amber-600 dark:text-amber-400">⚠ {sel.news}</span>}
                </div>
              </div>
            )}
            {notice && <p className="text-sm text-muted">{notice}</p>}
          </div>

          <aside className="space-y-3">
            <div className="rounded-xl border border-line bg-card p-3 text-sm">
              <h3 className="font-semibold">Transfers this week</h3>
              {ins.length === 0 ? (
                <p className="mt-1 text-muted">None yet. Tap a player, then &quot;Transfer out&quot;.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {outs.map((o, i) => (
                    <li key={o} className="flex justify-between gap-2">
                      <span className="text-fall">{players.get(o)?.name}</span>
                      <span className="text-muted">→</span>
                      <span className="text-rise">{players.get(ins[i])?.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 border-t border-line pt-2 text-muted">
                {ins.length} transfer{ins.length === 1 ? "" : "s"} · {totals.hits ? <span className="text-fall">−{totals.hits} pts hit</span> : "no hit"}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3 text-sm">
              <h3 className="font-semibold">How projections work</h3>
              <p className="mt-1 text-muted">
                Each number is expected FPL points: chance of playing, then goals, assists, clean sheets, saves, defensive contributions
                and bonus, from xG/xA and opponent strength. Totals use your XI and captain for GW{app.gws[0]} and the best XI after that.
              </p>
            </div>
          </aside>
        </div>
      )}

      {tab === "suggestions" && <SuggestionsPanel plan={plan} data={app} lookups={lookups} onApply={applySuggestion} />}
      {tab === "prices" && <PricesTable data={app} lookups={lookups} squadIds={squadIds} />}
      {tab === "shortlist" && <ShortlistPanel data={app} lookups={lookups} squadIds={squadIds} />}

      {drawerSlot !== null && (
        <TransferDrawer
          plan={plan}
          slotIndex={drawerSlot}
          lookups={lookups}
          rules={rules}
          gws={app.gws}
          bankNow={bankNow}
          onClose={() => setDrawerSlot(null)}
          onPick={(p) => {
            update(applyTransfer(plan, drawerSlot, p));
            setDrawerSlot(null);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
