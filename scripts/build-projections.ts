// Build live projections for the next 6 gameweeks and write src/data/projections.json.
// Run locally with `npm run projections`, or daily by the GitHub Action (.github/workflows/projections.yml).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MODEL_VERSION, projectAll } from "../src/lib/model/project";
import type { Availability } from "../src/lib/model/types";
import type { ProjectionsFile } from "../src/lib/projections";
import { rulesFromBootstrap } from "../src/lib/rules";
import { loadLiveSeason } from "./lib/live";
import { teamPriorsFor } from "./lib/priors";

const HORIZON = 6;

async function main() {
  const live = await loadLiveSeason({ ttlHours: Number(process.env.FPL_CACHE_HOURS ?? 6) });
  const bs = live.bootstrap;
  const next = bs.events.find((e) => e.is_next);
  if (!next) {
    console.log("No upcoming gameweek (season over) — nothing to do.");
    return;
  }
  const lastGw = Math.max(...bs.events.map((e) => e.id));
  const targetGws = Array.from({ length: HORIZON }, (_, i) => next.id + i).filter((g) => g <= lastGw);
  const rules = rulesFromBootstrap(bs);
  const teams = bs.teams.map((t) => ({ id: t.id, name: t.name }));

  const availability = new Map<number, Availability>(
    bs.elements.map((e) => [e.id, { status: e.status, chance: e.chance_of_playing_next_round }]),
  );

  const proj = projectAll({
    players: live.players,
    rows: live.rows,
    fixtures: live.fixturesLite,
    targetGws,
    teams: teams.map((t) => t.id),
    teamPriors: await teamPriorsFor(teams, "2025-26"),
    scoring: rules.scoring,
    defConThreshold: rules.scoring.defConThreshold,
    availability,
  });

  const out: ProjectionsFile = {
    generatedAt: new Date().toISOString(),
    modelVersion: MODEL_VERSION,
    gws: targetGws,
    players: {},
  };
  for (const [id, list] of proj) {
    out.players[id] = {
      xp: list.map((p) => p.xp),
      pAppear: list.map((p) => p.pAppear),
    };
  }

  const file = path.resolve(process.cwd(), "src/data/projections.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(out));
  const top = [...proj]
    .map(([id, l]) => ({ name: bs.elements.find((e) => e.id === id)!.web_name, xp: l[0].xp }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);
  console.log(`Wrote projections for GW${targetGws[0]}–${targetGws.at(-1)} (${proj.size} players).`);
  console.log("Top 10 next GW:", top.map((t) => `${t.name} ${t.xp}`).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
