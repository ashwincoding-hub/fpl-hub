import { describe, expect, it } from "vitest";
import { RULES_2026_27 as rules } from "../rules";
import { expectedFloorDiv, pAtLeast, pZero } from "./poisson";
import { availabilityFactor, projectAll } from "./project";
import type { MatchRow } from "./types";

describe("poisson", () => {
  it("matches known values", () => {
    expect(pZero(1)).toBeCloseTo(0.3679, 3);
    expect(pAtLeast(1, 1)).toBeCloseTo(1 - 0.3679, 3);
    // E[floor(X/2)] = (λ − P(X odd)) / 2 = (2 − (1 − e^−4)/2) / 2 for λ = 2
    expect(expectedFloorDiv(2, 2)).toBeCloseTo(0.7546, 3);
  });
});

describe("availabilityFactor", () => {
  it("scales the next GW by the chance of playing and recovers later", () => {
    expect(availabilityFactor({ status: "d", chance: 50 }, 0)).toBe(0.5);
    expect(availabilityFactor({ status: "d", chance: 50 }, 1)).toBe(0.75);
    expect(availabilityFactor({ status: "u", chance: null }, 3)).toBe(0);
    expect(availabilityFactor({ status: "s", chance: 0 }, 1)).toBe(1);
  });
});

function row(player: number, team: number, gw: number, extra: Partial<MatchRow> = {}): MatchRow {
  return {
    player,
    team,
    pos: 4,
    gw,
    fixture: gw * 10 + team,
    opp: team === 1 ? 2 : 1,
    home: team === 1,
    minutes: 90,
    started: true,
    xg: 0.2,
    xa: 0.1,
    goals: 0,
    assists: 0,
    bonus: 0,
    saves: 0,
    yc: 0,
    dc: 2,
    points: 2,
    ...extra,
  };
}

describe("projectAll", () => {
  it("ignores data from the projected gameweeks (no peeking)", () => {
    const base = [1, 2, 3].map((gw) => row(1, 1, gw));
    const future = [row(1, 1, 4, { xg: 5, goals: 5, points: 22 })];
    const input = {
      players: [{ id: 1, team: 1, pos: 4 as const }],
      fixtures: [{ gw: 4, home: 1, away: 2 }],
      targetGws: [4],
      teams: [1, 2],
      scoring: rules.scoring,
      defConThreshold: rules.scoring.defConThreshold,
    };
    const a = projectAll({ ...input, rows: base }).get(1)![0].xp;
    const b = projectAll({ ...input, rows: [...base, ...future] }).get(1)![0].xp;
    expect(a).toBe(b);
  });

  it("gives more points to a nailed high-xG forward than a bench one, and 0 in a blank", () => {
    const rows = [
      ...[1, 2, 3, 4].map((gw) => row(1, 1, gw, { xg: 0.7 })),
      ...[1, 2, 3, 4].map((gw) => row(2, 1, gw, { minutes: 0, started: false, xg: 0 })),
    ];
    const out = projectAll({
      players: [
        { id: 1, team: 1, pos: 4 },
        { id: 2, team: 1, pos: 4 },
      ],
      rows,
      fixtures: [{ gw: 5, home: 1, away: 2 }],
      targetGws: [5, 6],
      teams: [1, 2],
      scoring: rules.scoring,
      defConThreshold: rules.scoring.defConThreshold,
    });
    const nailed = out.get(1)!;
    const bench = out.get(2)!;
    expect(nailed[0].xp).toBeGreaterThan(4);
    expect(bench[0].xp).toBeLessThan(1);
    expect(nailed[1].xp).toBe(0); // no fixture in GW6
    expect(nailed[1].fixtures).toBe(0);
  });
});
