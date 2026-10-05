# Backtest: 2025/26 walk-forward (main evidence)

Model v1.0 · generated 2026-09-28T14:50:03.933Z · data: 2025-26 (vaastav/Fantasy-Premier-League)

Splits: train GW1–4 → predict GW5, 6, 7; train GW1–5 → predict GW6, 7, 8; train GW1–6 → predict GW7, 8, 9; train GW1–7 → predict GW8, 9, 10; train GW1–8 → predict GW9, 10, 11; train GW1–9 → predict GW10, 11, 12; train GW1–10 → predict GW11, 12, 13; train GW1–11 → predict GW12, 13, 14; train GW1–12 → predict GW13, 14, 15; train GW1–13 → predict GW14, 15, 16; train GW1–14 → predict GW15, 16, 17; train GW1–15 → predict GW16, 17, 18; train GW1–16 → predict GW17, 18, 19; train GW1–17 → predict GW18, 19, 20; train GW1–18 → predict GW19, 20, 21; train GW1–19 → predict GW20, 21, 22; train GW1–20 → predict GW21, 22, 23; train GW1–21 → predict GW22, 23, 24; train GW1–22 → predict GW23, 24, 25; train GW1–23 → predict GW24, 25, 26; train GW1–24 → predict GW25, 26, 27; train GW1–25 → predict GW26, 27, 28; train GW1–26 → predict GW27, 28, 29; train GW1–27 → predict GW28, 29, 30; train GW1–28 → predict GW29, 30, 31; train GW1–29 → predict GW30, 31, 32; train GW1–30 → predict GW31, 32, 33; train GW1–31 → predict GW32, 33, 34; train GW1–32 → predict GW33, 34, 35; train GW1–33 → predict GW34, 35, 36; train GW1–34 → predict GW35, 36, 37; train GW1–35 → predict GW36, 37, 38

Only data from before each predicted gameweek's deadline is used. Historical injury news isn't available, so the backtest can't use it (the live model does), which makes these numbers slightly pessimistic.

Baselines: **season average** = the player's average points per match so far; **last 3** = average of their last 3 matches. **FPL xP** = FPL's own expected points (only available for past seasons, next GW only).

## 1 gameweek ahead (24810 player-gameweeks)

All players:

| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |
|---|---|---|---|---|---|---|
| **FPL Hub model** | 1.07 | 1.96 | 1.96 | 0.706 | 20% | 9% |
| Season average | 1.06 | 2.05 | 2.09 | 0.694 | 17% | 16% |
| Last 3 | 1.04 | 2.17 | 2.32 | 0.735 | 14% | 9% |

Regular starters only (started 2+ of their last 3 matches; 6946 player-gameweeks):

| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |
|---|---|---|---|---|---|---|
| **FPL Hub model** | 2.25 | 3.05 | 2.21 | 0.289 | 23% | 16% |
| Season average | 2.35 | 3.19 | 2.34 | 0.219 | 19% | 25% |
| Last 3 | 2.62 | 3.48 | 2.61 | 0.190 | 17% | 19% |

**Gate (next GW, all players — the criterion agreed before running):** ❌ FAIL — MAE -3% lower than the best baseline (need ≥10%), Spearman 0.706 vs best baseline 0.735 (need higher).

**Same gate on regular starters (added after the first run, because MAE across all ~700 players mostly rewards predicting 0 for bench players):** ❌ FAIL — MAE 4% lower than the best baseline (need ≥10%), Spearman 0.289 vs best baseline 0.219 (need higher).

## 2 gameweeks ahead (24909 player-gameweeks)

All players:

| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |
|---|---|---|---|---|---|---|
| **FPL Hub model** | 1.10 | 2.00 | 2.00 | 0.681 | 20% | 16% |
| Season average | 1.07 | 2.07 | 2.11 | 0.680 | 17% | 16% |
| Last 3 | 1.09 | 2.23 | 2.36 | 0.690 | 13% | 3% |

Regular starters only (started 2+ of their last 3 matches; 6948 player-gameweeks):

| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |
|---|---|---|---|---|---|---|
| **FPL Hub model** | 2.29 | 3.08 | 2.23 | 0.265 | 22% | 22% |
| Season average | 2.37 | 3.19 | 2.35 | 0.228 | 20% | 25% |
| Last 3 | 2.68 | 3.54 | 2.64 | 0.167 | 17% | 6% |

## 3 gameweeks ahead (25008 player-gameweeks)

All players:

| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |
|---|---|---|---|---|---|---|
| **FPL Hub model** | 1.13 | 2.02 | 2.02 | 0.660 | 19% | 3% |
| Season average | 1.09 | 2.09 | 2.13 | 0.666 | 16% | 16% |
| Last 3 | 1.14 | 2.29 | 2.40 | 0.652 | 13% | 3% |

Regular starters only (started 2+ of their last 3 matches; 6948 player-gameweeks):

| Predictor | MAE | RMSE | MAE (players who played) | Spearman | Top-20 hit | Captain in actual top 5 |
|---|---|---|---|---|---|---|
| **FPL Hub model** | 2.32 | 3.07 | 2.24 | 0.255 | 23% | 6% |
| Season average | 2.38 | 3.18 | 2.35 | 0.232 | 19% | 25% |
| Last 3 | 2.74 | 3.57 | 2.66 | 0.142 | 16% | 9% |

## By position (next gameweek)

| Pos | n | Model MAE | Season avg MAE | Last 3 MAE | Model bias (pred − actual) |
|---|---|---|---|---|---|
| GKP | 2858 | 0.70 | 0.63 | 0.60 | 0.12 |
| DEF | 8119 | 1.23 | 1.23 | 1.23 | 0.08 |
| MID | 11091 | 1.03 | 1.03 | 1.00 | 0.06 |
| FWD | 2742 | 1.13 | 1.12 | 1.13 | -0.00 |

## Minutes model (next gameweek)

Brier score: lower is better; 0.25 is a coin flip.

- P(plays at all): **0.095**
- P(plays 60+ minutes): **0.089**
- Points MAE when the player actually played 60+: **2.36**

_Note: FPL's own xP in this dataset is mostly zeros (not recorded for most player-gameweeks), so it's left out as a baseline._

## Biggest misses (next gameweek)

| GW | Player | Pos | Predicted | Actual | Minutes |
|---|---|---|---|---|---|
| 8 | Junior Kroupi | FWD | 0.67 | 24 | 148 |
| 9 | Micky van de Ven | DEF | 2.70 | 23 | 90 |
| 17 | Keane Lewis-Potter | DEF | 2.03 | 21 | 90 |
| 16 | Callum Hudson-Odoi | MID | 1.44 | 19 | 90 |
| 18 | Kevin Schade | MID | 3.30 | 20 | 90 |
| 32 | Konstantinos Mavropanos | DEF | 4.53 | 21 | 90 |
| 28 | Mikkel Damsgaard | MID | 1.89 | 18 | 90 |
| 25 | Cole Palmer | MID | 4.17 | 20 | 60 |
| 16 | Ibrahim Sangaré | MID | 2.24 | 18 | 90 |
| 32 | Mats Wieffer | MID | 2.58 | 18 | 90 |
| 12 | Eberechi Eze | MID | 4.63 | 20 | 90 |
| 14 | Cristian Romero | DEF | 1.70 | 17 | 90 |
| 35 | Taiwo Awoniyi | FWD | 0.78 | 16 | 90 |
| 18 | Patrick Dorgu | DEF | 1.81 | 17 | 90 |
| 16 | Malo Gusto | DEF | 2.86 | 18 | 90 |
