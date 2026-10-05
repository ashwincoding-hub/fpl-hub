// Planner state: the user's squad plus any what-if transfers, subs and chips. All functions are pure.

import type { AppPlayer, TeamData } from "../app-types";
import type { Rules } from "../rules";
import {
  bestLineup,
  formationValid,
  scoreLineup,
  type Chip,
  type Lineup,
  type LineupPlayer,
  type LineupScore,
} from "./lineup";

export interface PlanSlot {
  id: number;
  purchasePrice: number;
  sellPrice: number;
}

export interface Plan {
  original: PlanSlot[]; // index = FPL slot − 1 (0–10 starting XI, 11–14 bench)
  slots: PlanSlot[];
  captain: number;
  vice: number;
  originalBank: number;
  freeTransfers: number;
  chip: Chip | null;
  autoLineup: boolean; // pick the best XI and captain automatically
}

export function initPlan(team: TeamData): Plan {
  const ordered = [...team.squad].sort((a, b) => a.slot - b.slot);
  const slots = ordered.map((p) => ({ id: p.id, purchasePrice: p.purchasePrice, sellPrice: p.sellPrice }));
  return {
    original: slots,
    slots,
    captain: ordered.find((p) => p.isCaptain)?.id ?? slots[0].id,
    vice: ordered.find((p) => p.isVice)?.id ?? slots[1].id,
    originalBank: team.bank,
    freeTransfers: team.freeTransfers,
    chip: null,
    autoLineup: false,
  };
}

const ids = (slots: PlanSlot[]) => slots.map((s) => s.id);

export function transfersIn(plan: Plan): number[] {
  const orig = new Set(ids(plan.original));
  return ids(plan.slots).filter((id) => !orig.has(id));
}

export function transfersOut(plan: Plan): number[] {
  const cur = new Set(ids(plan.slots));
  return ids(plan.original).filter((id) => !cur.has(id));
}

export function bank(plan: Plan, priceOf: (id: number) => number): number {
  const outs = transfersOut(plan);
  const ins = transfersIn(plan);
  const sold = outs.reduce((s, id) => s + (plan.original.find((o) => o.id === id)?.sellPrice ?? 0), 0);
  const bought = ins.reduce((s, id) => s + priceOf(id), 0);
  return plan.originalBank + sold - bought;
}

export function hitCost(plan: Plan, rules: Rules): number {
  if (plan.chip === "wildcard" || plan.chip === "freehit") return 0;
  return Math.max(0, transfersIn(plan).length - plan.freeTransfers) * rules.hitCost;
}

export function freeTransfersLeft(plan: Plan): number {
  if (plan.chip === "wildcard" || plan.chip === "freehit") return plan.freeTransfers;
  return Math.max(0, plan.freeTransfers - transfersIn(plan).length);
}

export function clubCounts(plan: Plan, teamOf: (id: number) => number): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of plan.slots) m.set(teamOf(s.id), (m.get(teamOf(s.id)) ?? 0) + 1);
  return m;
}

export type TransferCheck = { ok: true } | { ok: false; reason: string };

export function checkTransfer(
  plan: Plan,
  slotIndex: number,
  incoming: AppPlayer,
  players: Map<number, AppPlayer>,
  rules: Rules,
): TransferCheck {
  const outgoing = players.get(plan.slots[slotIndex].id);
  if (!outgoing) return { ok: false, reason: "Unknown player" };
  if (incoming.pos !== outgoing.pos) return { ok: false, reason: "Must be the same position" };
  if (plan.slots.some((s) => s.id === incoming.id)) return { ok: false, reason: "Already in your squad" };
  const counts = clubCounts(plan, (id) => players.get(id)?.team ?? 0);
  const after = (counts.get(incoming.team) ?? 0) + (outgoing.team === incoming.team ? 0 : 1);
  if (after > rules.clubLimit) return { ok: false, reason: `Max ${rules.clubLimit} players per club` };
  const next = applyTransfer(plan, slotIndex, incoming);
  if (bank(next, (id) => players.get(id)?.price ?? 0) < 0) return { ok: false, reason: "Not enough money" };
  return { ok: true };
}

