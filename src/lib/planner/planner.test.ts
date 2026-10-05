import { describe, expect, it } from "vitest";
import type { AppPlayer, TeamData } from "../app-types";
import type { PositionId } from "../fpl/types";
import { RULES_2026_27 as rules } from "../rules";
import { bestLineup, expectedAutoSubPoints, formationValid, scoreLineup, type LineupPlayer } from "./lineup";
import { applySwap, applyTransfer, bank, checkTransfer, hitCost, initPlan, planTotals } from "./plan";
import { suggestTransfers } from "./suggest";

// A 15-man squad: 2 GK, 5 DEF, 5 MID, 3 FWD, from different clubs.
const POSITIONS: PositionId[] = [1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 1, 2, 2, 3];

function player(id: number, pos: PositionId, xp: number, price = 50, team = id): AppPlayer {
  return {
    id,
    name: `P${id}`,
    fullName: `Player ${id}`,
    team,
    pos,
    price,
    startPrice: price,
    ownership: 1,
    status: "a",
    chance: null,
    news: "",
    form: 0,
    totalPoints: 0,
    xp: [xp, xp, xp],
    pAppear: [1, 1, 1],
    priceChange: null,
    netTransfersGw: 0,
  };
}

function setup() {
  const squad = POSITIONS.map((pos, i) => player(i + 1, pos, 2 + (i % 5)));
  const pool = [...squad, player(100, 4, 9, 80, 50), player(101, 3, 1, 40, 51), player(102, 4, 8, 200, 52)];
  const players = new Map(pool.map((p) => [p.id, p]));
  const team: TeamData = {
    fetchedAt: "",
    entry: { id: 1, name: "T", manager: "M", overallPoints: 0, overallRank: null, gwPoints: 0 },
    basedOnGw: 5,
    freeHitReverted: false,
    squad: squad.map((p, i) => ({
      id: p.id,
      slot: i + 1,
      isCaptain: i === 4,
      isVice: i === 5,
      purchasePrice: 50,
      sellPrice: 50,
    })),
    bank: 10,
    freeTransfers: 1,
    chipsUsed: [],
    chipsAvailable: [],
  };
  return { players, plan: initPlan(team) };
}

describe("lineup", () => {
  const lp = (id: number, pos: PositionId, xp: number, pAppear = 1): LineupPlayer => ({ id, pos, xp, pAppear });

  it("picks a valid best XI", () => {
    const squad = [
      lp(1, 1, 5), lp(2, 1, 4),
      lp(3, 2, 1), lp(4, 2, 1), lp(5, 2, 1), lp(6, 2, 9), lp(7, 2, 9),
      lp(8, 3, 8), lp(9, 3, 8), lp(10, 3, 8), lp(11, 3, 8), lp(12, 3, 8),
      lp(13, 4, 7), lp(14, 4, 0), lp(15, 4, 0),
    ];
    const l = bestLineup(squad, rules);
    const byId = new Map(squad.map((p) => [p.id, p]));
    expect(formationValid(l.starters.map((id) => byId.get(id)!), rules)).toBe(true);
    expect(l.starters).toContain(6);
    expect(l.starters).toContain(12);
    expect(l.captain).toBe(6);
    expect(l.bench[0]).toBe(2); // bench GK first
  });

  it("values the bench only when starters may not play", () => {
    const squad = [
      lp(1, 1, 5), lp(2, 1, 4),
      ...[3, 4, 5, 6, 7].map((id) => lp(id, 2, 3)),
      ...[8, 9, 10, 11, 12].map((id) => lp(id, 3, 3)),
      lp(13, 4, 3), lp(14, 4, 3), lp(15, 4, 3),
    ];
    const l = bestLineup(squad, rules);
    const byId = new Map(squad.map((p) => [p.id, p]));
    expect(expectedAutoSubPoints(l, byId)).toBeCloseTo(0);
    byId.set(l.starters[3], { ...byId.get(l.starters[3])!, pAppear: 0 });
    expect(expectedAutoSubPoints(l, byId)).toBeGreaterThan(2.9);
  });

  it("applies Triple Captain and Bench Boost", () => {
    const squad = [
      lp(1, 1, 5), lp(2, 1, 4),
      ...[3, 4, 5, 6, 7].map((id) => lp(id, 2, 3)),
      ...[8, 9, 10, 11, 12].map((id) => lp(id, 3, 3)),
      lp(13, 4, 10), lp(14, 4, 3), lp(15, 4, 3),
    ];
    const l = bestLineup(squad, rules);
    const byId = new Map(squad.map((p) => [p.id, p]));
    const base = scoreLineup(l, byId, null).total;
    expect(scoreLineup(l, byId, "3xc").total - base).toBeCloseTo(10);
    expect(scoreLineup(l, byId, "bboost").total).toBeGreaterThan(base);
  });
});

describe("plan", () => {
  it("tracks bank, hits and club limits", () => {
    const { players, plan } = setup();
    const fwdSlot = 8; // P9, a forward
    const next = applyTransfer(plan, fwdSlot, players.get(100)!);
    expect(bank(next, (id) => players.get(id)!.price)).toBe(10 + 50 - 80);
    expect(checkTransfer(plan, fwdSlot, players.get(100)!, players, rules)).toEqual({ ok: false, reason: "Not enough money" });
    expect(checkTransfer(plan, fwdSlot, players.get(101)!, players, rules)).toEqual({ ok: false, reason: "Must be the same position" });
    expect(hitCost(plan, rules)).toBe(0);
  });

  it("charges a hit per transfer beyond free ones, but not on a Wildcard", () => {
    const { players, plan } = setup();
    let next = applyTransfer(plan, 4, players.get(101)!); // MID
    next = applyTransfer(next, 5, { ...players.get(101)!, id: 103, team: 60 });
    expect(hitCost(next, rules)).toBe(4);
    expect(hitCost({ ...next, chip: "wildcard" }, rules)).toBe(0);
  });

  it("rejects substitutions that break the formation", () => {
    const { players, plan } = setup();
    const posOf = (id: number) => players.get(id)!.pos;
    // Swapping the starting GK (slot 0) with a bench defender leaves no GK.
    expect(applySwap(plan, 0, 12, posOf, rules)).toBeNull();
    // Bench GK for starting GK is fine.
    expect(applySwap(plan, 0, 11, posOf, rules)).not.toBeNull();
  });

  it("Free Hit only affects the next gameweek", () => {
    const { players, plan } = setup();
    const withFh = { ...applyTransfer(plan, 8, { ...players.get(100)!, price: 50 }), chip: "freehit" as const };
    players.set(100, { ...players.get(100)!, price: 50 });
    const t = planTotals(withFh, players, rules);
    const base = planTotals(plan, players, rules);
    expect(t.perGw[0].total).toBeGreaterThan(base.perGw[0].total);
    expect(t.perGw[1].total).toBeCloseTo(base.perGw[1].total);
  });
});

describe("suggestTransfers", () => {
  it("finds an affordable upgrade", () => {
    const { players, plan } = setup();
    players.set(100, { ...players.get(100)!, price: 55 });
    const { suggestions } = suggestTransfers(plan, players, rules, { maxTransfers: 1 });
    expect(suggestions[0].ins).toEqual([100]);
    expect(suggestions[0].net).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.ins.includes(102))).toBe(false); // too expensive
  });
});
