// Transfer suggestions: search 1- and 2-transfer moves and rank them by projected points gained
// over the horizon (best XI + captain + expected auto-subs each week), net of hits.

import type { AppPlayer } from "../app-types";
import type { Rules } from "../rules";
import { bestLineup, scoreLineup, type LineupPlayer } from "./lineup";
import { applyTransfer, bank, freeTransfersLeft, type Plan } from "./plan";

export interface Suggestion {
  outs: number[];
  ins: number[];
  gain: number; // projected points gained over the horizon, before hits
  hits: number;
  net: number;
  bankAfter: number;
  beatsRolling: boolean;
}

/** Rough value of keeping a free transfer for next week instead of using it now (points). */
export const ROLL_VALUE = 1.5;
const CANDIDATES_PER_POSITION = 12;

export function squadValue(ids: number[], players: Map<number, AppPlayer>, rules: Rules, horizon: number) {
  let total = 0;
  for (let k = 0; k < horizon; k++) {
    const lp: LineupPlayer[] = ids.map((id) => {
      const p = players.get(id);
      return { id, pos: p?.pos ?? 3, xp: p?.xp[k] ?? 0, pAppear: p?.pAppear[k] ?? 0 };
    });
    const byId = new Map(lp.map((p) => [p.id, p]));
    total += scoreLineup(bestLineup(lp, rules), byId, null).total;
  }
  return total;
}

const horizonXp = (p: AppPlayer, horizon: number) => p.xp.slice(0, horizon).reduce((s, x) => s + x, 0);

function clubOk(ids: number[], players: Map<number, AppPlayer>, limit: number) {
  const counts = new Map<number, number>();
  for (const id of ids) {
    const t = players.get(id)?.team ?? 0;
    const n = (counts.get(t) ?? 0) + 1;
    if (n > limit) return false;
    counts.set(t, n);
  }
  return true;
}

export function suggestTransfers(
  plan: Plan,
  players: Map<number, AppPlayer>,
  rules: Rules,
  { horizon = 3, maxTransfers = 2, limit = 10 } = {},
): { base: number; suggestions: Suggestion[] } {
  const squad = plan.slots.map((s) => s.id);
  const inSquad = new Set(squad);
  const base = squadValue(squad, players, rules, horizon);
  const priceOf = (id: number) => players.get(id)?.price ?? 0;
  const bankNow = bank(plan, priceOf);
  const ft = freeTransfersLeft(plan);
  const noHits = plan.chip === "wildcard" || plan.chip === "freehit";

  const pool = [...players.values()].filter((p) => !inSquad.has(p.id) && p.status !== "u" && p.status !== "n");
  const topByPos = new Map<number, AppPlayer[]>();
  for (const pos of [1, 2, 3, 4]) {
    topByPos.set(
      pos,
      pool
        .filter((p) => p.pos === pos)
        .sort((a, b) => horizonXp(b, horizon) - horizonXp(a, horizon))
        .slice(0, CANDIDATES_PER_POSITION * 3),
    );
  }

  const results: Suggestion[] = [];
  const evaluate = (outIdx: number[], incoming: AppPlayer[]) => {
    let next = plan;
    outIdx.forEach((i, k) => (next = applyTransfer(next, i, incoming[k])));
    const ids = next.slots.map((s) => s.id);
    if (!clubOk(ids, players, rules.clubLimit)) return;
    const bankAfter = bank(next, priceOf);
    if (bankAfter < 0) return;
    const gain = squadValue(ids, players, rules, horizon) - base;
    const hits = noHits ? 0 : Math.max(0, incoming.length - ft) * rules.hitCost;
    const freeUsed = Math.min(incoming.length, ft);
    const net = gain - hits;
    results.push({
      outs: outIdx.map((i) => plan.slots[i].id),
      ins: incoming.map((p) => p.id),
      gain,
      hits,
      net,
      bankAfter,
      // Using FTs you'd otherwise bank has a cost, unless you're at the cap (or on a chip).
      beatsRolling:
        net > (noHits || plan.freeTransfers >= rules.maxFreeTransfers ? 0 : ROLL_VALUE * freeUsed),
    });
  };

  // Singles: every squad slot against the best affordable players in the same position.
  plan.slots.forEach((slot, i) => {
    const out = players.get(slot.id);
    if (!out) return;
    const budget = bankNow + slot.sellPrice;
    const cands = (topByPos.get(out.pos) ?? []).filter((p) => p.price <= budget).slice(0, CANDIDATES_PER_POSITION);
    for (const p of cands) evaluate([i], [p]);
  });

  // Doubles: pairs of squad slots, allowing one to fund the other.
  if (maxTransfers >= 2) {
    for (let i = 0; i < plan.slots.length; i++) {
      for (let j = i + 1; j < plan.slots.length; j++) {
        const a = players.get(plan.slots[i].id);
        const b = players.get(plan.slots[j].id);
        if (!a || !b) continue;
        const budget = bankNow + plan.slots[i].sellPrice + plan.slots[j].sellPrice;
        const ca = (topByPos.get(a.pos) ?? []).slice(0, 8);
        const cb = (topByPos.get(b.pos) ?? []).slice(0, 8);
        for (const pa of ca) {
          for (const pb of cb) {
            if (pa.id === pb.id || pa.price + pb.price > budget) continue;
            evaluate([i, j], [pa, pb]);
          }
        }
      }
    }
  }

  results.sort((x, y) => y.net - x.net);
  // Keep variety: at most two suggestions that start with the same outgoing player.
  const seen = new Map<number, number>();
  const moves = new Set<string>();
  const picked: Suggestion[] = [];
  for (const r of results) {
    // The same pair of players can be swapped into either slot; show it once.
    const move = `${[...r.outs].sort().join(",")}>${[...r.ins].sort().join(",")}`;
    if (moves.has(move)) continue;
    moves.add(move);
    const key = r.outs[0];
    if ((seen.get(key) ?? 0) >= 2) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    picked.push(r);
    if (picked.length >= limit) break;
  }
  return { base, suggestions: picked };
}

/** Chip radar: value of Bench Boost and Triple Captain for the current squad in each upcoming GW. */
export function chipRadar(ids: number[], players: Map<number, AppPlayer>, rules: Rules, gws: number[]) {
  return gws.map((gw, k) => {
    const lp: LineupPlayer[] = ids.map((id) => {
      const p = players.get(id);
      return { id, pos: p?.pos ?? 3, xp: p?.xp[k] ?? 0, pAppear: p?.pAppear[k] ?? 0 };
    });
    const lineup = bestLineup(lp, rules);
    const byId = new Map(lp.map((p) => [p.id, p]));
    const benchBoost = lineup.bench.reduce((s, id) => s + (byId.get(id)?.xp ?? 0), 0);
    const tripleCaptain = byId.get(lineup.captain)?.xp ?? 0;
    return { gw, benchBoost, tripleCaptain, captain: lineup.captain };
  });
}
