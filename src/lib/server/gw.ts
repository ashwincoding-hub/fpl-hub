import "server-only";

import { fpl, FplError } from "../fpl/client";
import type { FplPicks, PositionId } from "../fpl/types";
import type { GwMatch, GwView, LeagueRageRow, RageResult, TeamGwView } from "../app-types";
import { rageLevel, rageSeason, type PlayerGw, type RageGwInput } from "../rage";
import { bootstrap } from "./data";

// Finished gameweeks never change, so their live points and each manager's picks are cached for
// the life of the server instance. The live/current gameweek is re-fetched after a minute.
const LIVE_TTL = 60_000;
const liveCache = new Map<number, { at: number; finished: boolean; data: Map<number, PlayerGw> }>();
const picksCache = new Map<string, FplPicks>();

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function finishedGws() {
  const bs = await bootstrap();
  return { bs, finished: new Set(bs.events.filter((e) => e.finished).map((e) => e.id)) };
}

export async function livePoints(gw: number): Promise<Map<number, PlayerGw>> {
  const { finished } = await finishedGws();
  const hit = liveCache.get(gw);
  if (hit && (hit.finished || Date.now() - hit.at < LIVE_TTL)) return hit.data;
  const live = await fpl.live(gw);
  const data = new Map(live.elements.map((e) => [e.id, { pts: e.stats.total_points, mins: e.stats.minutes }]));
  liveCache.set(gw, { at: Date.now(), finished: finished.has(gw), data });
  return data;
}

export async function picksFor(teamId: number, gw: number, gwFinished: boolean): Promise<FplPicks> {
  const key = `${teamId}:${gw}`;
  const hit = picksCache.get(key);
  if (hit) return hit;
  const picks = await fpl.picks(teamId, gw);
  if (gwFinished) picksCache.set(key, picks);
  return picks;
}

// ---- Gameweek scores --------------------------------------------------------------------------

export async function getGwView(gw: number): Promise<GwView> {
  const { bs, finished } = await finishedGws();
  const event = bs.events.find((e) => e.id === gw);
  if (!event) throw new FplError("No such gameweek", 404);
  const [fixtures, live] = await Promise.all([fpl.fixtures(), event.deadline_time < new Date().toISOString() ? livePoints(gw) : Promise.resolve(new Map<number, PlayerGw>())]);
  const matches: GwMatch[] = fixtures
    .filter((f) => f.event === gw)
    .sort((a, b) => (a.kickoff_time ?? "").localeCompare(b.kickoff_time ?? ""))
    .map((f) => {
      const stat = (id: string) => f.stats?.find((s) => s.identifier === id);
      const side = (list: { value: number; element: number }[] | undefined, team: number) =>
        (list ?? []).map((x) => ({ player: x.element, team, count: x.value }));
      const goals = stat("goals_scored");
      const own = stat("own_goals");
      const assists = stat("assists");
      return {
        id: f.id,
        kickoff: f.kickoff_time,
        home: f.team_h,
        away: f.team_a,
        homeScore: f.team_h_score,
        awayScore: f.team_a_score,
        status: f.finished || f.finished_provisional ? "finished" : f.started ? "live" : "upcoming",
        minutes: f.minutes ?? 0,
        goals: [
          ...side(goals?.h, f.team_h).map((g) => ({ ...g, own: false })),
          ...side(goals?.a, f.team_a).map((g) => ({ ...g, own: false })),
          // An own goal by an away player counts for the home side, and vice versa.
          ...side(own?.a, f.team_h).map((g) => ({ ...g, own: true })),
          ...side(own?.h, f.team_a).map((g) => ({ ...g, own: true })),
        ],
        assists: [...side(assists?.h, f.team_h), ...side(assists?.a, f.team_a)],
      };
    });
  const points: Record<number, [number, number]> = {};
  for (const [id, p] of live) if (p.mins > 0 || p.pts !== 0) points[id] = [p.pts, p.mins];
  return { gw, name: event.name, finished: finished.has(gw), matches, points };
}

export async function getTeamGw(teamId: number, gw: number): Promise<TeamGwView> {
  const { finished } = await finishedGws();
  const p = await picksFor(teamId, gw, finished.has(gw));
  return {
    gw,
    chip: p.active_chip,
    points: p.entry_history.points,
    hitCost: p.entry_history.event_transfers_cost,
    benchPoints: p.entry_history.points_on_bench,
    picks: p.picks.map((x) => ({
      id: x.element,
      position: x.position,
      multiplier: x.multiplier,
      captain: x.is_captain,
      vice: x.is_vice_captain,
    })),
    autoSubs: (p.automatic_subs ?? []).map((s) => ({ in: s.element_in, out: s.element_out })),
  };
}

// ---- Rage meter ---------------------------------------------------------------------------------

export async function getRage(teamId: number): Promise<RageResult> {
  const { bs, finished } = await finishedGws();
  const [history, transfers] = await Promise.all([fpl.history(teamId), fpl.transfers(teamId)]);
  const played = history.current.map((h) => h.event).filter((gw) => finished.has(gw));
  const pos = new Map(bs.elements.map((e) => [e.id, e.element_type as PositionId]));
  const names = new Map(bs.elements.map((e) => [e.id, e.web_name]));
  const average = new Map(bs.events.map((e) => [e.id, e.average_entry_score ?? null]));

  const picks = await mapLimit(played, 3, (gw) => picksFor(teamId, gw, true));
  const lives = await mapLimit(played, 3, (gw) => livePoints(gw));
  const byGw = new Map(played.map((gw, i) => [gw, picks[i]]));
  const rankByGw = new Map(history.current.map((h) => [h.event, h.overall_rank]));

  const inputs: RageGwInput[] = played.map((gw, i) => ({
    gw,
    picks: picks[i],
    prevPicks: byGw.get(gw - 1) ?? null,
    live: lives[i],
    pos,
    names,
    transfers: transfers.filter((t) => t.event === gw),
    average: average.get(gw) ?? null,
    prevOverallRank: rankByGw.get(gw - 1) ?? null,
  }));
  const gws = rageSeason(inputs);
  const meter = gws.at(-1)?.meter ?? 15;
  const level = rageLevel(meter);
  return { teamId, meter, level: { emoji: level.emoji, label: level.label }, gws };
}

export async function getLeagueRage(leagueId: number, limit = 30) {
  const standings = await fpl.leagueStandings(leagueId);
  const managers = standings.standings.results.slice(0, limit);
  const rows = await mapLimit(managers, 4, async (m): Promise<LeagueRageRow> => {
    try {
      const r = await getRage(m.entry);
      const last = r.gws.at(-1);
      const worst = last?.items.find((i) => i.delta > 0);
      return {
        entry: m.entry,
        teamName: m.entry_name,
        manager: m.player_name,
        rank: m.rank,
        meter: r.meter,
        level: r.level,
        lastChange: last ? Math.round((last.meter - last.before) * 10) / 10 : null,
        worst: worst ? `${worst.label}: ${worst.detail}` : null,
      };
    } catch {
      return { entry: m.entry, teamName: m.entry_name, manager: m.player_name, rank: m.rank, meter: null, level: null, lastChange: null, worst: null };
    }
  });
  rows.sort((a, b) => (b.meter ?? -1) - (a.meter ?? -1));
  return { id: standings.league.id, name: standings.league.name, hasMore: managers.length < standings.standings.results.length || standings.standings.has_next, rows };
}
