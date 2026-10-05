"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useStore } from "./store";

const subscribe = () => () => {};

export function TeamIdForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const recent = useStore((s) => s.recentTeams);
  // Recent teams come from localStorage, so only show them after hydration.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const id = value.trim();
          if (!/^\d{1,9}$/.test(id) || Number(id) === 0) {
            setError("Team IDs are numbers, e.g. 1234567");
            return;
          }
          router.push(`/team/${id}`);
        }}
      >
        <input
          inputMode="numeric"
          autoComplete="off"
          placeholder="Team ID"
          aria-label="FPL team ID"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-4 py-3 text-lg outline-none focus:border-brand"
        />
        <button className="rounded-lg bg-brand px-5 py-3 font-semibold text-brand-ink hover:opacity-90">
          Go
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-fall">{error}</p>}
      {mounted && recent.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="text-muted">Recent:</span>
          {recent.map((t) => (
            <Link key={t.id} href={`/team/${t.id}`} className="rounded-full border border-line bg-card px-3 py-1 hover:border-brand">
              {t.name}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
