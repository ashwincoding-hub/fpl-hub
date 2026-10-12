import { describe, expect, it } from "vitest";
import type { AppFixture, AppPlayer, AppTeam } from "./app-types";
import { buildSolioData, isSolioFeed, matchPlayer, normName, type SolioFeed } from "./solio";

const teams: AppTeam[] = [
  { id: 1, code: 3, name: "Arsenal", short: "ARS" },
  { id: 2, code: 43, name: "Man City", short: "MCI" },
  { id: 3, code: 6, name: "Spurs", short: "TOT" },
  { id: 4, code: 9, name: "Coventry City", short: "COV" },
];

const player = (id: number, name: string, fullName: string, team: number, xp: number): AppPlayer => ({
  id, name, fullName, team, pos: 3, price: 60, startPrice: 60, ownership: 1, status: "a", chance: null,
  news: "", form: 0, totalPoints: 0, xp: [xp, 0], pAppear: [1, 1], priceChange: null, netTransfersGw: 0,
});

const players = [
  player(10, "Haaland", "Erling Haaland", 2, 7.5),
  player(11, "Sávio", "Sávio Moreira de Oliveira", 3, 4.2),
  player(12, "Saka", "Bukayo Saka", 1, 4.9),
];

const fixtures: AppFixture[] = [
  { gw: 7, home: 2, away: 4, homeDifficulty: 2, awayDifficulty: 5, kickoff: "2026-10-17T14:00:00Z" },
  { gw: 7, home: 3, away: 1, homeDifficulty: 4, awayDifficulty: 3, kickoff: "2026-10-17T11:30:00Z" },
];

const feed: SolioFeed = {
  generatedAt: "2026-10-12T04:00:00Z",
  gameweek: 7,
  topProjected: [
    { name: "Saka", team: "ARS", position: "MID", price: 95, prPoints: 5.8 },
    { name: "Haaland", team: "MCI", position: "FWD", price: 156, prPoints: 7.8, opponents: [{ opponent: "COV", isHome: true }] },
    { name: "Savio", team: "TOT", position: "MID", price: 65, prPoints: 5.4 },
  ],
  bestCleanSheets: [{ team: "Man City", fixtures: [{ opponent: "COV", isHome: true }], prGoalsFor: 2.7, prGoalsAgainst: 0.8, csProb: 0.44 }],
};

describe("solio", () => {
  it("normalises names", () => {
    expect(normName("Sávio")).toBe("savio");
    expect(normName("B.Fernandes")).toBe("bfernandes");
  });

  it("validates the feed shape", () => {
    expect(isSolioFeed(feed)).toBe(true);
    expect(isSolioFeed({ gameweek: "7" })).toBe(false);
    expect(isSolioFeed(null)).toBe(false);
  });

  it("matches players by team and accent-insensitive name", () => {
    expect(matchPlayer(feed.topProjected[2], players, teams)?.id).toBe(11);
  });

  it("ranks players and joins our projection for the same gameweek", () => {
    const d = buildSolioData(feed, players, teams, [7, 8], fixtures, []);
    expect(d.players.map((p) => p.name)).toEqual(["Haaland", "Saka", "Savio"]);
    expect(d.players[0]).toMatchObject({ rank: 1, fplId: 10, ours: 7.5, opponents: "COV (H)" });
    expect(d.sameGwAsSite).toBe(true);
  });

  it("uses Solio's numbers, derives the opponent's side from them, and fills the rest with ours", () => {
    const ours = [
      { gw: 7, home: 2, away: 4, homeGoals: 2.1, awayGoals: 0.6, homeCs: 0.55, awayCs: 0.12 },
      { gw: 7, home: 3, away: 1, homeGoals: 1.2, awayGoals: 1.5, homeCs: 0.22, awayCs: 0.3 },
    ];
    const d = buildSolioData(feed, players, teams, [7, 8], fixtures, ours);
    expect(d.matches[0].home.team).toBe(3); // earlier kick-off first
    const city = d.matches[1].home;
    expect(city).toMatchObject({ source: "solio", goals: 2.7, cs: 0.44 });
    // Coventry's side comes from City's Solio entry: City concede 0.8, so Coventry score 0.8.
    expect(d.matches[1].away).toMatchObject({ source: "solio-derived", goals: 0.8 });
    expect(d.matches[1].away.cs).toBeCloseTo(Math.exp(-2.7));
    // Neither Spurs nor Arsenal is published, so that match is ours.
    expect(d.matches[0].home).toMatchObject({ source: "fpl-hub", goals: 1.2 });
  });

  it("leaves our column blank when Solio covers a different gameweek", () => {
    const d = buildSolioData({ ...feed, gameweek: 9 }, players, teams, [7, 8], fixtures, []);
    expect(d.players[0].ours).toBeNull();
    expect(d.sameGwAsSite).toBe(false);
  });
});
