// Loader for past-season data from the open-source vaastav/Fantasy-Premier-League dataset (MIT).
// https://github.com/vaastav/Fantasy-Premier-League — data originally from the official FPL API.
// Files are downloaded into the git-ignored .cache/ folder and never committed.

import type { PositionId } from "../../src/lib/fpl/types";
import type { FixtureLite, MatchRow, PlayerPrior, TeamRating } from "../../src/lib/model/types";
import { cachedText, parseCsv } from "./cache";

const RAW = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data";
const POS: Record<string, PositionId> = { GK: 1, GKP: 1, DEF: 2, MID: 3, FWD: 4 };

const num = (s: string | undefined) => (s === undefined || s === "" ? 0 : Number(s));

export interface SeasonData {
  season: string;
  rows: MatchRow[];
  teams: { id: number; name: string }[];
  fixtures: FixtureLite[];
  fplXp: Map<string, number>; // `${player}:${gw}` → FPL's own expected points for that GW
  codeById: Map<number, number>;
  names: Map<number, string>;
}

async function csv(season: string, file: string) {
  const text = await cachedText(`${RAW}/${season}/${file}`, `vaastav/${season}/${file}`, 24 * 30);
  return parseCsv(text);
}

export async function loadSeason(season: string): Promise<SeasonData> {
  const [gws, teamsCsv, playersRaw] = await Promise.all([
    csv(season, "gws/merged_gw.csv"),
    csv(season, "teams.csv"),
    csv(season, "players_raw.csv"),
  ]);
  const teams = teamsCsv.map((t) => ({ id: num(t.id), name: t.name }));
  const teamId = new Map(teams.map((t) => [t.name, t.id]));
  const codeById = new Map(playersRaw.map((p) => [num(p.id), num(p.code)]));

  const rows: MatchRow[] = [];
  const fplXp = new Map<string, number>();
  const fixtures = new Map<number, FixtureLite>();
  const names = new Map<number, string>();
  for (const g of gws) {
    names.set(num(g.element), g.name);
    const team = teamId.get(g.team);
    const pos = POS[g.position];
    if (!team || !pos) continue; // e.g. assistant-manager rows in 2024/25
    const gw = num(g.round || g.GW);
    const home = g.was_home === "True";
    const row: MatchRow = {
      player: num(g.element),
      team,
      pos,
      gw,
      fixture: num(g.fixture),
      opp: num(g.opponent_team),
      home,
      minutes: num(g.minutes),
      started: num(g.starts) > 0,
      xg: num(g.expected_goals),
      xa: num(g.expected_assists),
      goals: num(g.goals_scored),
      assists: num(g.assists),
      bonus: num(g.bonus),
      saves: num(g.saves),
      yc: num(g.yellow_cards),
      dc: g.defensive_contribution === undefined || g.defensive_contribution === "" ? null : num(g.defensive_contribution),
      points: num(g.total_points),
    };
    rows.push(row);
    const key = `${row.player}:${gw}`;
    fplXp.set(key, (fplXp.get(key) ?? 0) + num(g.xP));
    if (!fixtures.has(row.fixture)) {
      fixtures.set(row.fixture, {
        gw,
        home: home ? team : row.opp,
        away: home ? row.opp : team,
      });
    }
  }
  return { season, rows, teams, fixtures: [...fixtures.values()], fplXp, codeById, names };
}

/** Last season's per-90 rates, keyed by the player's permanent `code`. */
export async function playerPriorsByCode(season: string): Promise<Map<number, PlayerPrior>> {
  const raw = await csv(season, "players_raw.csv");
  const out = new Map<number, PlayerPrior>();
  for (const p of raw) {
    const minutes = num(p.minutes);
    if (minutes <= 0) continue;
    const per90 = (v: string | undefined) => (num(v) * 90) / minutes;
    out.set(num(p.code), {
      minutes,
      starts: num(p.starts),
      xg90: per90(p.expected_goals),
      xa90: per90(p.expected_assists),
      bonus90: per90(p.bonus),
      saves90: per90(p.saves),
      yc90: per90(p.yellow_cards),
      dc90: p.defensive_contribution === undefined ? null : per90(p.defensive_contribution),
    });
  }
  return out;
}

/**
 * Team strength from a full past season, keyed by team name (names are stable across seasons).
 * Promoted teams have no entry; callers should fall back to a "promoted" prior.
 */
export async function teamPriorsByName(season: string): Promise<Map<string, TeamRating>> {
  const data = await loadSeason(season);
  const nameById = new Map(data.teams.map((t) => [t.id, t.name]));
  const perFixture = new Map<string, { team: number; opp: number; xg: number }>();
  for (const r of data.rows) {
    const key = `${r.fixture}:${r.team}`;
    const cur = perFixture.get(key) ?? { team: r.team, opp: r.opp, xg: 0 };
    cur.xg += r.xg;
    perFixture.set(key, cur);
  }
  const matches = [...perFixture.values()];
  const avg = matches.reduce((s, m) => s + m.xg, 0) / Math.max(1, matches.length);
  const acc = new Map<number, { n: number; f: number; a: number }>();
  for (const m of matches) {
    const t = acc.get(m.team) ?? { n: 0, f: 0, a: 0 };
    t.n++;
    t.f += m.xg;
    acc.set(m.team, t);
    const o = acc.get(m.opp) ?? { n: 0, f: 0, a: 0 };
    o.a += m.xg;
    acc.set(m.opp, o);
  }
  const out = new Map<string, TeamRating>();
  for (const [id, t] of acc) {
    const name = nameById.get(id);
    if (!name || t.n === 0) continue;
    // Regress a full season 25% toward average: squads change over the summer.
    out.set(name, {
      att: 0.75 * (t.f / t.n / avg) + 0.25,
      def: 0.75 * (t.a / t.n / avg) + 0.25,
    });
  }
  return out;
}

export const PROMOTED_PRIOR: TeamRating = { att: 0.8, def: 1.2 };
