# Architecture

A provider (`ripple.data.provider`) acquires an immutable raw response and normalized snapshot; replay consumes only verified local data. A validated `XNYS` market environment (`ripple.data.market`) exposes bounded close-to-close returns, while strategies output target weights or retain holdings. Execution (`ripple.simulation.replay`) applies next-open fills and `5.0` bps fees to a self-financing cash-and-units ledger.

## Module separation of concerns

- `ripple.data`: Validated `XNYS` calendar alignment, conservative next-midnight NY availability timestamps, and SHA-256 verified local snapshots. Never fills missing dates with future observations.
- `ripple.forecasts`: Point-in-time five-session ahead variance forecasters (`models.py`), immutable forecast and decision contracts (`schema.py`), and timestamp/status validation plus frozen artifact bundle I/O (`adapter.py`). Never reads portfolio outcomes or future returns during prediction, and never silently clips negative or nonfinite predictions.
- `ripple.policies`: Pure fixed allocation policy (`allocation.py`) mapping positive daily variance forecasts `v_i` to inverse-volatility weights (`1 / sqrt(v_i)`) with an iterative `40%` per-asset cap and predeclared `skip_retain` / `fallback_rolling21` handling for invalid forecasts.
- `ripple.strategies`: Forecast-free baselines (`BuyAndHold`, `MonthlyEqualWeight`, `EqualWeight5Session`, `TrailingVol21FiveSession`) and `ForecastPolicyStrategy` bridging frozen `VarianceForecast` bundles into `replay()`.
- `ripple.evaluation`: Base replay reporting (`report.py`) and Phase 4B forecast-to-decision comparison, drawdown attribution, concentration metrics, and dependence-aware moving-block bootstrap inference (`comparison.py`).
- `ripple.stress`: Synchronized multi-asset circular OHLC block bootstrap (`bootstrap.py`), empirical realism screening (`realism.py`), and budgeted relative failure search (`search.py`) that recomputes path features, forecasts, allocations, and replays on every candidate path.
- `ripple.ledger`: Append-only hash-chained JSONL forward decision ledger (`forward.py`) enforcing commit-before-outcome, retry idempotence, missed-run logging, and tamper verification.
