# Phase 4A & 4B empirical comparison report

**Snapshot provenance:**
- Snapshot path (private, ignored): `data/snapshots/2016-2026`
- Provider: Yahoo Finance (`yfinance 1.8.0`), retrieved `2026-11-06T01:12:20.582078+00:00`
- Universe: `SPY, IEF, GLD, VNQ` (`2,727` validated `XNYS` sessions each, `2016-01-04` through `2026-11-04`, zero missing bars)
- Raw CSV SHA-256: `a3cc5ded92e4a79ce907a5493befa614eef8b6d9a9613feb1afc533f8834729a`
- Normalized CSV SHA-256: `6cbb93460e1241a164685d658bc5100382283cc86d74dfd7ac1af1e5211dc133`
- Frozen forecast bundle (`artifacts/forecasts/2016-2026/forecasts.csv`) SHA-256: `28702a2907127af8626312713476ba27a61d365c0e5acb8f00260c648d68faec`

## 1. Full sample (`2019-02-13` through `2026-11-04`, 389 scheduled 5-session decisions)

| Strategy | Final equity | Net return | CAGR | Ann. vol | Sharpe | Max DD | Turnover | Costs | Rebalances | Skipped | Max wt |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| buy_and_hold | $21,879.41 | 118.79% | 10.69% | 12.14% | 0.90 | -21.73% | 0.9995 | $5.00 | 1 | 0 | 43.07% |
| equal_weight_5d | $20,895.13 | 108.95% | 10.03% | 11.63% | 0.88 | -21.05% | 5.6459 | $38.89 | 389 | 0 | 28.33% |
| trailing_vol21_5d | $19,512.10 | 95.12% | 9.06% | 9.09% | 1.00 | -18.52% | 24.5677 | $169.46 | 389 | 0 | 43.70% |
| forecast_persistence5 | $19,484.28 | 94.84% | 9.04% | 9.10% | 1.00 | -18.85% | 85.0865 | $603.96 | 389 | 0 | 43.37% |
| forecast_rolling21 | $19,479.81 | 94.80% | 9.03% | 9.08% | 1.00 | -18.61% | 23.4699 | $161.71 | 389 | 0 | 43.69% |
| forecast_ewma094 | $19,516.36 | 95.16% | 9.06% | 9.04% | 1.00 | -18.93% | 17.4323 | $120.07 | 389 | 0 | 43.66% |
| forecast_garch11 | $19,531.43 | 95.31% | 9.07% | 8.97% | 1.01 | -18.68% | 24.6698 | $169.92 | 389 | 0 | 43.36% |
| forecast_har_ols | $19,171.01 | 91.71% | 8.81% | 8.95% | 0.99 | -18.91% | 24.9725 | $169.91 | 387 | 2 | 43.36% |
| forecast_ridge | $19,171.93 | 91.72% | 8.81% | 8.95% | 0.99 | -18.91% | 24.9540 | $169.80 | 387 | 2 | 43.36% |
| forecast_random_forest | $18,584.40 | 85.84% | 8.37% | 9.19% | 0.92 | -19.24% | 59.7677 | $402.32 | 389 | 0 | 43.31% |
| forecast_ridge_extended | $18,715.21 | 87.15% | 8.47% | 8.97% | 0.95 | -18.32% | 52.0211 | $357.36 | 356 | 33 | 43.33% |

*(Note: target weights at each rebalance are capped at `40.00%`; `Max wt` reflects end-of-day mark-to-market drift between 5-session rebalances.)*

## 2. Five-session variance forecast accuracy (`2019-02-12` through `2026-11-04`, 4 ETFs)

| Model | OK count | Invalid (`<=0`/NaN) | Nonconverged | Raw MAE | Raw RMSE | Raw QLIKE | Common MAE | Common QLIKE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| persistence5 | 1556 | 0 | 0 | 0.00009866 | 0.00043436 | -8.1454 | 0.00009837 | -8.1430 |
| rolling21 | 1556 | 0 | 0 | 0.00009710 | 0.00042350 | -8.5032 | 0.00008663 | -8.5183 |
| ewma094 | 1556 | 0 | 0 | 0.00009338 | 0.00040437 | -8.5430 | 0.00008464 | -8.5568 |
| garch11 | 1556 | 0 | 0 | 0.00008595 | 0.00038474 | -8.5545 | 0.00008525 | -8.5652 |
| har_ols | 1554 | 2 | 0 | 0.00011955 | 0.00093029 | 19205.7358 | 0.00012188 | -8.5552 |
| ridge | 1554 | 2 | 0 | 0.00011931 | 0.00092619 | 19205.7358 | 0.00012164 | -8.5552 |
| random_forest | 1556 | 0 | 0 | 0.00012287 | 0.00055992 | -8.4437 | 0.00011207 | -8.4580 |
| ridge_extended | 1517 | 39 | 0 | 0.00013701 | 0.00125208 | 3497361.5026 | 0.00013637 | -8.0511 |

