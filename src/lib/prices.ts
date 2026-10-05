import type { AppPlayer } from "./app-types";

export type PriceSignal = "rise" | "fall" | null;

/**
 * Whether a player is close to a price change. FPL's `percent` is progress toward the next change
 * (+100 rises, −100 falls); `projected[0]` is where it's expected to be at the next price deadline.
 */
export function priceSignal(p: AppPlayer, threshold: number): PriceSignal {
  const pc = p.priceChange;
  if (!pc || pc.lockedUntil) return null;
  const tonight = pc.projected[0] ?? pc.percent;
  if (pc.percent >= threshold || tonight >= 100) return "rise";
  if (pc.percent <= -threshold || tonight <= -100) return "fall";
  return null;
}

/** Index of the first upcoming price deadline at which the projection crosses ±100, or −1. */
export function changeEtaIndex(p: AppPlayer): number {
  const proj = p.priceChange?.projected ?? [];
  return proj.findIndex((x) => Math.abs(x) >= 100);
}
