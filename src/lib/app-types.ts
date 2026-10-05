// Shapes sent from our API routes to the browser.

import type { FplChipWindow, PositionId } from "./fpl/types";
import type { Rules } from "./rules";

export interface AppPlayer {
  id: number;
  name: string;
  fullName: string;
  team: number;
  pos: PositionId;
  price: number; // tenths of £m
  startPrice: number;
  ownership: number; // %
  status: string;
  chance: number | null;
  news: string;
  form: number;
  totalPoints: number;
  xp: number[]; // one per AppData.gws
  pAppear: number[];
  priceChange: {
    percent: number; // progress toward a change: +100 = rise, −100 = fall
    hourlyRate: number; // net transfers per hour, as published by FPL
    projected: number[]; // projected percent at each upcoming price-change deadline
    likelihood: number[];
    lockedUntil: string | null;
    calibrating: boolean;
  } | null;
  netTransfersGw: number;
}

export interface AppTeam {
  id: number;
  code: number;
  name: string;
  short: string;
}

export interface AppFixture {
  gw: number;
  home: number;
  away: number;
  homeDifficulty: number;
  awayDifficulty: number;
  kickoff: string | null;
}

export interface AppData {
  fetchedAt: string;
  nextGw: number;
  nextDeadline: string;
  gws: number[];
  projections: { source: "model" | "fpl"; generatedAt: string | null; modelVersion: string | null };
  priceDeadlines: string[];
  priceUpdatedAt: string | null;
  totalManagers: number;
  rules: Rules;
  chips: FplChipWindow[];
  teams: AppTeam[];
  players: AppPlayer[];
  fixtures: AppFixture[];
}

export interface SquadPick {
  id: number;
  slot: number; // 1–11 starting, 12–15 bench (FPL order)
  isCaptain: boolean;
  isVice: boolean;
  purchasePrice: number;
  sellPrice: number;
}

export interface TeamData {
  fetchedAt: string;
  entry: {
    id: number;
    name: string;
    manager: string;
    overallPoints: number;
    overallRank: number | null;
    gwPoints: number;
  };
  basedOnGw: number;
  freeHitReverted: boolean;
  squad: SquadPick[];
  bank: number;
  freeTransfers: number;
  chipsUsed: { name: string; event: number }[];
  chipsAvailable: string[];
}
