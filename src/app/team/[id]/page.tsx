import { notFound } from "next/navigation";
import { TeamView } from "@/components/TeamView";
import { parseTeamId } from "@/lib/fpl/client";

export default async function TeamPage({ params }: PageProps<"/team/[id]">) {
  const { id } = await params;
  const teamId = parseTeamId(id);
  if (teamId === null) notFound();
  return <TeamView teamId={teamId} />;
}
