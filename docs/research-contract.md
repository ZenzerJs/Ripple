# Research contract (Phase 4–6)

## 1. Core research question

*Do five-session volatility forecasts produce better portfolio decisions than simple risk estimates or equal-weight allocation, after the same trading costs?*

Ripple is a reproducible research and stress-testing testbed, not a market-beating trading bot. Returns, drawdowns, forecast errors, trading costs, invalid/nonconverged predictions, and negative/null results are reported transparently without selective filtering.

## 2. Frozen universe and data provenance

- **Universe:** `SPY` (US large-cap equities), `IEF` (7–10 Year US Treasuries), `GLD` (gold bullion), `VNQ` (US REITs). Chosen before Phase 4 forecast comparison to match the Phase 3 replay universe (`src/ripple/data/market.py`).
- **Acquisition:** Yahoo Finance daily bars (`auto_adjust=False, actions=True, repair=False, keepna=True, ignore_tz=True`). Raw OHLC is multiplied by `Adj Close / Close` to form a total-return unit approximation; dividends and splits are embedded in adjusted prices and never paid separately as cash.
- **Calendar:** Validated `XNYS` exchange-session calendar (`exchange_calendars`). Missing sessions are never compressed or forward-filled across time or across assets.
- **Availability boundary:** A completed session `t` is conservatively available at midnight `America/New_York` at the start of the next calendar day, converted to UTC (`as_of_utc`).
- **Prior inspection disclosure:** The predecessor repository inspected `SPY` and `AAPL` five-session variance forecasts across `2016–2026`, and Ripple Phase 3 inspected `2020` accounting for `SPY, IEF, GLD, VNQ`. Historical evaluations overlapping `2016–2026` are therefore **exploratory historical research**, not a pristine unseen holdout. We additionally report a predeclared post-2022 subperiod (`2023–2026`) alongside the full common sample, and treat Phase 6 prospective forward logging as the only true out-of-sample external validation.

## 3. Five-session variance forecast contract (Phase 4A)

- **Target:** Mean of the next five actual `XNYS` sessions' squared close-to-close log returns:
  `y[t] = mean(r[t+1 : t+6] ** 2)`, where `r[k] = log(close[k] / close[k-1])`.
- **Units:** Daily squared log-return (variance proxy, unannualized).
- **Candidate schedule:** Every fifth `XNYS` session (`step = 5`), anchored at zero-based session index `21 + min_train + 5` (`782` when `min_train = 756`).
- **Training maturity:** Supervised models fit only rows `i < t` in the trailing `1,260`-session window whose five-session target has matured by `as_of_utc(t)` (`maturity[i] <= as_of_utc(t)`, i.e. `i <= t - 5`), requiring at least `756` mature rows.
- **Models:**
  1. `persistence5`: 5-session trailing mean squared log return (`sq5`).
  2. `rolling21`: 21-session trailing mean squared log return (`sq21`).
  3. `ewma094`: Exponentially weighted moving average (`lambda = 0.94`) initialized at the start of the contiguous return suffix (up to `1,260` sessions).
  4. `garch11`: Zero-mean `GARCH(1,1)` with normal errors fitted to percentage log returns (`r * 100`), analytic 5-step mean forecast divided by `10,000`. Nonconvergence (`convergence_flag != 0`) is recorded as `status="nonconverged"`.
  5. `har_ols`: Ordinary least squares on `["sq1", "sq5", "sq21"]`.
  6. `ridge`: `StandardScaler` + `Ridge(alpha=1.0)` on `["sq1", "sq5", "sq21"]` (scaler fitted strictly on training rows).
  7. `random_forest`: `RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=1)` on `["sq1", "sq5", "sq21"]`.
  8. `ridge_extended`: Fixed ablation adding `["sq_lag1", "sq_lag2", "sq_lag9", "signed5", "signed21"]` with train-only `StandardScaler` + `Ridge(alpha=1.0)`.
- **Invalid/negative forecast handling:** Raw predictions are always retained in `raw_prediction`. Any non-finite (`NaN`/`Inf`) or non-positive (`<= 0`) variance prediction is assigned `status="invalid"` (`error="nonpositive_variance"` or `"nonfinite_prediction"`) and never silently clipped for portfolio weighting.

## 4. Fixed allocation policy and replay rules (Phase 4B)

- **Mapping:** For a decision session `t` where all four ETFs have `status == "ok"` and `v_i > 0`:
  - Compute daily volatility estimate `s_i = sqrt(v_i)`.
  - Compute inverse-volatility score `inv_s_i = 1.0 / s_i`.
  - Apply a predeclared `40%` maximum weight cap (`max_weight = 0.40`) via iterative proportional water-filling redistribution across uncapped assets (leaving remainder in cash only if `len(valid) * max_weight < 1.0`).
- **Missing/invalid forecast rule:** Predeclared policy **(a) skip and retain**: if any of the four ETFs has `status != "ok"` or `v_i <= 0` at decision session `t`, the portfolio skips rebalancing (`AllocationDecision.action = "skip_retain"`) and retains its existing holdings (or remains in cash if no initial trade has occurred), logging the skipped decision and reason.
- **Execution and costs:** Identical across all forecast strategies and baselines (`buy_and_hold`, `equal_weight_5d`, `trailing_vol21_5d`):
  - Initial capital: `$10,000.00` virtual cash per strategy.
  - Decision after session `t` close; execution at session `t + 1` adjusted open (`next-open` fill).
  - Transaction fee: `5.0` bps (`0.05%`) per side on traded notional; sells execute first, buys scale proportionally to available cash including fees; no leverage, no shorting, zero interest on cash.
