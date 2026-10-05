// Subset of the unofficial FPL API response shapes that FPL Hub uses.

export type PositionId = 1 | 2 | 3 | 4; // GKP, DEF, MID, FWD

export interface FplPriceProjection {
  offset: number;
  projected_percent: string;
  likelihood: number;
}

export interface FplElement {
  id: number;
  code: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  team_code: number;
  element_type: PositionId;
  now_cost: number;
  cost_change_start: number;
  cost_change_event: number;
  selected_by_percent: string;
  status: string; // a = available, d = doubtful, i = injured, s = suspended, u = unavailable, n = not in squad
  chance_of_playing_next_round: number | null;
  news: string;
  ep_next: string | null;
  form: string;
  total_points: number;
  minutes: number;
  transfers_in_event: number;
  transfers_out_event: number;
  // Price change fields published by FPL from 2026/27.
  price_change_percent?: string;
  price_change_hourly_rate?: number;
  price_change_projections?: FplPriceProjection[];
  price_change_locked_until?: string | null;
  price_change_calibrating?: boolean;
}

export interface FplTeam {
  id: number;
  code: number;
  name: string;
  short_name: string;
}

export interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
  is_previous: boolean;
}

export interface FplChipWindow {
  id: number;
  name: "wildcard" | "freehit" | "bboost" | "3xc" | string;
  number: number;
  start_event: number;
  stop_event: number;
  chip_type: string;
}

export interface FplScoring {
  long_play: number;
  short_play: number;
  goals_conceded: Record<string, number>;
  saves: number;
  goals_scored: Record<string, number>;
  assists: number;
  clean_sheets: Record<string, number>;
  yellow_cards: number;
  red_cards: number;
  bonus: number;
  defensive_contribution?: Record<string, number>;
}

export interface FplElementType {
  id: PositionId;
  singular_name_short: string;
  squad_select: number;
  squad_min_play: number;
  squad_max_play: number;
}

export interface FplBootstrap {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
  element_types: FplElementType[];
  chips: FplChipWindow[];
  total_players: number;
  game_settings: {
    squad_squadsize: number;
    squad_squadplay: number;
    squad_team_limit: number;
    squad_total_spend: number;
    max_extra_free_transfers: number;
    transfers_sell_on_fee: number;
  };
  game_config?: {
    settings?: { price_change_deadlines?: string[] };
    status?: { price_change_last_updated?: string };
    scoring?: FplScoring;
  };
}

export interface FplFixture {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean;
  started: boolean | null;
}

export interface FplEntry {
  id: number;
  name: string;
  player_first_name: string;
  player_last_name: string;
  started_event: number;
  current_event: number | null;
  summary_overall_points: number;
  summary_overall_rank: number | null;
  summary_event_points: number;
  last_deadline_bank: number;
  last_deadline_value: number;
}

export interface FplPick {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  element_type: PositionId;
}

export interface FplEntryHistoryRow {
  event: number;
  points: number;
  total_points: number;
  rank: number | null;
  overall_rank: number | null;
  bank: number;
  value: number;
  event_transfers: number;
  event_transfers_cost: number;
  points_on_bench: number;
}

export interface FplPicks {
  active_chip: string | null;
  entry_history: FplEntryHistoryRow;
  picks: FplPick[];
}

export interface FplHistory {
  current: FplEntryHistoryRow[];
  chips: { name: string; event: number; time: string }[];
}

export interface FplTransfer {
  element_in: number;
  element_in_cost: number;
  element_out: number;
  element_out_cost: number;
  event: number;
  time: string;
}

export interface FplElementSummaryHistory {
  element: number;
  fixture: number;
  opponent_team: number;
  total_points: number;
  was_home: boolean;
  kickoff_time: string;
  round: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  saves: number;
  bonus: number;
  yellow_cards: number;
  red_cards: number;
  starts: number;
  expected_goals: string;
  expected_assists: string;
  expected_goals_conceded: string;
  defensive_contribution?: number;
  value: number;
  transfers_balance: number;
}

export interface FplElementSummaryPast {
  season_name: string;
  element_code: number;
  minutes: number;
  total_points: number;
  goals_scored: number;
  assists: number;
  bonus: number;
  saves: number;
  yellow_cards: number;
  starts?: number;
  expected_goals?: string;
  expected_assists?: string;
  defensive_contribution?: number;
}

export interface FplElementSummary {
  history: FplElementSummaryHistory[];
  history_past: FplElementSummaryPast[];
}
