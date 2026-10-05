// Backtest the projection model on past gameweeks.
//
//   npm run backtest -- --quick                     2026/27: GW1–3 → GW4–5, then GW1–4 → GW5 (+6 when played)
//   npm run backtest -- --season 2026-27 --train 1-3 --test 4-5
//   npm run backtest -- --walk                      2025/26 walk-forward: train 1..k-1, predict k..k+2, k = 5..36
//   add --team <id> to also score your own squad (live season only)
//
// Writes reports/backtest-<name>.md and .csv.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FplPicks, PositionId } from "../src/lib/fpl/types";
import { projectAll, MODEL_VERSION } from "../src/lib/model/project";
import type { FixtureLite, MatchRow, PlayerInfo, TeamRating } from "../src/lib/model/types";
import { RULES_2026_27, rulesFromBootstrap } from "../src/lib/rules";
import { cachedJson } from "./lib/cache";
import { loadLiveSeason } from "./lib/live";
import { brier, mae, mean, rankOf, rmse, spearman, topKOverlap } from "./lib/metrics";
import { teamPriorsFor, withPriors } from "./lib/priors";
import { loadSeason, playerPriorsByCode } from "./lib/vaastav";

export interface Split {
  name: string;
  trainEnd: number;
  testGws: number[];
}

export interface Rec {
  split: string;
  player: number;
  name: string;
  pos: PositionId;
  gw: number;
  horizon: number;
  pred: number;
  pAppear: number;
  p60: number;
  actual: number;
  mins: number;
  avg: number;
  last3: number;
  fplXp: number | null;
  regular: boolean; // started 2+ of their last 3 matches before the cutoff
}

export interface Dataset {
  label: string;
  rows: MatchRow[];
  fixtures: FixtureLite[];
  teams: number[];
  basePlayers: Map<number, PlayerInfo>; // pos + prior (team is taken from the test-GW row)
  names: Map<number, string>;
  teamPriors: Map<number, TeamRating>;
  fplXp?: Map<string, number>;
  scoring: typeof RULES_2026_27.scoring;
}

const POS_NAME: Record<PositionId, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

export function runSplit(ds: Dataset, split: Split): Rec[] {
  const cutoff = split.trainEnd + 1;
  const testRows = ds.rows.filter((r) => split.testGws.includes(r.gw));
  const teamInTest = new Map<number, number>();
  for (const r of testRows) if (!teamInTest.has(r.player)) teamInTest.set(r.player, r.team);

  const players: PlayerInfo[] = [...teamInTest].map(([id, team]) => {
    const base = ds.basePlayers.get(id);
    const pos = base?.pos ?? testRows.find((r) => r.player === id)!.pos;
    return { id, team, pos, prior: base?.prior };
  });

  const proj = projectAll({
    players,
    rows: ds.rows,
    fixtures: ds.fixtures,
    targetGws: split.testGws,
    teams: ds.teams,
    teamPriors: ds.teamPriors,
    scoring: ds.scoring,
    defConThreshold: RULES_2026_27.scoring.defConThreshold,
  });

  // Baselines use the same pre-cutoff rows.
  const train = new Map<number, MatchRow[]>();
  for (const r of ds.rows) {
    if (r.gw >= cutoff) continue;
    const l = train.get(r.player) ?? [];
    l.push(r);
    train.set(r.player, l);
  }

  const out: Rec[] = [];
  for (const p of players) {
    const tr = (train.get(p.id) ?? []).sort((a, b) => a.gw - b.gw);
    const perMatchAvg = tr.length ? mean(tr.map((r) => r.points)) : 0;
    const last = tr.slice(-3);
    const perMatchLast3 = last.length ? mean(last.map((r) => r.points)) : 0;
    const projections = proj.get(p.id)!;
    split.testGws.forEach((gw, h) => {
      const rowsGw = testRows.filter((r) => r.player === p.id && r.gw === gw);
      if (!rowsGw.length) return; // not registered / blank for that GW
      const nFix = rowsGw.length;
      const pj = projections[h];
      const xpKey = `${p.id}:${gw}`;
      out.push({
        split: split.name,
        player: p.id,
        name: ds.names.get(p.id) ?? String(p.id),
        pos: p.pos,
        gw,
        horizon: h + 1,
        pred: pj.xp,
        pAppear: pj.pAppear,
        p60: pj.p60,
        actual: rowsGw.reduce((s, r) => s + r.points, 0),
        mins: rowsGw.reduce((s, r) => s + r.minutes, 0),
        avg: perMatchAvg * nFix,
        last3: perMatchLast3 * nFix,
        fplXp: h === 0 && ds.fplXp?.has(xpKey) ? ds.fplXp.get(xpKey)! : null,
        regular: last.filter((r) => r.started).length >= 2,
      });
    });
  }
  return out;
}