## 3. Post-2022 subperiod (`2023-01-04` through `2026-11-04`, 193 scheduled 5-session decisions)

| Strategy | Final equity | Net return | CAGR | Ann. vol | Sharpe | Max DD | Turnover | Costs | Rebalances | Skipped |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| buy_and_hold | $16,718.32 | 67.18% | 14.39% | 11.01% | 1.28 | -10.57% | 0.9995 | $5.00 | 1 | 0 |
| equal_weight_5d | $16,410.47 | 64.10% | 13.84% | 10.04% | 1.34 | -9.09% | 3.2048 | $19.80 | 193 | 0 |
| trailing_vol21_5d | $15,627.82 | 56.28% | 12.39% | 8.32% | 1.45 | -8.42% | 12.2670 | $76.00 | 193 | 0 |
| forecast_persistence5 | $15,632.56 | 56.33% | 12.40% | 8.38% | 1.44 | -7.84% | 43.9552 | $280.37 | 193 | 0 |
| forecast_rolling21 | $15,585.13 | 55.85% | 12.31% | 8.31% | 1.44 | -8.40% | 11.7233 | $72.45 | 193 | 0 |
| forecast_ewma094 | $15,583.73 | 55.84% | 12.31% | 8.28% | 1.44 | -8.35% | 9.0849 | $55.76 | 193 | 0 |
| forecast_garch11 | $15,429.27 | 54.29% | 12.02% | 8.36% | 1.40 | -8.35% | 11.5272 | $69.96 | 193 | 0 |
| forecast_har_ols | $15,434.19 | 54.34% | 12.03% | 8.39% | 1.40 | -8.30% | 11.9333 | $72.15 | 193 | 0 |
| forecast_ridge | $15,434.39 | 54.34% | 12.03% | 8.39% | 1.40 | -8.30% | 11.9259 | $72.11 | 193 | 0 |
| forecast_random_forest | $15,090.65 | 50.91% | 11.37% | 8.47% | 1.31 | -8.45% | 29.8246 | $178.35 | 193 | 0 |
| forecast_ridge_extended | $15,465.78 | 54.66% | 12.09% | 8.51% | 1.38 | -8.39% | 27.2782 | $171.49 | 187 | 6 |

## 4. Key findings

1. **Risk reduction vs. total return:** All inverse-volatility policies (`trailing_vol21_5d` and `forecast_*`) lower portfolio annualized volatility by ~250–300 bps (`~9.0%` vs `11.63%` for `equal_weight_5d`) and improve Sharpe ratio (`1.00–1.01` vs `0.88`), because they allocate near the `40%` cap to `IEF` (`38.5–39.7%` mean weight). During strong equity/gold rallies, that bond overweight reduces cumulative dollar return relative to `equal_weight_5d` and `buy_and_hold`.
2. **Statistical vs. ML forecasters after costs:** `garch11` achieves the best forecast MAE/RMSE/QLIKE and highest final equity (`$19,531.43`) and Sharpe (`1.01`) among forecast-driven policies in the 2019–2026 sample, while `ewma094` achieves nearly identical utility (`$19,516.36`, Sharpe `1.00`) with the lowest turnover (`17.43`) and lowest transaction costs (`$120.07`). Supervised ML models (`ridge`, `random_forest`, `ridge_extended`) do **not** improve portfolio utility over `trailing_vol21_5d`, `ewma094`, or `garch11`; `random_forest` incurs `3.4x` the turnover of `ewma094` (`$402.32` in fees), directly eroding net returns.
3. **Explicit failure handling:** Unconstrained linear models (`har_ols`, `ridge`, `ridge_extended`) emit negative variance predictions during post-spike volatility mean reversion (`2` asset-dates for `har_ols`/`ridge` after the March 2020 COVID shock, `39` asset-dates across `33` decision sessions for `ridge_extended`). Rather than silently clipping or crashing, the adapter classifies these as `status="invalid"` while retaining `raw_prediction`, and policy `(a)` skips those rebalance decisions and retains prior holdings.
