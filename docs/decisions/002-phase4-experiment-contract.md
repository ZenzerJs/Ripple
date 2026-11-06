# Decision 002: Phase 4 forecast-to-policy experiment contract

**Status:** Frozen before Phase 4B portfolio utility evaluation.

1. **Universe:** Fixed at `SPY, IEF, GLD, VNQ` (matching Decision 001).
2. **Execution convention:** Preserve Phase 3 next-session adjusted open fills (`execute()` in `src/ripple/simulation/replay.py`) with `5.0` bps transaction costs and `$10,000.00` starting cash. Do not introduce a second accounting engine.
3. **Decision cadence:** Every fifth `XNYS` exchange session (`step = 5`) on the shared candidate schedule anchored at index `21 + min_train + 5`. Initial portfolio entry occurs on the first execution session immediately following the first candidate decision session.
4. **Allocation formula:** Inverse volatility (`1 / sqrt(v_i)`) normalized with an iterative `40%` per-asset weight cap (`max_weight = 0.40`, `excess_rule = "redistribute"`).
5. **Invalid forecast policy:** Policy **(a) skip and retain** (`invalid_policy = "skip"`). If any of the four ETFs has a non-`ok` status or non-positive variance forecast (`v_i <= 0`, such as negative predictions from `ridge_extended`), no rebalance order is emitted on that session (`decide()` returns `None`), existing unit holdings are retained, and the skip event is recorded in the decision audit log.
6. **Comparators:** Compare all eight variance forecasters (`persistence5`, `rolling21`, `ewma094`, `garch11`, `har_ols`, `ridge`, `random_forest`, `ridge_extended`) against `buy_and_hold`, `equal_weight_5d` (every-fifth-session equal weight), and `trailing_vol21_5d` (every-fifth-session inverse 21-day sample volatility computed from `Observation.returns`).
7. **Block-bootstrap inference:** Report moving-block bootstrap 95% confidence intervals (`block_length = 10` sessions, `n_resamples = 500`, `seed = 42`) for annualized active return relative to `equal_weight_5d` to account for serial dependence across overlapping multi-session holding periods.

