"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppData, AppPlayer, AppTeam } from "@/lib/app-types";

export function useJson<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data?: T; error?: string }>({ url: null });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then(async (r) => {
        const body = await r.json().catch(() => ({ error: `Request failed (${r.status})` }));
        if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status})`);
        return body as T;
      })
      .then((data) => !cancelled && setState({ url, data }))
      .catch((e: Error) => !cancelled && setState({ url, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  // Anything fetched for a previous URL counts as still loading.
  if (state.url !== url) return { loading: true } as { data?: T; error?: string; loading: boolean };
  return { data: state.data, error: state.error, loading: false };
}

export interface Lookups {
  players: Map<number, AppPlayer>;
  teams: Map<number, AppTeam>;
  opponents: (teamId: number, gw: number) => { opp: AppTeam; home: boolean; difficulty: number }[];
}

export function useLookups(data: AppData | undefined): Lookups | null {
  return useMemo(() => {
    if (!data) return null;
    const players = new Map(data.players.map((p) => [p.id, p]));
    const teams = new Map(data.teams.map((t) => [t.id, t]));
    const opponents = (teamId: number, gw: number) =>
      data.fixtures
        .filter((f) => f.gw === gw && (f.home === teamId || f.away === teamId))
        .map((f) => {
          const home = f.home === teamId;
          return {
            opp: teams.get(home ? f.away : f.home)!,
            home,
            difficulty: home ? f.homeDifficulty : f.awayDifficulty,
          };
        });
    return { players, teams, opponents };
  }, [data]);
}

export const money = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;
export const pts = (n: number) => n.toFixed(1);

export const FDR_CLASS: Record<number, string> = {
  1: "bg-emerald-700 text-white",
  2: "bg-emerald-400 text-emerald-950",
  3: "bg-zinc-300 text-zinc-900",
  4: "bg-rose-500 text-white",
  5: "bg-rose-800 text-white",
};
