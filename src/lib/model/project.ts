// Projection model v1.
//
// For every player and upcoming fixture:
//   expected points = Σ over scoring events of P(event) × FPL points for that event.
// Inputs are only per-match rows from *before* the first projected gameweek, so the exact same
// code path is used for live projections and for backtests (no peeking at future data).

import type { PositionId } from "../fpl/types";
import type { Scoring } from "../rules";
import { expectedFloorDiv, pAtLeast, pZero } from "./poisson";
import type {
  Availability,
  Breakdown,
  FixtureLite,
  GwProjection,
  MatchRow,
  PlayerInfo,
  PlayerPrior,
  TeamRating,
} from "./types";

export const MODEL_VERSION = "v1.0";

// ---- Tunable constants (changed via the backtest) -------------------------------------------

/** Tunable model parameters. Values are chosen with `npm run tune` on the 2025/26 walk-forward. */
export const MODEL_PARAMS = {
  homeGoals: 1.1, // goal multiplier for the home side
  awayGoals: 0.9,
  teamDecay: 0.98, // per-gameweek weight decay for team ratings
  teamPseudoMatches: 6, // how strongly team ratings shrink toward the prior
  playerDecay: 0.75, // per-gameweek weight decay for player minutes and rates
  priorMinutesLastSeason: 450, // weight (in minutes) given to last season's per-90 rates
  priorMinutesPosition: 270, // weight given to the positional average when no history
  startPriorWeight: 0.7, // pseudo-matches for the chance-of-starting prior
  subMinutes: 20,
};

const POS_PRIOR: Record<PositionId, PlayerPrior> = {
  1: { minutes: 0, xg90: 0, xa90: 0.01, bonus90: 0.15, saves90: 2.8, yc90: 0.05, dc90: 0 },
  2: { minutes: 0, xg90: 0.04, xa90: 0.05, bonus90: 0.12, saves90: 0, yc90: 0.13, dc90: 8 },
  3: { minutes: 0, xg90: 0.12, xa90: 0.1, bonus90: 0.14, saves90: 0, yc90: 0.14, dc90: 8 },
  4: { minutes: 0, xg90: 0.3, xa90: 0.08, bonus90: 0.2, saves90: 0, yc90: 0.12, dc90: 4.5 },
};

// ---- Team ratings ------------------------------------------------------------------------------

export interface TeamRatings {
  avgGoals: number; // league average xG per team per match
  byTeam: Map<number, TeamRating>;
}

/**
 * Team attack/defence ratings from match xG. Each team's xG for a fixture is the sum of its
 * players' xG in that fixture; xG against is the opponent's sum.
 */
export function teamRatings(
  rows: MatchRow[],
  cutoffGw: number,
  teams: number[],
  priors: Map<number, TeamRating> = new Map(),
): TeamRatings {
  const perFixture = new Map<string, { gw: number; team: number; opp: number; xg: number }>();
  for (const r of rows) {
    if (r.gw >= cutoffGw) continue;
    const key = `${r.fixture}:${r.team}`;
    const cur = perFixture.get(key) ?? { gw: r.gw, team: r.team, opp: r.opp, xg: 0 };
    cur.xg += r.xg;
    perFixture.set(key, cur);
  }
  const matches = [...perFixture.values()];
  const avgGoals = matches.length ? matches.reduce((s, m) => s + m.xg, 0) / matches.length : 1.35;

  const acc = new Map<number, { w: number; f: number; a: number }>();
  for (const m of matches) {
    const w = Math.pow(MODEL_PARAMS.teamDecay, cutoffGw - 1 - m.gw);
    const t = acc.get(m.team) ?? { w: 0, f: 0, a: 0 };
    t.w += w;
    t.f += w * m.xg;
    acc.set(m.team, t);
    const o = acc.get(m.opp) ?? { w: 0, f: 0, a: 0 };
    o.a += w * m.xg;
    acc.set(m.opp, o);
  }

  const byTeam = new Map<number, TeamRating>();
  for (const team of teams) {
    const prior = priors.get(team) ?? { att: 1, def: 1 };
    const t = acc.get(team) ?? { w: 0, f: 0, a: 0 };
    // t.w counts each match once from the attacking side; conceded uses the same fixtures.
    const k = MODEL_PARAMS.teamPseudoMatches;
    const att = (t.f + k * prior.att * avgGoals) / ((t.w + k) * avgGoals);
    const def = (t.a + k * prior.def * avgGoals) / ((t.w + k) * avgGoals);
    byTeam.set(team, { att, def });
  }
  return { avgGoals, byTeam };
}

// ---- Player profile ----------------------------------------------------------------------------

export interface PlayerProfile {
  pStart: number;
  p60GivenStart: number;
  pSubGivenBench: number;
  minsGivenStart: number;
  xg90: number;
  xa90: number;
  bonus90: number;
  saves90: number;
  yc90: number;
  pDefCon: number; // P(reaching the DefCon threshold | plays 60+)
}

