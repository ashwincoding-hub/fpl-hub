// Lineup maths shared by the planner and the transfer suggester. All functions are pure.

import type { PositionId } from "../fpl/types";
import type { Rules } from "../rules";

export interface LineupPlayer {
  id: number;
  pos: PositionId;
  xp: number;
  pAppear: number;
}

export interface Lineup {
  starters: number[];
  bench: number[]; // bench GK first, then outfield in auto-sub order
  captain: number;
  vice: number;
}

export function formationValid(starters: LineupPlayer[], rules: Rules): boolean {
  if (starters.length !== rules.squadPlay) return false;
  for (const pos of [1, 2, 3, 4] as PositionId[]) {
    const n = starters.filter((p) => p.pos === pos).length;
    const r = rules.positions[pos];
    if (n < r.minPlay || n > r.maxPlay) return false;
  }
  return true;
}

/** Highest-xp valid XI (greedy is optimal for FPL's min/max formation constraints). */
export function bestLineup(squad: LineupPlayer[], rules: Rules): Lineup {
  const byXp = [...squad].sort((a, b) => b.xp - a.xp);
  const chosen = new Set<number>();
  const count: Record<PositionId, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  // Mandatory minimums first, best players per position.
  for (const pos of [1, 2, 3, 4] as PositionId[]) {
    for (const p of byXp.filter((x) => x.pos === pos).slice(0, rules.positions[pos].minPlay)) {
      chosen.add(p.id);
      count[pos]++;
    }
  }
  // Fill the rest with the best remaining outfield players within the maximums.
  for (const p of byXp) {
    if (chosen.size >= rules.squadPlay) break;
    if (chosen.has(p.id) || count[p.pos] >= rules.positions[p.pos].maxPlay) continue;
    chosen.add(p.id);
    count[p.pos]++;
  }
  const starters = byXp.filter((p) => chosen.has(p.id));
  const benchPlayers = byXp.filter((p) => !chosen.has(p.id));
  const bench = [
    ...benchPlayers.filter((p) => p.pos === 1),
    ...benchPlayers.filter((p) => p.pos !== 1),
  ].map((p) => p.id);
  return {
    starters: starters.map((p) => p.id),
    bench,
    captain: starters[0]?.id ?? 0,
    vice: starters[1]?.id ?? 0,
  };
}

/**
 * Expected points from automatic substitutions: each starter who doesn't play is replaced by the
 * next eligible bench player. Approximated as bench slot k being used with the probability that
 * at least k outfield starters miss (bench GK covers the starting GK).
 */
export function expectedAutoSubPoints(
  lineup: Lineup,
  byId: Map<number, LineupPlayer>,
): number {
  const starters = lineup.starters.map((id) => byId.get(id)!).filter(Boolean);
  const bench = lineup.bench.map((id) => byId.get(id)!).filter(Boolean);
  let total = 0;
  const gk = starters.find((p) => p.pos === 1);
  const benchGk = bench.find((p) => p.pos === 1);
  if (gk && benchGk) total += (1 - gk.pAppear) * benchGk.xp;

  const outfieldMiss = starters.filter((p) => p.pos !== 1).map((p) => 1 - p.pAppear);
  // Distribution of the number of outfield starters missing (Poisson-binomial).
  let dist = [1];
  for (const q of outfieldMiss) {
    const nextDist = new Array(dist.length + 1).fill(0);
    dist.forEach((v, k) => {
      nextDist[k] += v * (1 - q);
      nextDist[k + 1] += v * q;
    });
    dist = nextDist;
  }
  const atLeast = (k: number) => dist.slice(k).reduce((s, v) => s + v, 0);
  bench
    .filter((p) => p.pos !== 1)
    .forEach((p, i) => {
      total += atLeast(i + 1) * p.xp;
    });
  return total;
}

export type Chip = "wildcard" | "freehit" | "bboost" | "3xc";

export interface LineupScore {
  starters: number;
  captainBonus: number;
  bench: number; // auto-sub expectation, or full bench points with Bench Boost
  total: number;
}

export function scoreLineup(
  lineup: Lineup,
  byId: Map<number, LineupPlayer>,
  chip: Chip | null,
): LineupScore {
  const xp = (id: number) => byId.get(id)?.xp ?? 0;
  const starters = lineup.starters.reduce((s, id) => s + xp(id), 0);
  const cap = byId.get(lineup.captain);
  const vice = byId.get(lineup.vice);
  // xp already counts 0 for not playing; if the captain misses, the vice-captain gets the armband.
  const armband = cap ? cap.xp + (1 - cap.pAppear) * (vice?.xp ?? 0) : 0;
  const captainBonus = armband * (chip === "3xc" ? 2 : 1);
  const bench =
    chip === "bboost"
      ? lineup.bench.reduce((s, id) => s + xp(id), 0)
      : expectedAutoSubPoints(lineup, byId);
  return { starters, captainBonus, bench, total: starters + captainBonus + bench };
}
