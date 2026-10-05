// Coordinate-descent tuning of MODEL_PARAMS on the 2025/26 walk-forward.
// Objective: RMSE over all player-gameweeks, horizons 1–3, plus RMSE on regular starters
// (the players managers actually choose between). Prints the best parameters; copy them into
// src/lib/model/project.ts by hand, then re-run the backtest to confirm.
//
//   npm run tune

import { MODEL_PARAMS } from "../src/lib/model/project";
import { pastDataset, runSplit, type Split } from "./backtest";
import { rmse } from "./lib/metrics";

type Key = keyof typeof MODEL_PARAMS;
const GRID: Partial<Record<Key, number[]>> = {
  playerDecay: [0.75, 0.8, 0.85, 0.9, 0.95],
  teamDecay: [0.85, 0.9, 0.92, 0.95, 0.98],
  teamPseudoMatches: [2, 4, 6, 10],
  priorMinutesLastSeason: [180, 450, 900, 1500],
  priorMinutesPosition: [90, 270, 540],
  startPriorWeight: [0.3, 0.7, 1.5],
  homeGoals: [1.0, 1.05, 1.1, 1.15],
};

async function main() {
  const ds = await pastDataset("2025-26", "2024-25");
  const maxGw = Math.max(...ds.rows.map((r) => r.gw));
  const splits: Split[] = [];
  for (let k = 5; k + 2 <= maxGw; k++) splits.push({ name: `k${k}`, trainEnd: k - 1, testGws: [k, k + 1, k + 2] });

  const score = () => {
    const recs = splits.flatMap((s) => runSplit(ds, s));
    const reg = recs.filter((r) => r.regular);
    const all = rmse(recs.map((r) => r.pred), recs.map((r) => r.actual));
    const regular = rmse(reg.map((r) => r.pred), reg.map((r) => r.actual));
    return { total: all + regular, all, regular };
  };

  let best = score();
  console.log("start", best);
  for (let pass = 0; pass < 2; pass++) {
    for (const [key, values] of Object.entries(GRID) as [Key, number[]][]) {
      const original = MODEL_PARAMS[key];
      let bestVal = original;
      for (const v of values) {
        if (v === original) continue;
        MODEL_PARAMS[key] = v;
        if (key === "homeGoals") MODEL_PARAMS.awayGoals = 2 - v;
        const s = score();
        if (s.total < best.total - 1e-4) {
          best = s;
          bestVal = v;
        }
      }
      MODEL_PARAMS[key] = bestVal;
      if (key === "homeGoals") MODEL_PARAMS.awayGoals = 2 - bestVal;
      console.log(`pass ${pass} ${key} = ${bestVal}`, best);
    }
  }
  console.log("\nBest parameters:\n", JSON.stringify(MODEL_PARAMS, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