function tailWithOverdispersion(mean: number, threshold: number): number {
  // Poisson under-states the spread of match-level counts; average two Poissons around the mean.
  return 0.5 * (pAtLeast(mean * 0.7, threshold) + pAtLeast(mean * 1.3, threshold));
}

export function playerProfile(
  info: PlayerInfo,
  rows: MatchRow[],
  cutoffGw: number,
  defConThreshold: number,
): PlayerProfile {
  const pos = info.pos;
  const posPrior = POS_PRIOR[pos];
  const last = info.prior && info.prior.minutes >= 600 ? info.prior : undefined;

  let wAll = 0,
    wStart = 0,
    wStart60 = 0,
    wBench = 0,
    wSub = 0,
    wMinsStart = 0,
    w90 = 0,
    wXg = 0,
    wXa = 0,
    wBonus = 0,
    wSaves = 0,
    wYc = 0,
    wDcN = 0,
    wDcHit = 0,
    wDcSum = 0,
    wDc90 = 0;

  for (const r of rows) {
    if (r.gw >= cutoffGw) continue;
    const w = Math.pow(MODEL_PARAMS.playerDecay, cutoffGw - 1 - r.gw);
    wAll += w;
    if (r.started) {
      wStart += w;
      wMinsStart += w * r.minutes;
      if (r.minutes >= 60) wStart60 += w;
    } else {
      wBench += w;
      if (r.minutes > 0) wSub += w;
    }
    if (r.minutes > 0) {
      w90 += (w * r.minutes) / 90;
      wXg += w * r.xg;
      wXa += w * r.xa;
      wBonus += w * r.bonus;
      wSaves += w * r.saves;
      wYc += w * r.yc;
      if (r.dc !== null) {
        wDcSum += w * r.dc;
        wDc90 += (w * r.minutes) / 90;
      }
    }
    if (r.dc !== null && r.minutes >= 60) {
      wDcN += w;
      if (r.dc >= defConThreshold) wDcHit += w;
    }
  }

  // Minutes: blend observed rates with a prior.
  const priorStart = last ? Math.min(0.9, Math.max(0.1, last.minutes / 3000)) : 0.3;
  const k0 = MODEL_PARAMS.startPriorWeight;
  const pStart = (wStart + k0 * priorStart) / (wAll + k0);
  const p60GivenStart = (wStart60 + 0.8 * 1.5) / (wStart + 1.5);
  const pSubGivenBench = (wSub + 0.25 * 1) / (wBench + 1);
  const minsGivenStart = (wMinsStart + 80 * 1) / (wStart + 1);

  // Per-90 rates, shrunk toward last season (if available) or the positional average.
  const prior = last ?? posPrior;
  const priorMins = last ? MODEL_PARAMS.priorMinutesLastSeason : MODEL_PARAMS.priorMinutesPosition;
  const p90 = priorMins / 90;
  const rate = (sum: number, priorRate: number) => (sum + priorRate * p90) / (w90 + p90);

  const dcPrior = prior.dc90 ?? posPrior.dc90 ?? 0;
  const dc90 = (wDcSum + dcPrior * p90) / (wDc90 + p90);
  const modelHit = pos === 1 ? 0 : tailWithOverdispersion(dc90, defConThreshold);
  const pDefCon = pos === 1 ? 0 : (wDcHit + modelHit * 3) / (wDcN + 3);

  return {
    pStart,
    p60GivenStart,
    pSubGivenBench,
    minsGivenStart,
    xg90: rate(wXg, prior.xg90),
    xa90: rate(wXa, prior.xa90),
    bonus90: rate(wBonus, prior.bonus90),
    saves90: pos === 1 ? rate(wSaves, prior.saves90 || posPrior.saves90) : 0,
    yc90: rate(wYc, prior.yc90),
    pDefCon,
  };
}

// ---- Availability ------------------------------------------------------------------------------

/** Multiplier on the chance of featuring, for the k-th upcoming gameweek (k = 0 is the next one). */
export function availabilityFactor(a: Availability | undefined, k: number): number {
  if (!a) return 1;
  if (a.status === "u" || a.status === "n") return 0; // left the club / on loan / not registered
  const c = a.chance ?? (a.status === "a" ? 100 : a.status === "d" ? 50 : 0);
  const now = c / 100;
  if (k === 0) return now;
  if (a.status === "s") return 1; // suspensions are usually a single match
  if (k === 1) return now + (1 - now) * 0.5;
  if (k === 2) return now + (1 - now) * 0.75;
  return 1;
}

// ---- Projection --------------------------------------------------------------------------------

const zeroBreakdown = (): Breakdown => ({
  appearance: 0,
  goals: 0,
  assists: 0,
  cleanSheet: 0,
  conceded: 0,
  saves: 0,
  defCon: 0,
  bonus: 0,
  cards: 0,
});

