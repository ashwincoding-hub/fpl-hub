import "server-only";

import { FplError, parseTeamId } from "../fpl/client";

/** Gameweeks are 1–38. */
export function parseGw(raw: string): number | null {
  if (!/^\d{1,2}$/.test(raw)) return null;
  const gw = Number(raw);
  return gw >= 1 && gw <= 38 ? gw : null;
}

export const parseId = parseTeamId;

export const badRequest = (message: string) => Response.json({ error: message }, { status: 400 });

/** JSON with CDN caching: long for data that can no longer change, short otherwise. */
export function cached(data: unknown, seconds: number) {
  return Response.json(data, {
    headers: { "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}` },
  });
}

export function failure(e: unknown, notFound = "Not found") {
  const status = e instanceof FplError ? e.status : 502;
  const message = e instanceof FplError ? (status === 404 ? notFound : e.message) : "Couldn't reach FPL";
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
