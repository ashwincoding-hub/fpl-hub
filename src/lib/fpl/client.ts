// Typed wrapper around the unofficial FPL API.
// URLs are only ever built from the fixed templates below; callers pass validated integers,
// never raw path fragments, so this can't be used as an open proxy.

import type {
  FplBootstrap,
  FplElementSummary,
  FplEntry,
  FplFixture,
  FplHistory,
  FplPicks,
  FplTransfer,
} from "./types";

const BASE = "https://fantasy.premierleague.com/api";
const USER_AGENT = "fpl-hub/0.1 (personal non-commercial project)";
const TIMEOUT_MS = 15_000;

export class FplError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** A team ID must be a positive integer of at most 9 digits. */
export function parseTeamId(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

function assertId(n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 999_999_999) throw new FplError("Invalid id", 400);
  return n;
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) throw new FplError("Not found", 404);
  if (!res.ok) throw new FplError(`FPL returned ${res.status}`, 502);
  const text = await res.text();
  // During gameweek updates FPL serves an HTML/plain "The game is being updated." page.
  if (!text.startsWith("{") && !text.startsWith("[")) {
    throw new FplError("FPL is updating right now — try again in a few minutes", 503);
  }
  return JSON.parse(text) as T;
}

const noStore: RequestInit = { cache: "no-store" };

export const fpl = {
  bootstrap: () => get<FplBootstrap>("/bootstrap-static/", noStore),
  fixtures: () => get<FplFixture[]>("/fixtures/", noStore),
  entry: (id: number) => get<FplEntry>(`/entry/${assertId(id)}/`, noStore),
  picks: (id: number, gw: number) =>
    get<FplPicks>(`/entry/${assertId(id)}/event/${assertId(gw)}/picks/`, noStore),
  history: (id: number) => get<FplHistory>(`/entry/${assertId(id)}/history/`, noStore),
  transfers: (id: number) => get<FplTransfer[]>(`/entry/${assertId(id)}/transfers/`, noStore),
  elementSummary: (id: number) =>
    get<FplElementSummary>(`/element-summary/${assertId(id)}/`, noStore),
};
