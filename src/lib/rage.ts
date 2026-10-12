// The "Delete-the-App-o-Meter": a 0–100 frustration score built from each finished gameweek.
// Pure functions only — the server fetches the FPL data and passes it in.
//
//   meter after a GW = clamp(0, 100, previous × decay + pain − relief)

import type { FplPicks, FplTransfer, PositionId } from "./fpl/types";

/** Every weight in one place so the feel can be tuned. Pain is positive, relief negative. */
export const RAGE_CONFIG = {
  start: 15, // everyone is a little anxious in GW1
  decay: 0.75, // "time heals": old frustration fades by a quarter each gameweek
  captainMissedPerPoint: 1,
  captainMissedCap: 15,
  viceHaul: { captainMax: 2, viceMin: 8, pain: 8 },
  captainGood: { minPoints: 12, bestMin: 6, relief: 8 }, // 12+, or the best in the XI with at least 6
  benchNormal: 4,
  benchCap: 12,
  wrongBenchPerPoint: 0.5,
  wrongBenchCap: 8,
  transferFailCap: 10,
  transferWin: { minGap: 3, cap: 8 },
  hitLossCap: 12,
  hitPaidRelief: 5,
  chipRegretCap: 15,
  chipFlop: { benchBoostMax: 6, tripleCaptainMax: 4, pain: 10 },
  chipLanded: { benchBoostMin: 15, tripleCaptainMin: 15, relief: 10 },
  vsAveragePerPoint: 0.5,
  vsAverageCap: 10,
  noShowPerPlayer: 3,
  greenArrowRelief: 3,
};

export type RageConfig = typeof RAGE_CONFIG;

export const RAGE_LEVELS = [
  { max: 20, emoji: "😎", label: "Living the dream" },
  { max: 40, emoji: "🙂", label: "Mild grumbling" },
  { max: 60, emoji: "😤", label: "Muttering at the TV" },
  { max: 80, emoji: "🤬", label: "Drafting the group-chat rant" },
  { max: 101, emoji: "🗑️", label: "Thumb hovering over Delete" },
];

export const rageLevel = (meter: number) => RAGE_LEVELS.find((l) => meter < l.max) ?? RAGE_LEVELS[RAGE_LEVELS.length - 1];

export interface PlayerGw {
  pts: number;
  mins: number;
}

export interface RageGwInput {
  gw: number;
  picks: FplPicks;
  prevPicks: FplPicks | null; // previous GW's squad, for Wildcard/Free Hit regret
  live: Map<number, PlayerGw>;
  pos: Map<number, PositionId>;
  names: Map<number, string>;
  transfers: FplTransfer[]; // transfers made for this GW
  average: number | null; // FPL average score this GW
  prevOverallRank: number | null;
}

export interface RageItem {
  kind: string;
  label: string;
  detail: string;
  delta: number; // + pushes the meter up, − brings it down
}

