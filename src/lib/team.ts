// Pure helpers to turn raw FPL manager data into the squad state the planner starts from.

import type { FplChipWindow, FplHistory, FplTransfer } from "./fpl/types";

/**
 * FPL selling price: if the price has risen, you get half the rise (rounded down to £0.1m);
 * if it has fallen, you get the current price.
 */
export function sellingPrice(purchase: number, now: number): number {
  if (now <= purchase) return now;
  return purchase + Math.floor((now - purchase) / 2);
}

/**
 * Estimated free transfers for the next gameweek.
 * One FT per gameweek after the first, unused ones roll over up to `maxFt`; each transfer uses
 * one. In a Wildcard/Free Hit week the banked FTs are kept but no new one is added.
 */
export function estimateFreeTransfers(
  history: FplHistory,
  startedEvent: number,
  lastEvent: number,
  maxFt: number,
): number {
  const chipAt = new Map(history.chips.map((c) => [c.event, c.name]));
  const byEvent = new Map(history.current.map((h) => [h.event, h]));
  let ft = 1; // available for the gameweek after the one the team started in
  for (let e = startedEvent + 1; e <= lastEvent; e++) {
    const chip = chipAt.get(e);
    const used = byEvent.get(e)?.event_transfers ?? 0;
    // Wildcard/Free Hit weeks keep the banked FTs, but the chip uses up that week's +1.
    ft = chip === "wildcard" || chip === "freehit" ? ft : Math.min(maxFt, Math.max(0, ft - used) + 1);
  }
  return ft;
}

/**
 * Purchase price per current squad player: the cost of the latest transfer in (ignoring Free Hit
 * weeks, whose squads revert), or the season start price for players in the original squad.
 */
export function purchasePrices(
  squad: number[],
  transfers: FplTransfer[],
  freeHitEvents: Set<number>,
  startPrice: (id: number) => number,
): Map<number, number> {
  const latest = new Map<number, FplTransfer>();
  for (const t of transfers) {
    if (freeHitEvents.has(t.event)) continue;
    const prev = latest.get(t.element_in);
    if (!prev || t.time > prev.time) latest.set(t.element_in, t);
  }
  return new Map(squad.map((id) => [id, latest.get(id)?.element_in_cost ?? startPrice(id)]));
}

/** Chips that can still be played in `gw`: each chip is available once per window. */
export function availableChips(windows: FplChipWindow[], used: { name: string; event: number }[], gw: number) {
  const out: string[] = [];
  for (const w of windows) {
    if (gw < w.start_event || gw > w.stop_event) continue;
    const spent = used.some((u) => u.name === w.name && u.event >= w.start_event && u.event <= w.stop_event);
    if (!spent && !out.includes(w.name)) out.push(w.name);
  }
  return out;
}
