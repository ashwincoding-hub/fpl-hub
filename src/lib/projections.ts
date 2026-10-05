// Shape of src/data/projections.json, produced by scripts/build-projections.ts.

export interface ProjectionsFile {
  generatedAt: string;
  modelVersion: string;
  gws: number[];
  players: Record<string, { xp: number[]; pAppear: number[] }>;
}