export interface RageGw {
  gw: number;
  points: number; // GW points after hits
  items: RageItem[];
  before: number;
  meter: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The XI after automatic substitutions. */
export function effectiveStarters(picks: FplPicks): number[] {
  const xi = picks.picks.filter((p) => p.position <= 11).map((p) => p.element);
  for (const s of picks.automatic_subs ?? []) {
    const i = xi.indexOf(s.element_out);
    if (i >= 0) xi[i] = s.element_in;
  }
  return xi;
}

export function rageForGw(input: RageGwInput, before: number, cfg: RageConfig = RAGE_CONFIG): RageGw {
  const { picks, live, names } = input;
  const items: RageItem[] = [];
  const add = (kind: string, label: string, detail: string, delta: number) => {
    if (Math.abs(delta) >= 0.05) items.push({ kind, label, detail, delta: r1(delta) });
  };
  const pts = (id: number) => live.get(id)?.pts ?? 0;
  const mins = (id: number) => live.get(id)?.mins ?? 0;
  const name = (id: number) => names.get(id) ?? `#${id}`;
  const chip = picks.active_chip;
  const eh = picks.entry_history;
  const hitCost = eh.event_transfers_cost ?? 0;

  const xi = effectiveStarters(picks);
  const captain = picks.picks.find((p) => p.is_captain)?.element;
  const vice = picks.picks.find((p) => p.is_vice_captain)?.element;

  // --- Captaincy ---------------------------------------------------------------------------------
  if (captain !== undefined) {
    const captainPlayed = mins(captain) > 0;
    const armband = captainPlayed ? captain : vice; // the vice takes over if the captain doesn't play
    const best = xi.reduce((b, id) => (pts(id) > pts(b) ? id : b), xi[0]);
    if (armband !== undefined) {
      const missed = pts(best) - pts(armband);
      if (missed > 0) {
        add(
          "captain",
          "Captain fail",
          `${name(armband)} scored ${pts(armband)}; ${name(best)} would have been ${pts(best)}`,
          Math.min(cfg.captainMissedCap, missed * cfg.captainMissedPerPoint),
        );
      } else if (
        pts(armband) >= cfg.captainGood.minPoints ||
        (pts(armband) === pts(best) && pts(armband) >= cfg.captainGood.bestMin)
      ) {
        add("captain", "Captain nailed it", `${name(armband)} was your best pick (${pts(armband)} pts)`, -cfg.captainGood.relief);
      }
    }
    if (
      captainPlayed &&
      vice !== undefined &&
      pts(captain) <= cfg.viceHaul.captainMax &&
      pts(vice) >= cfg.viceHaul.viceMin
    ) {
      add("vice", "Vice-captain haul", `${name(captain)} blanked (${pts(captain)}) while vice ${name(vice)} got ${pts(vice)}`, cfg.viceHaul.pain);
    }
  }

  // --- Bench --------------------------------------------------------------------------------------
  const benched = picks.picks.filter((p) => p.position > 11 && !xi.includes(p.element)).map((p) => p.element);
  if (chip !== "bboost") {
    const extra = eh.points_on_bench - cfg.benchNormal;
    if (extra > 0) add("bench", "Points on the bench", `${eh.points_on_bench} pts left on the bench`, Math.min(cfg.benchCap, extra));
    // Wrong call: the biggest gap between a benched player and a same-position starter.
    let worst: { b: number; s: number; gap: number } | null = null;
    for (const b of benched) {
      const samePos = xi.filter((s) => input.pos.get(s) === input.pos.get(b));
      for (const s of samePos) {
        const gap = pts(b) - pts(s);
        if (gap > 0 && (!worst || gap > worst.gap)) worst = { b, s, gap };
      }
    }
    if (worst) {
      add(
        "bench-call",
        "Wrong bench call",
        `Benched ${name(worst.b)} (${pts(worst.b)}) but started ${name(worst.s)} (${pts(worst.s)})`,
        Math.min(cfg.wrongBenchCap, worst.gap * cfg.wrongBenchPerPoint),
      );
    }
  }

  // --- Transfers and hits ---------------------------------------------------------------------------
  if (chip !== "wildcard" && chip !== "freehit") {
    let gained = 0;
    for (const t of input.transfers) {
      const gap = pts(t.element_in) - pts(t.element_out);
      gained += gap;
      if (gap < 0) {
        add(
          "transfer",
          "Transfer fail",
          `Sold ${name(t.element_out)} (${pts(t.element_out)}) for ${name(t.element_in)} (${pts(t.element_in)})`,
          Math.min(cfg.transferFailCap, -gap),
        );
      } else if (gap >= cfg.transferWin.minGap) {
        add(
          "transfer",
          "Transfer win",
          `${name(t.element_in)} (${pts(t.element_in)}) beat ${name(t.element_out)} (${pts(t.element_out)})`,
          -Math.min(cfg.transferWin.cap, gap),
        );
      }
    }
    if (hitCost > 0) {
      const net = gained - hitCost;
      if (net < 0) add("hit", "Hit didn't pay", `Took −${hitCost}, transfers gained ${gained}`, Math.min(cfg.hitLossCap, -net));
      else add("hit", "Hit paid off", `Took −${hitCost}, transfers gained ${gained}`, -cfg.hitPaidRelief);
    }
  }

  // --- Wildcard / Free Hit regret -----------------------------------------------------------------
  if ((chip === "wildcard" || chip === "freehit") && input.prevPicks) {
    const prev = input.prevPicks.picks;
    const old = prev
      .filter((p) => p.position <= 11)
      .reduce((s, p) => s + pts(p.element) * (p.is_captain ? 2 : 1), 0);
    if (old > eh.points) {
      add(
        "chip-regret",
        `${chip === "wildcard" ? "Wildcard" : "Free Hit"} regret`,
        `Your old team would have scored ${old}; the new one got ${eh.points}`,
        Math.min(cfg.chipRegretCap, old - eh.points),
      );
    }
  }

  // --- Bench Boost / Triple Captain -----------------------------------------------------------------
  if (chip === "bboost") {
    const bench = picks.picks.filter((p) => p.position > 11).reduce((s, p) => s + pts(p.element), 0);
    if (bench <= cfg.chipFlop.benchBoostMax) add("chip", "Bench Boost flop", `Bench scored just ${bench}`, cfg.chipFlop.pain);
    else if (bench >= cfg.chipLanded.benchBoostMin) add("chip", "Bench Boost landed", `Bench scored ${bench}`, -cfg.chipLanded.relief);
  }
  if (chip === "3xc" && captain !== undefined) {
    const c = pts(captain);
    if (c <= cfg.chipFlop.tripleCaptainMax) add("chip", "Triple Captain flop", `${name(captain)} scored ${c}`, cfg.chipFlop.pain);
    else if (c >= cfg.chipLanded.tripleCaptainMin) add("chip", "Triple Captain landed", `${name(captain)} scored ${c}`, -cfg.chipLanded.relief);
  }

  // --- Starters who didn't play and weren't covered ---------------------------------------------------
  const noShows = xi.filter((id) => mins(id) === 0);
  if (noShows.length) {
    add("no-show", "Starters who didn't play", noShows.map(name).join(", "), noShows.length * cfg.noShowPerPlayer);
  }

  // --- Compared with everyone else --------------------------------------------------------------------
  const net = eh.points - hitCost;
  if (input.average !== null) {
    const diff = net - input.average;
    if (diff < 0) add("average", "Below-average week", `${net} pts vs average ${input.average}`, Math.min(cfg.vsAverageCap, -diff * cfg.vsAveragePerPoint));
    else if (diff > 0) add("average", "Above-average week", `${net} pts vs average ${input.average}`, -Math.min(cfg.vsAverageCap, diff * cfg.vsAveragePerPoint));
  }
  if (input.prevOverallRank && eh.overall_rank && eh.overall_rank < input.prevOverallRank) {
    add(
      "rank",
      "Green arrow",
      `Overall rank ${input.prevOverallRank.toLocaleString("en-GB")} → ${eh.overall_rank.toLocaleString("en-GB")}`,
      -cfg.greenArrowRelief,
    );
  }

  const change = items.reduce((s, i) => s + i.delta, 0);
  return {
    gw: input.gw,
    points: net,
    items: items.sort((a, b) => b.delta - a.delta),
    before: r1(before),
    meter: r1(clamp(before * cfg.decay + change, 0, 100)),
  };
}

export function rageSeason(inputs: RageGwInput[], cfg: RageConfig = RAGE_CONFIG): RageGw[] {
  const out: RageGw[] = [];
  let meter = cfg.start;
  for (const input of [...inputs].sort((a, b) => a.gw - b.gw)) {
    const gw = rageForGw(input, meter, cfg);
    out.push(gw);
    meter = gw.meter;
  }
  return out;
}
