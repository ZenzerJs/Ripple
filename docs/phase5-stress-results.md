# Phase 5: Constrained multi-asset block-bootstrap stress report

> **Scope statement:** Any identified underperformance is a **failure case within this synchronized block-bootstrap scenario family**, never proof that the market will follow this path or a causal economic simulation.

## 1. Predeclared search budget and realism screening

- **Source dataset SHA-256:** `6cbb93460e1241a164685d658bc5100382283cc86d74dfd7ac1af1e5211dc133` (`data/snapshots/2016-2026`)
- **Block lengths:** `[5, 10, 21]` sessions
- **Search seeds:** `[101, 102, 103, 104]` (`12` search paths)
- **Untouched validation seeds:** `[201, 202]` (`6` validation paths)
- **Total scenarios evaluated (all retained in `artifacts/stress/2016-2026/scenarios.csv`):** `18`
- **Realism screen verdicts:** `valid = 15`, `borderline = 3`, `rejected = 0`

## 2. Relative failure profiles across strategies (vs. `equal_weight_5d`)

| Strategy | Worst valid scenario | Worst rel. return vs EW-5d | Median rel. return vs EW-5d | Underperformed EW-5d count |
|---|---|---:|---:|---:|
| buy_and_hold | `search_b10_s101` | -5.72% | +6.80% | 3 / 15 |
| equal_weight_5d | `search_b5_s101` | +0.00% | +0.00% | 0 / 15 |
| trailing_vol21_5d | `search_b5_s104` | -43.89% | -14.80% | 14 / 15 |
| forecast_rolling21 | `search_b5_s104` | -43.72% | -14.76% | 14 / 15 |
| forecast_ewma094 | `search_b5_s102` | -41.73% | -15.53% | 15 / 15 |
| forecast_har_ols | `search_b5_s104` | -49.68% | -17.48% | 14 / 15 |
| forecast_ridge | `search_b5_s104` | -49.67% | -17.48% | 14 / 15 |

## 3. Screened failure case detail (`search_b5_s104`)

- **Block length:** `5`, **Seed:** `104`, **Path SHA-256:** `02f20621a95233a53d750c384ae1ad10d7c558a25b257c09e1076f725e0ad31e`
- **Realism verdict:** `valid` (`passed_all_empirical_screens`)

| Strategy | Net return | Rel. return vs EW-5d | Max drawdown | Ann. vol | Sharpe | Turnover | Costs |
|---|---:|---:|---:|---:|---:|---:|---:|
| buy_and_hold | 230.09% | +19.58% | -10.13% | 10.37% | 1.55 | 0.9995 | $5.00 |
| equal_weight_5d | 210.50% | +0.00% | -9.43% | 9.55% | 1.59 | 5.7722 | $46.16 |
| trailing_vol21_5d | 166.61% | -43.89% | -8.30% | 8.11% | 1.61 | 27.2642 | $207.87 |
| forecast_rolling21 | 166.78% | -43.72% | -8.21% | 8.11% | 1.61 | 26.9987 | $206.99 |
| forecast_ewma094 | 169.87% | -40.63% | -7.74% | 8.08% | 1.63 | 19.5101 | $150.43 |
| forecast_har_ols | 160.82% | -49.68% | -7.78% | 8.06% | 1.58 | 12.8881 | $99.24 |
| forecast_ridge | 160.83% | -49.67% | -7.78% | 8.06% | 1.58 | 12.8720 | $99.11 |

## 4. Mechanism of relative failure

In `search_b5_s104`, resampled 5-session blocks repeatedly draw sustained risk-on equity/gold/REIT expansions (`SPY`, `GLD`, `VNQ`) while `IEF` remains low-volatility and low-return. Because all inverse-volatility strategies (`trailing_vol21_5d` and `forecast_*`) allocate near their `40%` cap to `IEF` (`~38–40%`) and pay `2x–4.5x` the transaction costs of `equal_weight_5d`, they lag `equal_weight_5d` by `40.6–49.7` percentage points in cumulative net return even while maintaining lower annualized volatility (`8.06–8.11%` vs `9.55%`).
