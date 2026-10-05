"use client";

import type { AppPlayer, AppTeam } from "@/lib/app-types";
import type { PriceSignal } from "@/lib/prices";
import { Kit } from "./Kit";
import { FDR_CLASS, pts, type Lookups } from "./hooks";

export interface CardInfo {
  player: AppPlayer;
  slotIndex: number;
  isCaptain: boolean;
  isVice: boolean;
  signal: PriceSignal;
  shortlisted: boolean;
  isNew: boolean; // transferred in during this plan
}

function PlayerCard({
  info,
  team,
  lookups,
  gws,
  selected,
  swapTarget,
  onClick,
}: {
  info: CardInfo;
  team: AppTeam | undefined;
  lookups: Lookups;
  gws: number[];
  selected: boolean;
  swapTarget: boolean;
  onClick: () => void;
}) {
  const p = info.player;
  const next = lookups.opponents(p.team, gws[0]);
  const flagged = p.status !== "a";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-[64px] flex-col items-center rounded-lg p-1 text-center transition sm:w-[96px] ${
        selected ? "bg-white/25" : swapTarget ? "bg-accent/30 ring-2 ring-accent" : "hover:bg-white/10"
      }`}
      aria-label={`${p.name}, ${pts(p.xp[0] ?? 0)} projected points`}
    >
      <div
        className={`relative rounded-full ${info.signal === "rise" ? "ring-rise" : info.signal === "fall" ? "ring-fall" : ""}`}
      >
        <Kit teamCode={team?.code ?? 0} goalkeeper={p.pos === 1} size={44} />
        {(info.isCaptain || info.isVice) && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">
            {info.isCaptain ? "C" : "V"}
          </span>
        )}
        {flagged && (
          <span
            title={p.news || "Flagged"}
            className={`absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
              p.status === "d" ? "bg-amber-400 text-amber-950" : "bg-rose-600 text-white"
            }`}
          >
            !
          </span>
        )}
        {info.shortlisted && <span className="absolute -bottom-1 -right-1 text-xs">★</span>}
        {info.isNew && (
          <span className="absolute -bottom-1 -left-2 rounded bg-accent px-1 text-[9px] font-bold text-zinc-900">NEW</span>
        )}
      </div>
      <div className="mt-1 w-full truncate rounded-t bg-white px-1 text-[11px] font-semibold text-zinc-900 sm:text-xs">
        {p.name}
      </div>
      <div className="w-full truncate bg-brand px-1 text-[10px] text-white">
        {next.length
          ? next.map((f) => `${f.opp.short} (${f.home ? "H" : "A"})`).join(", ")
          : "No match"}
      </div>
      <div className="flex w-full overflow-hidden rounded-b text-[10px] font-semibold sm:text-[11px]">
        {gws.slice(0, 3).map((gw, i) => {
          const fx = lookups.opponents(p.team, gw);
          const diff = fx.length ? Math.round(fx.reduce((s, f) => s + f.difficulty, 0) / fx.length) : 0;
          return (
            <span
              key={gw}
              title={`GW${gw}: ${fx.map((f) => `${f.opp.short} ${f.home ? "H" : "A"}`).join(", ") || "blank"}`}
              className={`flex-1 py-0.5 ${diff ? FDR_CLASS[diff] : "bg-zinc-500 text-white"} ${i === 0 ? "" : "border-l border-black/10"}`}
            >
              {pts(p.xp[i] ?? 0)}
            </span>
          );
        })}
      </div>
    </button>
  );
}

export function Pitch({
  starters,
  bench,
  lookups,
  gws,
  selectedSlot,
  swapTargets,
  onSelect,
}: {
  starters: CardInfo[];
  bench: CardInfo[];
  lookups: Lookups;
  gws: number[];
  selectedSlot: number | null;
  swapTargets: Set<number>;
  onSelect: (slotIndex: number) => void;
}) {
  const rows = [1, 2, 3, 4].map((pos) => starters.filter((c) => c.player.pos === pos));
  const card = (c: CardInfo) => (
    <PlayerCard
      key={c.slotIndex}
      info={c}
      team={lookups.teams.get(c.player.team)}
      lookups={lookups}
      gws={gws}
      selected={selectedSlot === c.slotIndex}
      swapTarget={swapTargets.has(c.slotIndex)}
      onClick={() => onSelect(c.slotIndex)}
    />
  );
  return (
    <div className="overflow-hidden rounded-xl">
      <div className="pitch relative px-1 py-4">
        {/* pitch markings */}
        <div className="pointer-events-none absolute inset-x-[18%] top-0 h-16 rounded-b border-2 border-t-0 border-white/25" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/15" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t-2 border-white/15" />
        <div className="relative flex flex-col gap-3 sm:gap-5">
          {rows.map((row, i) => (
            <div key={i} className="flex justify-center gap-0.5 sm:gap-4">
              {row.map(card)}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-emerald-950/80 px-1 py-3">
        <div className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-white/70">Bench</div>
        <div className="flex justify-center gap-0.5 sm:gap-4">{bench.map(card)}</div>
      </div>
      <div className="flex items-center justify-center gap-3 bg-zinc-900 px-2 py-1.5 text-[10px] text-white/80">
        <span>Under each player: projected points for GW{gws[0]} · GW{gws[1]} · GW{gws[2]}</span>
        <span className="hidden sm:inline">Colour = fixture difficulty</span>
      </div>
    </div>
  );
}
