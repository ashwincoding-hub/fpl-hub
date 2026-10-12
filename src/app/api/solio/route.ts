import { FplError } from "@/lib/fpl/client";
import { getSolioData, SolioError } from "@/lib/server/solio";

export async function GET() {
  try {
    const data = await getSolioData();
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (e) {
    const message =
      e instanceof SolioError || e instanceof FplError ? e.message : "Couldn't load Solio's data";
    return Response.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
