"use client";

import type { AppData } from "@/lib/app-types";
import { useJson, useLookups } from "./hooks";
import { PricesTable } from "./PricesTable";

export function PricesView() {
  const app = useJson<AppData>("/api/data");
  const lookups = useLookups(app.data);
  if (app.error) return <p className="text-fall">{app.error}</p>;
  if (!app.data || !lookups) return <p className="py-20 text-center text-muted">Loading…</p>;
  return <PricesTable data={app.data} lookups={lookups} />;
}
