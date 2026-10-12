import type { NextRequest } from "next/server";
import { getTeamGw } from "@/lib/server/gw";
import { badRequest, cached, failure, parseGw, parseId } from "@/lib/server/respond";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/team/[id]/gw/[gw]">) {
  const { id: rawId, gw: rawGw } = await ctx.params;
  const id = parseId(rawId);
  const gw = parseGw(rawGw);
  if (id === null || gw === null) return badRequest("Invalid team ID or gameweek");
  try {
    return cached(await getTeamGw(id, gw), 120);
  } catch (e) {
    return failure(e, "This team didn't play that gameweek");
  }
}
