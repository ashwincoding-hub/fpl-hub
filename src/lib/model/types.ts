import type { PositionId } from "../fpl/types";

/** One player's appearance record for one fixture (the same shape for live FPL data and past seasons). */
export interface MatchRow {
  player: number;
  team: number;
  pos: PositionId;
  gw: number;
  fixture: number;
  opp: number;
  home: boolean;
  minutes: number;
  started: boolean;
  xg: number;
  xa: number;
  goals: number;
  assists: number;
  bonus: number;
  saves: number;
  yc: number;
  dc: number | null; // defensive contribution count; null when the season didn't track it
  points: number;
}

/** Per-90 rates from the player's previous season, used to stabilise small samples. */
export interface PlayerPrior {
  minutes: number;
  starts?: number;
  xg90: number;
  xa90: number;
  bonus90: number;
  saves90: number;
  yc90: number;
  dc90: number | null;
}

export interface PlayerInfo {
  id: number;
  team: number;
  pos: PositionId;
  prior?: PlayerPrior;
}

/** Relative team strength, 1 = league average. Higher att = scores more; higher def = concedes more. */
export interface TeamRating {
  att: number;
  def: number;
}

export interface FixtureLite {
  gw: number;
  home: number;
  away: number;
}

export interface Availability {
  status: string;
  chance: number | null;
}

export interface Breakdown {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  conceded: number;
  saves: number;
  defCon: number;
  bonus: number;
  cards: number;
}

export interface GwProjection {
  gw: number;
  xp: number;
  pAppear: number;
  p60: number;
  fixtures: number;
  breakdown: Breakdown;
}
