import "server-only";

import projectionsFile from "@/data/projections.json";
import type { ProjectionsFile } from "../projections";
import { buildSolioData, isSolioFeed, SOLIO_FEED_URL, type SolioData, type SolioFeed } from "../solio";
import { getAppData } from "./data";

const projections = projectionsFile as ProjectionsFile;
const TTL = 30 * 60_000; // Solio refreshes every 4 hours; check twice an hour
let feedCache: { at: number; feed: SolioFeed } | null = null;

export class SolioError extends Error {}

async function solioFeed(): Promise<SolioFeed> {
  if (feedCache && Date.now() - feedCache.at < TTL) return feedCache.feed;
  // Fixed URL only — this is Solio's public feed, which their robots.txt explicitly allows.
  const res = await fetch(SOLIO_FEED_URL, {
    cache: "no-store",
    headers: { "User-Agent": "fpl-hub/0.1 (personal non-commercial project)", Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new SolioError(`Solio returned ${res.status}`);
  const json: unknown = await res.json().catch(() => null);
  if (!isSolioFeed(json)) throw new SolioError("Solio's feed changed format");
  feedCache = { at: Date.now(), feed: json };
  return json;
}

export async function getSolioData(): Promise<SolioData> {
  const [feed, app] = await Promise.all([solioFeed(), getAppData()]);
  return buildSolioData(feed, app.players, app.teams, app.gws, app.fixtures, projections.fixtures ?? []);
}
