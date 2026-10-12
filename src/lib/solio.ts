// Solio Analytics' free public feed (https://fpl.solioanalytics.com/api/data/latest.json) and the
// pure logic that joins it with FPL data. Solio asks to be credited as "Solio Analytics" with a link.

import type { AppFixture, AppPlayer, AppTeam } from "./app-types";
import type { FixtureOdds } from "./model/project";

export const SOLIO_FEED_URL = "https://fpl.solioanalytics.com/api/data/latest.json";
export const SOLIO_SITE_URL = "https://fpl.solioanalytics.com";

// ---- Raw feed (only the fields we use) -----------------------------------------------------------

interface SolioOpponent {
  opponent: string;
  isHome: boolean;
}

export interface SolioPlayerRaw {
  name: string;
  team: string; // short name, e.g. "MCI"
  position: string;
  price: number;
  opponents?: SolioOpponent[];
  ownership?: number;
  prPoints: number;
}

export interface SolioTeamRaw {
  team: string; // full name, e.g. "Man City"
  fixtures: SolioOpponent[];
  prGoalsFor: number;
  prGoalsAgainst: number;
  csProb: number;
}

export interface SolioFeed {
  generatedAt: string;
  gameweek: number;
  deadlineIso?: string;
  topProjected: SolioPlayerRaw[];
  bestCleanSheets?: SolioTeamRaw[];
  bestAttackingFixtures?: SolioTeamRaw[];
}

export function isSolioFeed(x: unknown): x is SolioFeed {
  const f = x as SolioFeed;
  return !!f && typeof f.gameweek === "number" && Array.isArray(f.topProjected);
}

// ---- Shapes sent to the browser ------------------------------------------------------------------

export interface SolioPlayerRow {
  rank: number;
  name: string;
  teamShort: string;
  position: string;
  price: number;
  ownership: number | null;
  opponents: string; // e.g. "IPS (H)"
  solio: number; // Solio projected points for the gameweek
  fplId: number | null; // matched FPL player, if found
  ours: number | null; // FPL Hub projection for the same gameweek
}

export interface MatchSide {
  team: number;
  goals: number; // expected goals scored
  cs: number; // clean-sheet probability
  // solio: published by Solio for this team; solio-derived: worked out from Solio's numbers for the
  // opponent; fpl-hub: neither team published, so FPL Hub's own model.
  source: "solio" | "solio-derived" | "fpl-hub" | null;
}

export interface SolioMatchRow {
  kickoff: string | null;
  home: MatchSide;
  away: MatchSide;
}

export interface SolioData {
  gameweek: number;
  generatedAt: string;
  deadline: string | null;
  sameGwAsSite: boolean;
  teams: AppTeam[];
  players: SolioPlayerRow[];
  matches: SolioMatchRow[];
}

// ---- Joining -------------------------------------------------------------------------------------

/** Lower-case, strip accents and punctuation: "Sávio" → "savio", "B.Fernandes" → "bfernandes". */
export const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** Find the FPL player for a Solio row: same team, then exact name, then a looser name match. */
export function matchPlayer(row: SolioPlayerRaw, players: AppPlayer[], teams: AppTeam[]): AppPlayer | null {
  const team = teams.find((t) => t.short === row.team);
  const pool = team ? players.filter((p) => p.team === team.id) : players;
  const n = normName(row.name);
  return (
    pool.find((p) => normName(p.name) === n) ??
    pool.find((p) => normName(p.fullName) === n) ??
    pool.find((p) => normName(p.fullName).includes(n) || n.includes(normName(p.name))) ??
    null
  );
}

export function buildSolioData(
  feed: SolioFeed,
  players: AppPlayer[],
  teams: AppTeam[],
  siteGws: number[], // gameweeks covered by AppPlayer.xp
  fixtures: AppFixture[],
  ourFixtures: FixtureOdds[],
): SolioData {
  const gwIndex = siteGws.indexOf(feed.gameweek);

  const playerRows: SolioPlayerRow[] = [...feed.topProjected]
    .sort((a, b) => b.prPoints - a.prPoints)
    .map((r, i) => {
      const match = matchPlayer(r, players, teams);
      return {
        rank: i + 1,
        name: r.name,
        teamShort: r.team,
        position: r.position,
        price: r.price,
        ownership: r.ownership ?? null,
        opponents: (r.opponents ?? []).map((o) => `${o.opponent} (${o.isHome ? "H" : "A"})`).join(", "),
        solio: r.prPoints,
        fplId: match?.id ?? null,
        ours: match && gwIndex >= 0 ? (match.xp[gwIndex] ?? null) : null,
      };
    });

  // Solio publishes team-level numbers only for its best clean-sheet and attacking teams.
  // Use them where they cover a single fixture, derive the opponent's side from them, and fill
  // matches where neither team is published from our model.
  const solioTeams = new Map<number, SolioTeamRaw>();
  for (const t of [...(feed.bestCleanSheets ?? []), ...(feed.bestAttackingFixtures ?? [])]) {
    const team = teams.find((x) => x.name === t.team || x.short === t.team);
    if (team && t.fixtures.length === 1) solioTeams.set(team.id, t);
  }
  const side = (team: number, opponent: number, ours: { goals: number; cs: number } | undefined): MatchSide => {
    const s = solioTeams.get(team);
    if (s) return { team, goals: s.prGoalsFor, cs: s.csProb, source: "solio" };
    // The opponent's Solio entry already says how many goals this team is expected to score
    // (its goals against) and how many this team concedes (its goals for → Poisson P(0)).
    const o = solioTeams.get(opponent);
    if (o) return { team, goals: o.prGoalsAgainst, cs: Math.exp(-o.prGoalsFor), source: "solio-derived" };
    if (ours) return { team, goals: ours.goals, cs: ours.cs, source: "fpl-hub" };
    return { team, goals: 0, cs: 0, source: null };
  };

  const matches: SolioMatchRow[] = fixtures
    .filter((f) => f.gw === feed.gameweek)
    .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""))
    .map((f) => {
      const o = ourFixtures.find((x) => x.gw === f.gw && x.home === f.home && x.away === f.away);
      return {
        kickoff: f.kickoff,
        home: side(f.home, f.away, o && { goals: o.homeGoals, cs: o.homeCs }),
        away: side(f.away, f.home, o && { goals: o.awayGoals, cs: o.awayCs }),
      };
    });

  return {
    gameweek: feed.gameweek,
    generatedAt: feed.generatedAt,
    deadline: feed.deadlineIso ?? null,
    sameGwAsSite: gwIndex === 0,
    teams,
    players: playerRows,
    matches,
  };
}
