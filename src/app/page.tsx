import { TeamIdForm } from "@/components/TeamIdForm";

export default function Home() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="text-3xl font-bold tracking-tight">Plan your FPL week</h1>
      <p className="mt-2 text-muted">
        Enter your team ID to see your squad on the pitch, projected points for the next three
        gameweeks, price changes and transfer suggestions.
      </p>
      <TeamIdForm />
      <p className="mt-6 text-sm text-muted">
        Where&apos;s my team ID? On the FPL site, open <b>Points</b>. The number after{" "}
        <code className="rounded bg-card px-1">/entry/</code> in the address bar is your ID.
      </p>
    </div>
  );
}
