# FPL Hub

A free Fantasy Premier League planner. Enter your team ID to:

- **See your team on a pitch**, with projected points for each player over the next three gameweeks, your bank, free transfers and the deadline.
- **Try transfers, substitutions and chips.** Projected totals, bank and hits update as you go, and replacements come as a sortable list.
- **Track price changes.** See who's closest to a rise or fall, the net transfers per hour, and when the change is expected.
- **Shortlist players.** Shortlisted players about to rise, and squad players about to fall, are highlighted.
- **Get transfer suggestions.** The best 1–2 transfer moves over a 1–6 GW horizon, compared with rolling the transfer, plus a chip radar.

Not affiliated with the Premier League or Fantasy Premier League. Personal, non-commercial project.

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # unit tests
npm run lint && npm run typecheck
```

| Command | What it does |
|---|---|
| `npm run projections` | Rebuilds `src/data/projections.json` from the live FPL API (about 2 minutes on the first run, cached for 6 h in `.cache/`) |
| `npm run backtest -- --quick` | This season: train on GW1–3, predict GW4–5; then train on GW1–4, predict GW5 |
| `npm run backtest -- --walk` | Last season (2025/26) walk-forward over GW5–38: the main accuracy check |
| `npm run backtest -- --season 2026-27 --train 1-4 --test 5-6 --team <id>` | Any custom split, optionally scoring your own squad |
| `npm run tune` | Grid-searches the model's parameters on the 2025/26 walk-forward |

Reports are written to `reports/`. No environment variables or secrets are needed.

## How it works

```
GitHub Actions (twice daily) ── FPL API ──► model ──► src/data/projections.json ──► commit ──► Vercel redeploy
Browser ──► Next.js API routes on Vercel ──► FPL API (bootstrap, fixtures, your team) — cached 1–5 min
```

- **The browser never calls FPL directly.** `/api/data` and `/api/team/[id]` build FPL URLs from fixed templates, reject anything that isn't a numeric team ID before making any request, and set CDN cache headers.
- **Projections** (`src/lib/model/project.ts`): for each player and fixture, expected points = the sum over each way of scoring of its probability × FPL points. That covers chance of starting and of playing 60+ minutes, goals and assists from xG/xA per 90 adjusted for the opponent, Poisson clean sheets and goals conceded from team xG ratings, saves, defensive contributions, bonus and cards. Early-season numbers are stabilised with last season's per-90 rates and team strength, from the [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League) dataset (MIT). The same code runs live and in backtests, and backtests only ever see data from before the gameweek being predicted.
- **Price changes** come straight from FPL. Since 2026/27, `bootstrap-static` publishes each player's progress toward a change, net transfers per hour, and projections for the next three price updates. That's why this project needs no database.
- **Planner and suggestions** (`src/lib/planner/`) are pure functions that run in the browser: best XI, auto-sub expectation, chips, hits, and a 1–2 transfer search.
- **Your shortlist and saved plans** live in your browser's localStorage. Nothing about you is stored on a server.

## Accuracy

See `reports/backtest-2025-26-walk-forward.md` and `reports/backtest-2026-27-quick.md`. In short, v1 beats the "season average" and "last 3 matches" baselines on RMSE and, among regular starters, on rank correlation. It does not meet the "10% lower MAE across all players" gate set before the first run. See the reports for why, and for what to try next.

## Deploying (free)

1. Push to GitHub (public repo, so Actions minutes are unlimited).
2. On vercel.com, sign in with GitHub, choose **Add New → Project**, import the repo, and keep the defaults. No env vars.
3. Optional: in Vercel, **Firewall → Rules**, add a rate limit on `/api/*`.
4. In GitHub, **Actions**: run **Refresh projections** once by hand to confirm FPL answers from GitHub's servers.

Free-tier notes: Vercel Hobby is non-commercial only. GitHub turns off scheduled workflows after 60 days without commits (the projections commit keeps this repo active during the season).
