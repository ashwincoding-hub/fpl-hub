import { FplError } from "@/lib/fpl/client";
import { getAppData } from "@/lib/server/data";

export async function GET() {
  try {
    const data = await getAppData();
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    const status = e instanceof FplError ? e.status : 502;
    const message = e instanceof FplError ? e.message : "Couldn't reach FPL";
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
