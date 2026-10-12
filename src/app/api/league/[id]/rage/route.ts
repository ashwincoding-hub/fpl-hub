import type { NextRequest } from "next/server";
import { getLeagueRage } from "@/lib/server/gw";
import { badRequest, cached, failure, parseId } from "@/lib/server/respond";

export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/league/[id]/rage">) {
  const id = parseId((await ctx.params).id);
  if (id === null) return badRequest("League ID must be a number");
  try {
    // Up to 30 managers × several gameweeks of FPL calls: cache for an hour.
    return cached(await getLeagueRage(id, 30), 3600);
  } catch (e) {
    return failure(e, "No mini-league with that ID");
  }
}