export function projectPlayer(
  info: PlayerInfo,
  profile: PlayerProfile,
  fixtures: FixtureLite[], // all fixtures in the target gameweeks
  targetGws: number[],
  ratings: TeamRatings,
  scoring: Scoring,
  availability?: Availability,
): GwProjection[] {
  const pos = info.pos;
  const own = ratings.byTeam.get(info.team) ?? { att: 1, def: 1 };
  return targetGws.map((gw, k) => {
    const b = zeroBreakdown();
    const fx = fixtures.filter((f) => f.gw === gw && (f.home === info.team || f.away === info.team));
    const avail = availabilityFactor(availability, k);
    const pStart = profile.pStart * avail;
    const pSub = (1 - profile.pStart) * profile.pSubGivenBench * avail;
    const p60 = pStart * profile.p60GivenStart;
    const pShort = pStart * (1 - profile.p60GivenStart) + pSub;
    const expMins = pStart * profile.minsGivenStart + pSub * MODEL_PARAMS.subMinutes;
    let pAppearAny = 0;

    for (const f of fx) {
      const home = f.home === info.team;
      const oppId = home ? f.away : f.home;
      const opp = ratings.byTeam.get(oppId) ?? { att: 1, def: 1 };
      const ownHome = home ? MODEL_PARAMS.homeGoals : MODEL_PARAMS.awayGoals;
      const oppHome = home ? MODEL_PARAMS.awayGoals : MODEL_PARAMS.homeGoals;
      const lambdaAgainst = ratings.avgGoals * opp.att * own.def * oppHome;
      const minsShare = expMins / 90;
      const attackAdj = opp.def * ownHome; // opponent-and-venue adjustment on the player's rates

      b.appearance += scoring.longPlay * p60 + scoring.shortPlay * pShort;
      b.goals += scoring.goal[pos] * profile.xg90 * minsShare * attackAdj;
      b.assists += scoring.assist * profile.xa90 * minsShare * attackAdj;
      b.cleanSheet += scoring.cleanSheet[pos] * p60 * pZero(lambdaAgainst);
      if (scoring.goalsConcededPer2[pos] !== 0) {
        // Goals conceded while on the pitch, approximated by scaling the team's rate by minutes.
        const onPitch = profile.minsGivenStart / 90;
        b.conceded +=
          scoring.goalsConcededPer2[pos] * p60 * expectedFloorDiv(lambdaAgainst * onPitch, 2);
      }
      if (pos === 1) {
        const savesMean = profile.saves90 * (opp.att * oppHome) * (profile.minsGivenStart / 90);
        b.saves += scoring.savesPer3 * p60 * expectedFloorDiv(savesMean, 3);
      }
      b.defCon += scoring.defCon[pos] * p60 * profile.pDefCon;
      b.bonus += profile.bonus90 * minsShare * Math.sqrt(attackAdj);
      b.cards += scoring.yellow * profile.yc90 * minsShare;
      pAppearAny = 1 - (1 - pAppearAny) * (1 - (p60 + pShort));
    }

    const xp = Object.values(b).reduce((s, v) => s + v, 0);
    return {
      gw,
      xp: round2(xp),
      pAppear: round2(fx.length ? pAppearAny : 0),
      p60: round2(fx.length ? p60 : 0),
      fixtures: fx.length,
      breakdown: Object.fromEntries(
        Object.entries(b).map(([key, v]) => [key, round2(v)]),
      ) as unknown as Breakdown,
    };
  });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---- Convenience: project everyone ---------------------------------------------------------------

export interface ProjectAllInput {
  players: PlayerInfo[];
  rows: MatchRow[]; // may include rows at/after the cutoff; they're ignored
  fixtures: FixtureLite[];
  targetGws: number[];
  teams: number[];
  teamPriors?: Map<number, TeamRating>;
  scoring: Scoring;
  defConThreshold: Record<PositionId, number>;
  availability?: Map<number, Availability>;
}

export function projectAll(input: ProjectAllInput): Map<number, GwProjection[]> {
  const cutoff = Math.min(...input.targetGws);
  const ratings = teamRatings(input.rows, cutoff, input.teams, input.teamPriors);
  const rowsByPlayer = new Map<number, MatchRow[]>();
  for (const r of input.rows) {
    if (r.gw >= cutoff) continue;
    const list = rowsByPlayer.get(r.player) ?? [];
    list.push(r);
    rowsByPlayer.set(r.player, list);
  }
  const out = new Map<number, GwProjection[]>();
  for (const p of input.players) {
    const prof = playerProfile(
      p,
      rowsByPlayer.get(p.id) ?? [],
      cutoff,
      input.defConThreshold[p.pos],
    );
    out.set(
      p.id,
      projectPlayer(
        p,
        prof,
        input.fixtures,
        input.targetGws,
        ratings,
        input.scoring,
        input.availability?.get(p.id),
      ),
    );
  }
  return out;
}
