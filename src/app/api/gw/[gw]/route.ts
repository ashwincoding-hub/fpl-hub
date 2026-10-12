import type { NextRequest } from "next/server";
import { getGwView } from "@/lib/server/gw";
import { badRequest, cached, failure, parseGw } from "@/lib/server/respond";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/gw/[gw]">) {
  const gw = parseGw((await ctx.params).gw);
  if (gw === null) return badRequest("Gameweek must be 1–38");
  try {
    const view = await getGwView(gw);
    const live = view.matches.some((m) => m.status === "live");
    return cached(view, view.finished ? 3600 : live ? 60 : 300);
  } catch (e) {
    return failure(e, "No such gameweek");
  }
}
