import { describe, expect, it } from "vitest";
import type { FplHistory, FplTransfer } from "./fpl/types";
import { parseTeamId } from "./fpl/client";
import { availableChips, estimateFreeTransfers, purchasePrices, sellingPrice } from "./team";

const row = (event: number, transfers = 0) => ({
  event,
  points: 0,
  total_points: 0,
  rank: null,
  overall_rank: null,
  bank: 0,
  value: 1000,
  event_transfers: transfers,
  event_transfers_cost: 0,
  points_on_bench: 0,
});

describe("sellingPrice", () => {
  it("keeps half the rise, rounded down", () => {
    expect(sellingPrice(60, 61)).toBe(60);
    expect(sellingPrice(60, 62)).toBe(61);
    expect(sellingPrice(60, 63)).toBe(61);
  });
  it("takes the full drop", () => {
    expect(sellingPrice(60, 58)).toBe(58);
  });
});

describe("estimateFreeTransfers", () => {
  it("accrues one per week up to the cap", () => {
    const h: FplHistory = { current: [1, 2, 3, 4, 5, 6, 7].map((e) => row(e)), chips: [] };
    expect(estimateFreeTransfers(h, 1, 2, 5)).toBe(2);
    expect(estimateFreeTransfers(h, 1, 7, 5)).toBe(5);
  });
  it("spends transfers and never goes below the weekly one", () => {
    const h: FplHistory = { current: [row(1), row(2, 1), row(3, 3)], chips: [] };
    expect(estimateFreeTransfers(h, 1, 3, 5)).toBe(1);
  });
  it("keeps banked transfers through a Wildcard or Free Hit, without adding that week's one", () => {
    // 1 FT for GW2 (unused) → 2 for GW3; Wildcard in GW3 keeps 2 → 2 for GW4.
    const wc: FplHistory = {
      current: [row(1), row(2), row(3, 9)],
      chips: [{ name: "wildcard", event: 3, time: "" }],
    };
    expect(estimateFreeTransfers(wc, 1, 3, 5)).toBe(2);
    // …then Free Hit in GW4 keeps 2 again → 2 for GW5.
    const both: FplHistory = {
      current: [row(1), row(2), row(3, 9), row(4, 8)],
      chips: [
        { name: "wildcard", event: 3, time: "" },
        { name: "freehit", event: 4, time: "" },
      ],
    };
    expect(estimateFreeTransfers(both, 1, 4, 5)).toBe(2);
  });
});

describe("purchasePrices", () => {
  const t = (inId: number, cost: number, event: number, time: string): FplTransfer => ({
    element_in: inId,
    element_in_cost: cost,
    element_out: 0,
    element_out_cost: 0,
    event,
    time,
  });
  it("uses the latest transfer in, ignoring Free Hit weeks, else the start price", () => {
    const prices = purchasePrices(
      [1, 2, 3],
      [t(1, 55, 2, "2026-08-28"), t(1, 57, 4, "2026-09-12"), t(2, 90, 5, "2026-09-18")],
      new Set([5]),
      () => 45,
    );
    expect(prices.get(1)).toBe(57);
    expect(prices.get(2)).toBe(45);
    expect(prices.get(3)).toBe(45);
  });
});

describe("availableChips", () => {
  const windows = [
    { id: 1, name: "wildcard", number: 1, start_event: 2, stop_event: 19, chip_type: "transfer" },
    { id: 2, name: "bboost", number: 1, start_event: 1, stop_event: 19, chip_type: "team" },
  ];
  it("removes chips already used in the same window", () => {
    expect(availableChips(windows, [{ name: "bboost", event: 1 }], 6)).toEqual(["wildcard"]);
  });
});

describe("parseTeamId", () => {
  it("accepts positive integers only", () => {
    expect(parseTeamId("895045")).toBe(895045);
    expect(parseTeamId("0")).toBeNull();
    expect(parseTeamId("abc")).toBeNull();
    expect(parseTeamId("1/../../x")).toBeNull();
    expect(parseTeamId("1234567890")).toBeNull();
  });
});