// ---- Reporting ------------------------------------------------------------------------------

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "—");
const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : "—");
const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : "—");

function groupBy<T, K>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    const l = m.get(k) ?? [];
    l.push(x);
    m.set(k, l);
  }
  return m;
}

function perGwStats(recs: Rec[], field: "pred" | "avg" | "last3" | "fplXp") {
  const byGw = groupBy(recs, (r) => `${r.split}|${r.gw}`);
  const sp: number[] = [];
  const top: number[] = [];
  const capHit: number[] = [];
  for (const list of byGw.values()) {
    const usable = list.filter((r) => r[field] !== null);
    if (usable.length < 20) continue;
    const pred = usable.map((r) => r[field] as number);
    const act = usable.map((r) => r.actual);
    sp.push(spearman(pred, act));
    top.push(topKOverlap(pred, act, 20) / 20);
    const best = usable.reduce((a, b) => ((b[field] as number) > (a[field] as number) ? b : a));
    capHit.push(rankOf(best.actual, act) <= 5 ? 1 : 0);
  }
  return { spearman: mean(sp), top20: mean(top), captainTop5: mean(capHit), n: sp.length };
}

function summaryRow(label: string, recs: Rec[], field: "pred" | "avg" | "last3" | "fplXp") {
  const usable = recs.filter((r) => r[field] !== null);
  if (!usable.length) return null;
  const pred = usable.map((r) => r[field] as number);
  const act = usable.map((r) => r.actual);
  const played = usable.filter((r) => r.mins > 0);
  const g = perGwStats(usable, field);
  return {
    label,
    mae: mae(pred, act),
    rmse: rmse(pred, act),
    maePlayed: mae(
      played.map((r) => r[field] as number),
      played.map((r) => r.actual),
    ),
    ...g,
  };
}

type Row = NonNullable<ReturnType<typeof summaryRow>>;

function table(rows: Row[]) {
  const head =
    "| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |\n|---|---|---|---|---|---|---|";
  return [
    head,
    ...rows.map(
      (r) =>
        `| ${r.label} | ${f2(r.mae)} | ${f2(r.rmse)} | ${f2(r.maePlayed)} | ${f3(r.spearman)} | ${pct(r.top20)} | ${pct(r.captainTop5)} |`,
    ),
  ].join("\n");
}

function gate(model: Row, avg: Row, last3: Row) {
  const bestBaseMae = Math.min(avg.mae, last3.mae);
  const maeGain = 1 - model.mae / bestBaseMae;
  const spOk = model.spearman > Math.max(avg.spearman, last3.spearman);
  const pass = maeGain >= 0.1 && spOk;
  return {
    pass,
    text: `${pass ? "✅ PASS" : "❌ FAIL"} — MAE ${pct(maeGain)} lower than the best baseline (need ≥10%), Spearman ${f3(model.spearman)} vs best baseline ${f3(Math.max(avg.spearman, last3.spearman))} (need higher).`,
  };
}

