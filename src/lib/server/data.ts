import "server-only";

import projectionsFile from "@/data/projections.json";
import type { AppData, AppPlayer, TeamData } from "../app-types";
import { fpl, FplError } from "../fpl/client";
import type { FplBootstrap } from "../fpl/types";
import type { ProjectionsFile } from "../projections";
import { rulesFromBootstrap } from "../rules";
import { availableChips, estimateFreeTransfers, purchasePrices, sellingPrice } from "../team";

const projections = projectionsFile as ProjectionsFile;
const HORIZON = 6;

// Small in-memory cache per server instance, on top of the CDN cache set by the routes.
let bootstrapCache: { at: number; data: FplBootstrap } | null = null;
let appDataCache: { at: number; data: AppData } | null = null;
const BOOTSTRAP_TTL = 5 * 60_000;

async function bootstrap(): Promise<FplBootstrap> {
  if (bootstrapCache && Date.now() - bootstrapCache.at < BOOTSTRAP_TTL) return bootstrapCache.data;
  const data = await fpl.bootstrap();
  bootstrapCache = { at: Date.now(), data };
  return data;
}

export async function getAppData(): Promise<AppData> {
  if (appDataCache && Date.now() - appDataCache.at < BOOTSTRAP_TTL) return appDataCache.data;
  const [bs, fixtures] = await Promise.all([bootstrap(), fpl.fixtures()]);
  const next = bs.events.find((e) => e.is_next);
  if (!next) throw new FplError("The season is over — no upcoming gameweek", 503);
  const lastGw = Math.max(...bs.events.map((e) => e.id));
  const gws = Array.from({ length: HORIZON }, (_, i) => next.id + i).filter((g) => g <= lastGw);

  // Use our model when its file covers the upcoming gameweek; otherwise fall back to FPL's ep_next.
  const offset = projections.gws.indexOf(next.id);
  const useModel = offset >= 0;

  const players: AppPlayer[] = bs.elements.map((e) => {
    const p = projections.players[e.id];
    const xp = gws.map((_, i) => (useModel && p ? (p.xp[offset + i] ?? 0) : i === 0 ? Number(e.ep_next ?? 0) : 0));
    const pAppear = gws.map((_, i) => (useModel && p ? (p.pAppear[offset + i] ?? 0) : 1));
    return {
      id: e.id,
      name: e.web_name,
      fullName: `${e.first_name} ${e.second_name}`,
      team: e.team,
      pos: e.element_type,
      price: e.now_cost,
      startPrice: e.now_cost - e.cost_change_start,
      ownership: Number(e.selected_by_percent),
      status: e.status,
      chance: e.chance_of_playing_next_round,
      news: e.news,
      form: Number(e.form),
      totalPoints: e.total_points,
      xp,
      pAppear,
      priceChange:
        e.price_change_percent !== undefined
          ? {
              percent: Number(e.price_change_percent),
              hourlyRate: e.price_change_hourly_rate ?? 0,
              projected: (e.price_change_projections ?? []).map((x) => Number(x.projected_percent)),
              likelihood: (e.price_change_projections ?? []).map((x) => x.likelihood),
              lockedUntil: e.price_change_locked_until ?? null,
              calibrating: e.price_change_calibrating ?? false,
            }
          : null,
      netTransfersGw: e.transfers_in_event - e.transfers_out_event,
    };
  });

  const data: AppData = {
    fetchedAt: new Date().toISOString(),
    nextGw: next.id,
    nextDeadline: next.deadline_time,
    gws,
    projections: useModel
      ? { source: "model", generatedAt: projections.generatedAt, modelVersion: projections.modelVersion }
      : { source: "fpl", generatedAt: null, modelVersion: null },
    priceDeadlines: bs.game_config?.settings?.price_change_deadlines ?? [],
    priceUpdatedAt: bs.game_config?.status?.price_change_last_updated ?? null,
    totalManagers: bs.total_players,
    rules: rulesFromBootstrap(bs),
    chips: bs.chips,
    teams: bs.teams.map((t) => ({ id: t.id, code: t.code, name: t.name, short: t.short_name })),
    players,
    fixtures: fixtures
      .filter((f) => f.event !== null && gws.includes(f.event))
      .map((f) => ({
        gw: f.event as number,
        home: f.team_h,
        away: f.team_a,
        homeDifficulty: f.team_h_difficulty,
        awayDifficulty: f.team_a_difficulty,
        kickoff: f.kickoff_time,
      })),
  };
  appDataCache = { at: Date.now(), data };
  return data;
}

export async function getTeamData(teamId: number): Promise<TeamData> {
  const [bs, entry, history, transfers] = await Promise.all([
    bootstrap(),
    fpl.entry(teamId),
    fpl.history(teamId),
    fpl.transfers(teamId),
  ]);
  const lastGw = entry.current_event;
  if (!lastGw) throw new FplError("This team hasn't played a gameweek yet", 404);

  let picks = await fpl.picks(teamId, lastGw);
  let basedOnGw = lastGw;
  let bank = picks.entry_history.bank;
  const freeHitReverted = picks.active_chip === "freehit" && lastGw > 1;
  if (freeHitReverted) {
    // A Free Hit squad only lasts one week; the next gameweek starts from the week before.
    basedOnGw = lastGw - 1;
    picks = await fpl.picks(teamId, basedOnGw);
    bank = picks.entry_history.bank;
  }

  const byId = new Map(bs.elements.map((e) => [e.id, e]));
  const freeHitEvents = new Set(history.chips.filter((c) => c.name === "freehit").map((c) => c.event));
  const squadIds = picks.picks.map((p) => p.element);
  const purchase = purchasePrices(squadIds, transfers, freeHitEvents, (id) => {
    const e = byId.get(id);
    return e ? e.now_cost - e.cost_change_start : 0;
  });
  const rules = rulesFromBootstrap(bs);
  const nextGw = bs.events.find((e) => e.is_next)?.id ?? lastGw + 1;

  return {
    fetchedAt: new Date().toISOString(),
    entry: {
      id: entry.id,
      name: entry.name,
      manager: `${entry.player_first_name} ${entry.player_last_name}`,
      overallPoints: entry.summary_overall_points,
      overallRank: entry.summary_overall_rank,
      gwPoints: entry.summary_event_points,
    },
    basedOnGw,
    freeHitReverted,
    squad: picks.picks.map((p) => {
      const now = byId.get(p.element)?.now_cost ?? 0;
      const bought = purchase.get(p.element) ?? now;
      return {
        id: p.element,
        slot: p.position,
        isCaptain: p.is_captain,
        isVice: p.is_vice_captain,
        purchasePrice: bought,
        sellPrice: sellingPrice(bought, now),
      };
    }),
    bank,
    freeTransfers: estimateFreeTransfers(history, entry.started_event, lastGw, rules.maxFreeTransfers),
    chipsUsed: history.chips.map((c) => ({ name: c.name, event: c.event })),
    chipsAvailable: availableChips(bs.chips, history.chips, nextGw),
  };
}
