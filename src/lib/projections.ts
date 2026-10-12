// Shape of src/data/projections.json, produced by scripts/build-projections.ts.

import type { FixtureOdds } from "./model/project";

export interface ProjectionsFile {
  generatedAt: string;
  modelVersion: string;
  gws: number[];
  players: Record<string, { xp: number[]; pAppear: number[] }>;
  // Per-fixture goals and clean-sheet % (added in v1.1; older files don't have it).
  fixtures?: FixtureOdds[];
}
