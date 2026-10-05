// Loader for the current season from the live FPL API (cached on disk).

import type {
  FplBootstrap,
  FplElementSummary,
  FplFixture,
  PositionId,
} from "../../src/lib/fpl/types";
import type {
  FixtureLite,
  MatchRow,
  PlayerInfo,
  PlayerPrior,
} from "../../src/lib/model/types";
import { cachedJson, throttledMap } from "./cache";

const BASE = "https://fantasy.premierleague.com/api";

export interface LiveSeason {
  bootstrap: FplBootstrap;
  fixtures: FplFixture[];
  fixturesLite: FixtureLite[];
  rows: MatchRow[];
  players: PlayerInfo[];
}

function priorFromPast(summary: FplElementSummary): PlayerPrior | undefined {
  const last = summary.history_past.at(-1);
  if (!last || last.minutes <= 0) return undefined;
  const per90 = (v: number | string | undefined) => (Number(v ?? 0) * 90) / last.minutes;
  return {
    minutes: last.minutes,
    starts: last.starts,
    xg90: per90(last.expected_goals),
    xa90: per90(last.expected_assists),
    bonus90: per90(last.bonus),
    saves90: per90(last.saves),
    yc90: per90(last.yellow_cards),
    dc90: last.defensive_contribution === undefined ? null : per90(last.defensive_contribution),
  };
}

export async function loadLiveSeason({ ttlHours = 6 } = {}): Promise<LiveSeason> {
  const bootstrap = await cachedJson<FplBootstrap>(`${BASE}/bootstrap-static/`, "fpl/bootstrap.json", Math.min(ttlHours, 1));
  const fixtures = await cachedJson<FplFixture[]>(`${BASE}/fixtures/`, "fpl/fixtures.json", Math.min(ttlHours, 1));
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

  console.log(`Fetching ${bootstrap.elements.length} player histories (cached ${ttlHours}h)…`);
  const summaries = await throttledMap(
    bootstrap.elements,
    (e) =>
      cachedJson<FplElementSummary>(
        `${BASE}/element-summary/${e.id}/`,
        `fpl/element-summary/${e.id}.json`,
        ttlHours,
      ),
    { label: "players" },
  );

  const rows: MatchRow[] = [];
  const players: PlayerInfo[] = [];
  bootstrap.elements.forEach((e, i) => {
    const s = summaries[i];
    players.push({ id: e.id, team: e.team, pos: e.element_type as PositionId, prior: priorFromPast(s) });
    for (const h of s.history) {
      const fx = fixtureById.get(h.fixture);
      // The player's team for that fixture (handles mid-season transfers).
      const team = fx ? (h.was_home ? fx.team_h : fx.team_a) : e.team;
      rows.push({
        player: e.id,
        team,
        pos: e.element_type as PositionId,
        gw: h.round,
        fixture: h.fixture,
        opp: h.opponent_team,
        home: h.was_home,
        minutes: h.minutes,
        started: h.starts > 0,
        xg: Number(h.expected_goals),
        xa: Number(h.expected_assists),
        goals: h.goals_scored,
        assists: h.assists,
        bonus: h.bonus,
        saves: h.saves,
        yc: h.yellow_cards,
        dc: h.defensive_contribution ?? null,
        points: h.total_points,
      });
    }
  });

  const fixturesLite: FixtureLite[] = fixtures
    .filter((f) => f.event !== null)
    .map((f) => ({ gw: f.event as number, home: f.team_h, away: f.team_a }));

  return { bootstrap, fixtures, fixturesLite, rows, players };
}