export function applyTransfer(plan: Plan, slotIndex: number, incoming: AppPlayer): Plan {
  const out = plan.slots[slotIndex];
  // Buying back a player you just sold restores their original purchase price.
  const orig = plan.original.find((o) => o.id === incoming.id);
  const slot: PlanSlot = orig ?? { id: incoming.id, purchasePrice: incoming.price, sellPrice: incoming.price };
  const slots = plan.slots.map((s, i) => (i === slotIndex ? slot : s));
  return {
    ...plan,
    slots,
    captain: plan.captain === out.id ? incoming.id : plan.captain,
    vice: plan.vice === out.id ? incoming.id : plan.vice,
  };
}

/** Swap two squad slots (a substitution). Returns null if the resulting XI is not a valid formation. */
export function applySwap(
  plan: Plan,
  i: number,
  j: number,
  posOf: (id: number) => LineupPlayer["pos"],
  rules: Rules,
): Plan | null {
  const slots = [...plan.slots];
  [slots[i], slots[j]] = [slots[j], slots[i]];
  const starters = slots.slice(0, rules.squadPlay).map((s) => ({ id: s.id, pos: posOf(s.id), xp: 0, pAppear: 1 }));
  if (!formationValid(starters, rules)) return null;
  const starterIds = new Set(starters.map((s) => s.id));
  let { captain, vice } = plan;
  if (!starterIds.has(captain)) captain = starterIds.has(vice) ? vice : starters[0].id;
  if (!starterIds.has(vice) || vice === captain) vice = starters.find((s) => s.id !== captain)!.id;
  return { ...plan, slots, captain, vice };
}

export function lineupPlayers(
  plan: Plan,
  players: Map<number, AppPlayer>,
  gwIndex: number,
): LineupPlayer[] {
  return plan.slots.map((s) => {
    const p = players.get(s.id);
    return { id: s.id, pos: p?.pos ?? 3, xp: p?.xp[gwIndex] ?? 0, pAppear: p?.pAppear[gwIndex] ?? 0 };
  });
}

/** The user's own lineup for the next GW (unless auto-pick is on); the best XI for later weeks. */
export function lineupFor(plan: Plan, lp: LineupPlayer[], gwIndex: number, rules: Rules): Lineup {
  if (gwIndex === 0 && !plan.autoLineup) {
    return {
      starters: plan.slots.slice(0, rules.squadPlay).map((s) => s.id),
      bench: plan.slots.slice(rules.squadPlay).map((s) => s.id),
      captain: plan.captain,
      vice: plan.vice,
    };
  }
  return bestLineup(lp, rules);
}

export interface PlanTotals {
  perGw: LineupScore[];
  hits: number;
  nextGw: number; // projected points for the next GW, after hits
  horizon: number; // sum over the first `horizonGws` GWs, after hits
}

export function planTotals(
  plan: Plan,
  players: Map<number, AppPlayer>,
  rules: Rules,
  horizonGws = 3,
): PlanTotals {
  const perGw: LineupScore[] = [];
  for (let k = 0; k < horizonGws; k++) {
    // A Free Hit squad reverts to the original squad after one gameweek.
    const squad = k > 0 && plan.chip === "freehit" ? { ...plan, slots: plan.original } : plan;
    const lp = lineupPlayers(squad, players, k);
    const byId = new Map(lp.map((p) => [p.id, p]));
    const lineup = lineupFor(squad, lp, k, rules);
    // Chips apply to the next gameweek only.
    perGw.push(scoreLineup(lineup, byId, k === 0 ? plan.chip : null));
  }
  const hits = hitCost(plan, rules);
  return {
    perGw,
    hits,
    nextGw: (perGw[0]?.total ?? 0) - hits,
    horizon: perGw.reduce((s, g) => s + g.total, 0) - hits,
  };
}
