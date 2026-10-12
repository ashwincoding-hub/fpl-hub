import type { NextRequest } from "next/server";
import { getRage } from "@/lib/server/gw";
import { badRequest, cached, failure, parseId } from "@/lib/server/respond";

export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/team/[id]/rage">) {
  const id = parseId((await ctx.params).id);
  if (id === null) return badRequest("Team ID must be a number");
  try {
    // Only finished gameweeks count, so this changes at most once per gameweek.
    return cached(await getRage(id), 1800);
  } catch (e) {
    return failure(e, "No FPL team with that ID");
  }
}
