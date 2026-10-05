import type { PlayerInfo, PlayerPrior, TeamRating } from "../../src/lib/model/types";
import { PROMOTED_PRIOR, teamPriorsByName } from "./vaastav";

/** Team priors for a season, from the previous season's xG (promoted teams get a weaker prior). */
export async function teamPriorsFor(
  teams: { id: number; name: string }[],
  prevSeason: string,
): Promise<Map<number, TeamRating>> {
  const byName = await teamPriorsByName(prevSeason);
  return new Map(teams.map((t) => [t.id, byName.get(t.name) ?? PROMOTED_PRIOR]));
}

export function withPriors(
  players: PlayerInfo[],
  codeById: Map<number, number>,
  priorsByCode: Map<number, PlayerPrior>,
): PlayerInfo[] {
  return players.map((p) => {
    const code = codeById.get(p.id);
    return { ...p, prior: p.prior ?? (code !== undefined ? priorsByCode.get(code) : undefined) };
  });
}
