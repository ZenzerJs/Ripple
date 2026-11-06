# Ripple — Reproducible Portfolio Strategy Research & Stress-Testing Laboratory

Ripple is an auditable, offline portfolio replay and stress-testing testbed built around one core research question:

> *Do five-session volatility forecasts produce better portfolio decisions than simple risk estimates or equal-weight allocation, after the same trading costs?*

Ripple is **not** a market-beating trading bot or brokerage execution engine. Returns, drawdowns, forecast errors, trading costs, invalid/nonconverged predictions, and negative or null results remain fully visible.

## Architecture & Milestones

1. **Phase 3 — Offline Replay Foundation (`ripple.simulation.replay`, `ripple.data`)**:
   - Four-ETF universe (`SPY, IEF, GLD, VNQ`) validated against the `XNYS` exchange calendar (`exchange_calendars`).
   - Self-financing adjusted-unit ledger with next-session adjusted open execution, `5.0` bps per-side transaction costs, and zero look-ahead.
2. **Phase 4A — Four-ETF Five-Session Variance Forecasts (`ripple.forecasts`)**:
   - Point-in-time five-session ahead mean squared log-return forecasters (`persistence5`, `rolling21`, `ewma094`, `garch11`, `har_ols`, `ridge`, `random_forest`, `ridge_extended`).
   - Strict label maturity (`training_last_label_at_utc <= as_of_utc`), train-only feature scaling, and explicit `status` tracking (`ok`, `invalid`, `nonconverged`, `unavailable`, `insufficient_mature_labels`, `failed`) while retaining unmodified `raw_prediction` values.
3. **Phase 4B — Fixed-Policy Portfolio Utility Comparison (`ripple.policies`, `ripple.strategies.forecast_policy`, `ripple.evaluation.comparison`)**:
   - Maps positive daily variance forecasts `v_i` to inverse-volatility weights (`1 / sqrt(v_i)`) with an iterative `40%` per-asset weight cap and predeclared `skip_retain` handling for invalid/negative variance predictions.
   - Evaluates all eight forecasters against `buy_and_hold`, `equal_weight_5d`, and `trailing_vol21_5d` under identical next-open fills and `5.0` bps fees, with dependence-aware moving-block bootstrap confidence intervals.
4. **Phase 5 — Constrained Multi-Asset Stress Fuzzer (`ripple.stress`)**:
   - Synchronized circular block bootstrap of 4-asset daily return and intraday OHLC ratio vectors (`block_length in {5, 10, 21}`).
   - Empirical realism screen (`valid`, `borderline`, `rejected`) checking marginal volatility ratios, 1% tail quantiles, squared-return autocorrelation (volatility clustering), cross-asset correlation drift, and drawdown multiples before ranking relative strategy failures.
5. **Phase 6 — Prospective Forward-Decision Hash-Chained Ledger (`ripple.ledger.forward`)**:
   - Append-only JSONL hash-chained ledger (`run_scheduled -> data_snapshot_ready -> prediction_generated -> decision_committed -> execution_simulated -> outcome_finalized`) enforcing commit-before-outcome, retry idempotence, and tamper detection.

## Windows / PowerShell Setup & Commands

```powershell
uv lock --check --cache-dir .uv-cache
uv sync --frozen --cache-dir .uv-cache
uv run --frozen --cache-dir .uv-cache pytest tests -q -p no:cacheprovider
uv run --frozen --cache-dir .uv-cache ruff check --no-cache src tests
uv run --frozen --cache-dir .uv-cache ripple demo
```

### Historical Snapshot Acquisition & Phase 3–6 Pipeline

```powershell
# 1. Acquire immutable Yahoo Finance snapshots (private, ignored under data/)
uv run --frozen --cache-dir .uv-cache ripple data fetch --output data/snapshots/2020 --start 2019-12-30 --end-exclusive 2021-01-01
uv run --frozen --cache-dir .uv-cache ripple data fetch --output data/snapshots/2016-2026 --start 2016-01-04 --end-exclusive 2026-11-05

# 2. Phase 3 accounting demonstration replay (2020)
uv run --frozen --cache-dir .uv-cache ripple backtest --config configs/historical-2020.toml

# 3. Phase 4A: Generate frozen four-ETF 5-session variance forecasts
uv run --frozen --cache-dir .uv-cache ripple forecast --snapshot data/snapshots/2016-2026 --output artifacts/forecasts/2016-2026

# 4. Phase 4B: Compare forecast policies and baselines on identical execution rules
uv run --frozen --cache-dir .uv-cache ripple compare-forecasts --snapshot data/snapshots/2016-2026 --forecasts artifacts/forecasts/2016-2026 --output artifacts/historical/phase4b-2019-2026

# 5. Phase 5: Run constrained multi-asset block-bootstrap stress search
uv run --frozen --cache-dir .uv-cache ripple stress --snapshot data/snapshots/2016-2026 --output artifacts/stress/2016-2026

# 6. Phase 6: Commit latest prospective decision to hash-chained forward ledger and verify
uv run --frozen --cache-dir .uv-cache ripple ledger commit-latest --forecasts artifacts/forecasts/2016-2026 --model ewma094 --ledger artifacts/forward/ledger.jsonl
uv run --frozen --cache-dir .uv-cache ripple ledger verify --ledger artifacts/forward/ledger.jsonl
```

## Documentation

- [Replay Contract (Decision 001)](docs/decisions/001-replay-contract.md)
- [Phase 4 Forecast-to-Policy Contract (Decision 002)](docs/decisions/002-phase4-experiment-contract.md)
- [Research Contract (Phase 4–6)](docs/research-contract.md)
- [Phase 4A & 4B Empirical Results (`2019–2026` & `2023–2026`)](docs/phase4b-results.md)
- [Phase 5 Constrained Stress Search Results](docs/phase5-stress-results.md)
- [Architecture](docs/architecture.md), [Data Contract](docs/data-contract.md), [Simulation Contract](docs/simulation-contract.md), [Research Protocol](docs/research-protocol.md), [Learning Guide](docs/learning-guide.md), and [Roadmap](docs/roadmap.md).
