"use client";

import { useSyncExternalStore } from "react";
import type { AppPlayer } from "@/lib/app-types";
import { priceSignal } from "@/lib/prices";
import { useStore } from "./store";

const subscribe = () => () => {};
export const useMounted = () => useSyncExternalStore(subscribe, () => true, () => false);

export function StarButton({ id }: { id: number }) {
  const mounted = useMounted();
  const on = useStore((s) => s.shortlist.includes(id));
  const toggle = useStore((s) => s.toggleShortlist);
  const active = mounted && on;
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? "Remove from shortlist" : "Add to shortlist"}
      title={active ? "Remove from shortlist" : "Add to shortlist"}
      onClick={(e) => {
        e.stopPropagation();
        toggle(id);
      }}
      className={`text-lg leading-none ${active ? "text-amber-400" : "text-muted/60 hover:text-amber-400"}`}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

/** Small ▲/▼ marker when a player is close to a price change. */
export function PriceBadge({ p }: { p: AppPlayer }) {
  const threshold = useStore((s) => s.alertThreshold);
  const sig = priceSignal(p, threshold);
  if (!sig) return null;
  return (
    <span
      title={`${p.priceChange!.percent.toFixed(1)}% toward a price ${sig}`}
      className={sig === "rise" ? "text-rise" : "text-fall"}
    >
      {sig === "rise" ? "▲" : "▼"}
    </span>
  );
}

export function Card({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
