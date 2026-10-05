"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { Plan } from "@/lib/planner/plan";

// localStorage can throw (private mode, blocked storage); fail quietly and keep state in memory.
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

interface Store {
  shortlist: number[];
  toggleShortlist: (id: number) => void;
  alertThreshold: number; // % progress that triggers a rise/fall highlight
  setAlertThreshold: (n: number) => void;
  recentTeams: { id: number; name: string }[];
  rememberTeam: (id: number, name: string) => void;
  plans: Record<string, { plan: Plan; history: Plan[]; basedOn: string }>;
  savePlan: (teamId: number, plan: Plan, history: Plan[], basedOn: string) => void;
  clearPlan: (teamId: number) => void;
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      shortlist: [],
      toggleShortlist: (id) =>
        set((s) => ({
          shortlist: s.shortlist.includes(id) ? s.shortlist.filter((x) => x !== id) : [...s.shortlist, id],
        })),
      alertThreshold: 80,
      setAlertThreshold: (n) => set({ alertThreshold: n }),
      recentTeams: [],
      rememberTeam: (id, name) =>
        set((s) => ({
          recentTeams: [{ id, name }, ...s.recentTeams.filter((t) => t.id !== id)].slice(0, 5),
        })),
      plans: {},
      savePlan: (teamId, plan, history, basedOn) =>
        set((s) => ({ plans: { ...s.plans, [teamId]: { plan, history: history.slice(-30), basedOn } } })),
      clearPlan: (teamId) =>
        set((s) => {
          const plans = { ...s.plans };
          delete plans[teamId];
          return { plans };
        }),
    }),
    { name: "fpl-hub", storage: createJSONStorage(() => safeStorage), version: 1 },
  ),
);
