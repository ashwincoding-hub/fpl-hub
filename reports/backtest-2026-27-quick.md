# Backtest: 2026/27 quick check (sanity check, small sample)

Model v1.0 · generated 2026-09-28T14:50:25.424Z · data: 2026/27 live FPL API

Splits: train GW1–3 → predict GW4, 5; train GW1–4 → predict GW5

Only data from before each predicted gameweek's deadline is used. Historical injury news isn't available, so the backtest can't use it (the live model does), which makes these numbers slightly pessimistic.

Baselines: **season average** = the player's average points per match so far; **last 3** = average of their last 3 matches. **FPL xP** = FPL's own expected points (only available for past seasons, next GW only).

## 1 gameweek ahead (1326 player-gameweeks)

All players:

| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |
|---|---|---|---|---|---|---|
| **FPL Hub model** | 1.26 | 2.18 | 2.02 | 0.689 | 15% | 0% |
| Season average | 1.25 | 2.33 | 2.28 | 0.682 | 20% | 0% |
| Last 3 | 1.23 | 2.32 | 2.29 | 0.692 | 25% | 50% |

Regular starters only (started 2+ of their last 3 matches; 445 player-gameweeks):

| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |
|---|---|---|---|---|---|---|
| **FPL Hub model** | 2.43 | 3.33 | 2.43 | 0.325 | 15% | 0% |
| Season average | 2.70 | 3.59 | 2.73 | 0.242 | 20% | 0% |
| Last 3 | 2.70 | 3.58 | 2.74 | 0.231 | 23% | 50% |

**Gate (next GW, all players — the criterion agreed before running):** ❌ FAIL — MAE -3% lower than the best baseline (need ≥10%), Spearman 0.689 vs best baseline 0.692 (need higher).

**Same gate on regular starters (added after the first run, because MAE across all ~700 players mostly rewards predicting 0 for bench players):** ❌ FAIL — MAE 10% lower than the best baseline (need ≥10%), Spearman 0.325 vs best baseline 0.242 (need higher).

## 2 gameweeks ahead (667 player-gameweeks)

All players:

| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |
|---|---|---|---|---|---|---|
| **FPL Hub model** | 1.30 | 2.25 | 2.03 | 0.647 | 15% | 0% |
| Season average | 1.32 | 2.46 | 2.35 | 0.633 | 10% | 0% |
| Last 3 | 1.32 | 2.46 | 2.35 | 0.633 | 10% | 0% |

Regular starters only (started 2+ of their last 3 matches; 221 player-gameweeks):

| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |
|---|---|---|---|---|---|---|
| **FPL Hub model** | 2.39 | 3.27 | 2.37 | 0.273 | 15% | 0% |
| Season average | 2.78 | 3.66 | 2.76 | 0.153 | 10% | 0% |
| Last 3 | 2.78 | 3.66 | 2.76 | 0.153 | 10% | 0% |

## By position (next gameweek)

| Pos | n | Model MAE | Season avg MAE | Last 3 MAE | Model bias (pred − actual) |
|---|---|---|---|---|---|
| GKP | 144 | 1.01 | 0.82 | 0.86 | -0.19 |
| DEF | 432 | 1.54 | 1.49 | 1.47 | -0.06 |
| MID | 593 | 1.12 | 1.18 | 1.15 | 0.03 |
| FWD | 157 | 1.24 | 1.23 | 1.22 | 0.04 |

## Minutes model (next gameweek)

Brier score: lower is better; 0.25 is a coin flip.

- P(plays at all): **0.115**
- P(plays 60+ minutes): **0.089**
- Points MAE when the player actually played 60+: **2.48**

## Biggest misses (next gameweek)

| GW | Player | Pos | Predicted | Actual | Minutes |
|---|---|---|---|---|---|
| 5 | Brobbey | FWD | 2.40 | 17 | 90 |
| 4 | Groß | MID | 3.64 | 17 | 90 |
| 5 | Semenyo | MID | 4.04 | 17 | 90 |
| 5 | Dasilva | DEF | 2.11 | 15 | 90 |
| 5 | Manzambi | MID | 0.56 | 13 | 71 |
| 5 | Schuster | DEF | 1.58 | 14 | 90 |
| 4 | Davis | DEF | 2.51 | 14 | 90 |
| 4 | Bogle | DEF | 4.04 | 15 | 82 |
| 4 | Schade | MID | 4.05 | 15 | 90 |
| 5 | Groß | MID | 3.51 | 14 | 90 |
| 4 | Belloumi | MID | 2.77 | 13 | 59 |
| 4 | Raya | GKP | 3.80 | 14 | 90 |
| 5 | Tarkowski | DEF | 4.66 | 14 | 90 |
| 4 | Emersonn | FWD | 2.75 | 12 | 62 |
| 5 | Rushworth | GKP | 2.02 | 11 | 90 |
