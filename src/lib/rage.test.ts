import { describe, expect, it } from "vitest";
import type { FplPicks, PositionId } from "./fpl/types";
import { effectiveStarters, RAGE_CONFIG, rageForGw, rageLevel, rageSeason, type RageGwInput } from "./rage";

// Squad: 1 GK (1), DEF 2–6, MID 7–11, FWD 12–14, bench GK 15. Positions 1–11 start, 12–15 bench.
const POS: Record<number, PositionId> = {
  1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 3, 10: 4, 11: 4, 12: 1, 13: 2, 14: 3, 15: 4,
};

function picks(over: Partial<FplPicks> = {}, eh: Partial<FplPicks["entry_history"]> = {}): FplPicks {
  return {
    active_chip: null,
    automatic_subs: [],
    entry_history: {
      event: 5, points: 50, total_points: 300, rank: null, overall_rank: 100_000, bank: 0, value: 1000,
      event_transfers: 0, event_transfers_cost: 0, points_on_bench: 2, ...eh,
    },
    picks: Array.from({ length: 15 }, (_, i) => ({
      element: i + 1,
      position: i + 1,
      multiplier: i === 9 ? 2 : i < 11 ? 1 : 0,
      is_captain: i === 9, // player 10 (FWD) captain
      is_vice_captain: i === 10, // player 11 (FWD) vice
      element_type: POS[i + 1],
    })),
    ...over,
  };
}

function input(pts: Record<number, number>, over: Partial<RageGwInput> = {}): RageGwInput {
  const live = new Map(Object.keys(POS).map((k) => [Number(k), { pts: pts[Number(k)] ?? 2, mins: 90 }]));
  return {
    gw: 5,
    picks: picks(),
    prevPicks: null,
    live,
    pos: new Map(Object.entries(POS).map(([k, v]) => [Number(k), v])),
    names: new Map(Object.keys(POS).map((k) => [Number(k), `P${k}`])),
    transfers: [],
    average: 50,
    prevOverallRank: 100_000,
    ...over,
  };
}

const kinds = (r: ReturnType<typeof rageForGw>) => Object.fromEntries(r.items.map((i) => [i.label, i.delta]));

describe("rage meter", () => {
  it("adds a captain fail and a vice haul", () => {
    const r = rageForGw(input({ 10: 1, 11: 15 }), 0);
    expect(kinds(r)["Captain fail"]).toBe(14);
    expect(kinds(r)["Vice-captain haul"]).toBe(RAGE_CONFIG.viceHaul.pain);
  });

  it("caps captain pain and rewards a captain haul", () => {
    expect(kinds(rageForGw(input({ 10: 0, 3: 25 }), 0))["Captain fail"]).toBe(RAGE_CONFIG.captainMissedCap);
    expect(kinds(rageForGw(input({ 10: 13 }), 0))["Captain nailed it"]).toBe(-RAGE_CONFIG.captainGood.relief);
  });

  it("doesn't reward a 'best' captain in an all-blank week", () => {
    const r = rageForGw(input({}), 0); // everyone scores 2
    expect(kinds(r)["Captain nailed it"]).toBeUndefined();
  });

  it("uses the vice-captain when the captain doesn't play", () => {
    const i = input({ 10: 0, 11: 9 });
    i.live.set(10, { pts: 0, mins: 0 });
    const r = rageForGw(i, 0);
    expect(kinds(r)["Captain fail"]).toBeUndefined(); // vice (9) was the best
  });

  it("counts bench points above normal and the worst bench call", () => {
    const r = rageForGw(input({ 13: 10, 2: 1 }, { picks: picks({}, { points_on_bench: 12 }) }), 0);
    expect(kinds(r)["Points on the bench"]).toBe(12 - RAGE_CONFIG.benchNormal);
    expect(kinds(r)["Wrong bench call"]).toBe((10 - 1) * RAGE_CONFIG.wrongBenchPerPoint); // DEF 13 vs DEF 2
  });

  it("scores transfers and hits", () => {
    const t = (inId: number, outId: number) => ({ element_in: inId, element_out: outId, element_in_cost: 50, element_out_cost: 50, event: 5, time: "" });
    // Bought 6 (scored 1) for player 99 (scored 8); bought 7 (9) for 98 (2). Net 0 − 4 hit.
    const i = input({ 6: 1, 7: 9 }, { transfers: [t(6, 99), t(7, 98)], picks: picks({}, { event_transfers_cost: 4 }) });
    i.live.set(99, { pts: 8, mins: 90 });
    i.live.set(98, { pts: 2, mins: 90 });
    const r = rageForGw(i, 0);
    expect(kinds(r)["Transfer fail"]).toBe(7);
    expect(kinds(r)["Transfer win"]).toBe(-7);
    expect(kinds(r)["Hit didn't pay"]).toBe(4);
  });

  it("flags Wildcard/Free Hit regret when the old team would have scored more", () => {
    const old = picks();
    const now = picks(
      { active_chip: "freehit", picks: picks().picks.map((p) => ({ ...p, element: p.element + 100 })) },
      { points: 30 },
    );
    const r = rageForGw(input({ 10: 10 }, { picks: now, prevPicks: old }), 0);
    // Old XI: ten players × 2 + captain 10 × 2 = 40, vs 30 actual.
    expect(kinds(r)["Free Hit regret"]).toBe(10);
  });

  it("compares with the average and rewards a green arrow", () => {
    const r = rageForGw(input({}, { average: 40, picks: picks({}, { points: 60, overall_rank: 50_000 }) }), 0);
    expect(kinds(r)["Above-average week"]).toBe(-RAGE_CONFIG.vsAverageCap);
    expect(kinds(r)["Green arrow"]).toBe(-RAGE_CONFIG.greenArrowRelief);
  });

  it("applies time-heals decay and stays within 0–100", () => {
    const quiet = input({}, { average: 50 });
    expect(rageForGw(quiet, 80).meter).toBeCloseTo(80 * RAGE_CONFIG.decay);
    const awful = input({ 10: 0, 11: 15, 3: 25 }, { average: 100, picks: picks({}, { points_on_bench: 40 }) });
    expect(rageForGw(awful, 100).meter).toBe(100);
    const great = input({ 10: 20 }, { average: 10, picks: picks({}, { points: 90, overall_rank: 1 }) });
    expect(rageForGw(great, 0).meter).toBe(0);
  });

  it("chains gameweeks from the starting level", () => {
    const season = rageSeason([input({}, { gw: 2 }), input({}, { gw: 1 })]);
    expect(season.map((g) => g.gw)).toEqual([1, 2]);
    expect(season[0].before).toBe(RAGE_CONFIG.start);
    expect(season[1].before).toBe(season[0].meter);
  });

  it("applies automatic substitutions and maps levels", () => {
    expect(effectiveStarters(picks({ automatic_subs: [{ element_in: 13, element_out: 2, event: 5 }] }))).toContain(13);
    expect(rageLevel(5).label).toBe("Living the dream");
    expect(rageLevel(85).label).toBe("Thumb hovering over Delete");
  });
});
