// Season rules in one place. Defaults are the 2026/27 rules; `rulesFromBootstrap` overrides them
// with whatever FPL publishes in bootstrap-static so a mid-season change is picked up automatically.

import type { FplBootstrap, PositionId } from "./fpl/types";

export interface Scoring {
  longPlay: number; // 60+ minutes
  shortPlay: number; // 1–59 minutes
  goal: Record<PositionId, number>;
  assist: number;
  cleanSheet: Record<PositionId, number>;
  goalsConcededPer2: Record<PositionId, number>; // points per 2 goals conceded (negative)
  savesPer3: number;
  yellow: number;
  red: number;
  defCon: Record<PositionId, number>; // points for reaching the defensive-contribution threshold
  defConThreshold: Record<PositionId, number>;
}

export interface Rules {
  season: string;
  squadSize: number;
  squadPlay: number;
  clubLimit: number;
  budget: number; // tenths of £m
  maxFreeTransfers: number;
  hitCost: number;
  sellOnFee: number;
  positions: Record<PositionId, { short: string; squad: number; minPlay: number; maxPlay: number }>;
  scoring: Scoring;
}

export const RULES_2026_27: Rules = {
  season: "2026-27",
  squadSize: 15,
  squadPlay: 11,
  clubLimit: 3,
  budget: 1000,
  maxFreeTransfers: 5,
  hitCost: 4,
  sellOnFee: 0.5,
  positions: {
    1: { short: "GKP", squad: 2, minPlay: 1, maxPlay: 1 },
    2: { short: "DEF", squad: 5, minPlay: 3, maxPlay: 5 },
    3: { short: "MID", squad: 5, minPlay: 2, maxPlay: 5 },
    4: { short: "FWD", squad: 3, minPlay: 1, maxPlay: 3 },
  },
  scoring: {
    longPlay: 2,
    shortPlay: 1,
    goal: { 1: 10, 2: 6, 3: 5, 4: 4 },
    assist: 3,
    cleanSheet: { 1: 4, 2: 4, 3: 1, 4: 0 },
    goalsConcededPer2: { 1: -1, 2: -1, 3: 0, 4: 0 },
    savesPer3: 1,
    yellow: -1,
    red: -3,
    defCon: { 1: 0, 2: 2, 3: 2, 4: 2 },
    // Not published in the API: 10 tackles/blocks/interceptions/clearances for DEF,
    // 12 (including recoveries) for MID/FWD.
    defConThreshold: { 1: 99, 2: 10, 3: 12, 4: 12 },
  },
};

const POS_KEY: Record<PositionId, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

function byPos(src: Record<string, number> | undefined, fallback: Record<PositionId, number>) {
  if (!src) return fallback;
  const out = { ...fallback };
  for (const p of [1, 2, 3, 4] as PositionId[]) {
    const v = src[POS_KEY[p]];
    if (typeof v === "number") out[p] = v;
  }
  return out;
}

export function rulesFromBootstrap(bs: FplBootstrap, base: Rules = RULES_2026_27): Rules {
  const gs = bs.game_settings;
  const sc = bs.game_config?.scoring;
  const positions = { ...base.positions };
  for (const et of bs.element_types ?? []) {
    positions[et.id] = {
      short: et.singular_name_short,
      squad: et.squad_select,
      minPlay: et.squad_min_play,
      maxPlay: et.squad_max_play,
    };
  }
  return {
    ...base,
    squadSize: gs?.squad_squadsize ?? base.squadSize,
    squadPlay: gs?.squad_squadplay ?? base.squadPlay,
    clubLimit: gs?.squad_team_limit ?? base.clubLimit,
    budget: gs?.squad_total_spend ?? base.budget,
    maxFreeTransfers: gs ? gs.max_extra_free_transfers + 1 : base.maxFreeTransfers,
    sellOnFee: gs?.transfers_sell_on_fee ?? base.sellOnFee,
    positions,
    scoring: sc
      ? {
          ...base.scoring,
          longPlay: sc.long_play,
          shortPlay: sc.short_play,
          goal: byPos(sc.goals_scored, base.scoring.goal),
          assist: sc.assists,
          cleanSheet: byPos(sc.clean_sheets, base.scoring.cleanSheet),
          goalsConcededPer2: byPos(sc.goals_conceded, base.scoring.goalsConcededPer2),
          savesPer3: sc.saves,
          yellow: sc.yellow_cards,
          red: sc.red_cards,
          defCon: byPos(sc.defensive_contribution, base.scoring.defCon),
        }
      : base.scoring,
  };
}