function report(title: string, ds: Dataset, splits: Split[], recs: Rec[], extra: string[]) {
  const lines: string[] = [];
  lines.push(`# Backtest: ${title}`, "");
  lines.push(
    `Model ${MODEL_VERSION} · generated ${new Date().toISOString()} · data: ${ds.label}`,
    "",
    `Splits: ${splits.map((s) => `train GW1–${s.trainEnd} → predict GW${s.testGws.join(", ")}`).join("; ")}`,
    "",
    "Only data from before each predicted gameweek's deadline is used. Historical injury news isn't available, so the backtest can't use it (the live model does), which makes these numbers slightly pessimistic.",
    "",
    "Baselines: **season average** = the player's average points per match so far; **last 3** = average of their last 3 matches. **FPL xP** = FPL's own expected points (only available for past seasons, next GW only).",
    "",
  );

  const horizons = [...new Set(recs.map((r) => r.horizon))].sort();
  let gateResult: ReturnType<typeof gate> | null = null;
  for (const h of horizons) {
    const hr = recs.filter((r) => r.horizon === h);
    const model = summaryRow("**FPL Hub model**", hr, "pred")!;
    const avg = summaryRow("Season average", hr, "avg")!;
    const last3 = summaryRow("Last 3", hr, "last3")!;
    const fx = summaryRow("FPL xP", hr, "fplXp");
    lines.push(`## ${h} gameweek${h > 1 ? "s" : ""} ahead (${hr.length} player-gameweeks)`, "");
    lines.push("All players:", "", table([model, avg, last3, ...(fx ? [fx] : [])]), "");
    const reg = hr.filter((r) => r.regular);
    const rows = [
      summaryRow("**FPL Hub model**", reg, "pred"),
      summaryRow("Season average", reg, "avg"),
      summaryRow("Last 3", reg, "last3"),
      summaryRow("FPL xP", reg, "fplXp"),
    ].filter((r): r is Row => r !== null);
    lines.push(`Regular starters only (started 2+ of their last 3 matches; ${reg.length} player-gameweeks):`, "", table(rows), "");
    if (h === 1) {
      gateResult = gate(model, avg, last3);
      lines.push(`**Gate (next GW, all players — the criterion agreed before running):** ${gateResult.text}`, "");
      const regGate = gate(rows[0], rows[1], rows[2]);
      lines.push(
        `**Same gate on regular starters (added after the first run, because MAE across all ~700 players mostly rewards predicting 0 for bench players):** ${regGate.text}`,
        "",
      );
      if (fx) {
        lines.push(
          `**Target (match FPL xP):** model MAE ${f2(model.mae)} vs FPL xP ${f2(fx.mae)}; Spearman ${f3(model.spearman)} vs ${f3(fx.spearman)}.`,
          "",
        );
      }
    }
  }

  // By position (next GW)
  const h1 = recs.filter((r) => r.horizon === 1);
  lines.push("## By position (next gameweek)", "", "| Pos | n | Model MAE | Season avg MAE | Last 3 MAE | Model bias (pred − actual) |", "|---|---|---|---|---|---|");
  for (const pos of [1, 2, 3, 4] as PositionId[]) {
    const pr = h1.filter((r) => r.pos === pos);
    if (!pr.length) continue;
    const bias = mean(pr.map((r) => r.pred - r.actual));
    lines.push(
      `| ${POS_NAME[pos]} | ${pr.length} | ${f2(mae(pr.map((r) => r.pred), pr.map((r) => r.actual)))} | ${f2(mae(pr.map((r) => r.avg), pr.map((r) => r.actual)))} | ${f2(mae(pr.map((r) => r.last3), pr.map((r) => r.actual)))} | ${f2(bias)} |`,
    );
  }
  lines.push("");

  // Minutes model
  lines.push(
    "## Minutes model (next gameweek)",
    "",
    "Brier score: lower is better; 0.25 is a coin flip.",
    "",
    `- P(plays at all): **${f3(brier(h1.map((r) => r.pAppear), h1.map((r) => r.mins > 0)))}**`,
    `- P(plays 60+ minutes): **${f3(brier(h1.map((r) => r.p60), h1.map((r) => r.mins >= 60)))}**`,
    `- Points MAE when the player actually played 60+: **${f2(mae(h1.filter((r) => r.mins >= 60).map((r) => r.pred), h1.filter((r) => r.mins >= 60).map((r) => r.actual)))}**`,
    "",
  );

  lines.push(...extra);

  // Biggest misses
  const misses = [...h1].sort((a, b) => Math.abs(b.pred - b.actual) - Math.abs(a.pred - a.actual)).slice(0, 15);
  lines.push("## Biggest misses (next gameweek)", "", "| GW | Player | Pos | Predicted | Actual | Minutes |", "|---|---|---|---|---|---|");
  for (const m of misses) {
    lines.push(`| ${m.gw} | ${m.name} | ${POS_NAME[m.pos]} | ${f2(m.pred)} | ${m.actual} | ${m.mins} |`);
  }
  lines.push("");
  return { md: lines.join("\n"), gate: gateResult };
}

