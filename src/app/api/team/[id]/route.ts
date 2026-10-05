import type { NextRequest } from "next/server";
import { FplError, parseTeamId } from "@/lib/fpl/client";
import { getTeamData } from "@/lib/server/data";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/team/[id]">) {
  const { id: raw } = await ctx.params;
  const id = parseTeamId(raw);
  if (id === null) {
    // Rejected before any outbound request.
    return Response.json({ error: "Team ID must be a number" }, { status: 400 });
  }
  try {
    const data = await getTeamData(id);
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    const status = e instanceof FplError ? e.status : 502;
    const message =
      e instanceof FplError
        ? status === 404
          ? "No FPL team with that ID"
          : e.message
        : "Couldn't reach FPL";
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