function toCsv(recs: Rec[]) {
  const cols: (keyof Rec)[] = ["split", "gw", "horizon", "player", "name", "pos", "pred", "pAppear", "p60", "actual", "mins", "avg", "last3", "fplXp", "regular"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...recs.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

// ---- Datasets -------------------------------------------------------------------------------

export async function liveDataset(): Promise<{ ds: Dataset; lastFinished: number }> {
  const live = await loadLiveSeason();
  const bs = live.bootstrap;
  const teams = bs.teams.map((t) => ({ id: t.id, name: t.name }));
  const lastFinished = Math.max(0, ...bs.events.filter((e) => e.finished).map((e) => e.id));
  const names = new Map(bs.elements.map((e) => [e.id, e.web_name]));
  return {
    lastFinished,
    ds: {
      label: "2026/27 live FPL API",
      rows: live.rows,
      fixtures: live.fixturesLite,
      teams: teams.map((t) => t.id),
      basePlayers: new Map(live.players.map((p) => [p.id, p])),
      names,
      teamPriors: await teamPriorsFor(teams, "2025-26"),
      scoring: rulesFromBootstrap(bs).scoring,
    },
  };
}

export async function pastDataset(season: string, prevSeason: string): Promise<Dataset> {
  const data = await loadSeason(season);
  const priorsByCode = await playerPriorsByCode(prevSeason);
  const base = new Map<number, PlayerInfo>();
  for (const r of data.rows) if (!base.has(r.player)) base.set(r.player, { id: r.player, team: r.team, pos: r.pos });
  const withP = withPriors([...base.values()], data.codeById, priorsByCode);
  return {
    label: `${season} (vaastav/Fantasy-Premier-League)`,
    rows: data.rows,
    fixtures: data.fixtures,
    teams: data.teams.map((t) => t.id),
    basePlayers: new Map(withP.map((p) => [p.id, p])),
    names: data.names,
    teamPriors: await teamPriorsFor(data.teams, prevSeason),
    fplXp: data.fplXp,
    scoring: RULES_2026_27.scoring,
  };
}

async function squadSection(teamId: number, recs: Rec[]): Promise<string[]> {
  const lines = ["## Your squad", "", "| GW | Predicted (starting XI, captain ×2) | Actual (same XI, no auto-subs) |", "|---|---|---|"];
  const gws = [...new Set(recs.filter((r) => r.split === recs[0].split).map((r) => r.gw))];
  for (const gw of gws) {
    const picks = await cachedJson<FplPicks>(
      `https://fantasy.premierleague.com/api/entry/${teamId}/event/${gw}/picks/`,
      `fpl/picks/${teamId}-${gw}.json`,
      24,
    );
    let pred = 0,
      act = 0;
    for (const p of picks.picks) {
      if (p.multiplier === 0) continue;
      const r = recs.find((x) => x.player === p.element && x.gw === gw && x.split === recs[0].split);
      pred += (r?.pred ?? 0) * p.multiplier;
      act += (r?.actual ?? 0) * p.multiplier;
    }
    lines.push(`| ${gw} | ${f2(pred)} | ${act} |`);
  }
  lines.push("");
  return lines;
}

// ---- CLI ------------------------------------------------------------------------------------

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const range = (s: string) => {
  const [a, b] = s.split("-").map(Number);
  return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
};

async function main() {
  let ds: Dataset;
  let splits: Split[];
  let name: string;
  let title: string;

  if (flag("walk")) {
    ds = await pastDataset("2025-26", "2024-25");
    const maxGw = Math.max(...ds.rows.map((r) => r.gw));
    splits = [];
    for (let k = 5; k + 2 <= maxGw; k++) splits.push({ name: `k${k}`, trainEnd: k - 1, testGws: [k, k + 1, k + 2] });
    name = "2025-26-walk-forward";
    title = "2025/26 walk-forward (main evidence)";
  } else {
    const season = arg("season") ?? "2026-27";
    if (season === "2026-27") {
      const live = await liveDataset();
      ds = live.ds;
      if (arg("train") && arg("test")) {
        const tr = range(arg("train")!);
        splits = [{ name: "custom", trainEnd: Math.max(...tr), testGws: range(arg("test")!) }];
      } else {
        const lf = live.lastFinished;
        splits = [{ name: "A", trainEnd: 3, testGws: [4, 5].filter((g) => g <= lf) }];
        if (lf >= 5) splits.push({ name: "B", trainEnd: 4, testGws: [5, 6].filter((g) => g <= lf) });
      }
      name = splits.length === 1 && splits[0].name === "custom" ? `2026-27-train${arg("train")}-test${arg("test")}` : "2026-27-quick";
      title = "2026/27 quick check (sanity check, small sample)";
    } else {
      ds = await pastDataset(season, arg("prev") ?? "2024-25");
      const tr = range(arg("train") ?? "1-3");
      splits = [{ name: "custom", trainEnd: Math.max(...tr), testGws: range(arg("test") ?? "4-5") }];
      name = `${season}-train${arg("train")}-test${arg("test")}`;
      title = `${season} custom split`;
    }
  }

  console.log(`Running ${splits.length} split(s)…`);
  const recs = splits.flatMap((s) => runSplit(ds, s));
  const xps = recs.filter((r) => r.fplXp !== null);
  const notes: string[] = [];
  if (xps.length && xps.filter((r) => r.fplXp === 0).length / xps.length > 0.5) {
    // The 2025/26 dataset's xP column is mostly zeros, so it isn't a fair baseline.
    for (const r of recs) r.fplXp = null;
    notes.push(
      "_Note: FPL's own xP in this dataset is mostly zeros (not recorded for most player-gameweeks), so it's left out as a baseline._",
      "",
    );
  }
  const extra = [...notes, ...(arg("team") && !flag("walk") ? await squadSection(Number(arg("team")), recs) : [])];
  const { md, gate: g } = report(title, ds, splits, recs, extra);
  const dir = path.resolve(process.cwd(), "reports");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `backtest-${name}.md`), md);
  await writeFile(path.join(dir, `backtest-${name}.csv`), toCsv(recs));
  console.log(md.split("\n").slice(0, 40).join("\n"));
  console.log(`\nWrote reports/backtest-${name}.md (${recs.length} rows). Gate: ${g?.pass ? "PASS" : "FAIL"}`);
}

if (process.argv[1]?.endsWith("backtest.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
