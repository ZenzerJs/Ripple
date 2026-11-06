# Roadmap and scope

All planned milestones from the Ripple Implementation Plan are implemented and verified offline:

1. **Phase 3 Replay Foundation (`R-00`)**: Self-financing adjusted-unit ledger, next-session open execution, `5.0` bps transaction costs, `XNYS` session validation, and deterministic `2020` accounting reconciliation.
2. **Phase 4A Four-ETF Variance Forecast Integration (`R-01`, `R-02`, `R-03`)**: Point-in-time five-session squared log-return variance forecasters (`persistence5`, `rolling21`, `ewma094`, `garch11`, `har_ols`, `ridge`, `random_forest`, `ridge_extended`) across `SPY, IEF, GLD, VNQ` with strict label maturity (`<= as_of_utc`) and explicit invalid/nonconverged status tracking.
3. **Phase 4B Fixed-Policy Portfolio Utility Comparison (`R-04`, `R-05`, `R-06`)**: Identical `40%`-capped inverse-volatility policy (`1 / sqrt(v_i)`) and `skip_retain` invalid-forecast handling compared against `buy_and_hold`, `equal_weight_5d`, and `trailing_vol21_5d` under identical execution and cost rules (`docs/phase4b-results.md`).
4. **Phase 5 Constrained Multi-Asset Stress Fuzzer (`R-07`, `R-08`)**: Synchronized multi-asset OHLC block bootstrap (`block_length in {5, 10, 21}`), empirical realism screen (`valid`, `borderline`, `rejected`), and budgeted relative failure search with full path recomputation (`docs/phase5-stress-results.md`).
5. **Phase 6 Prospective Forward-Decision Ledger (`R-09`)**: Append-only hash-chained JSONL ledger (`ripple.ledger.forward`) recording committed decisions before outcomes, missed runs, and cryptographic chain verification.

Note: Historical evaluations overlapping `2016–2026` are exploratory historical research (as `SPY` 2016–2026 was previously inspected in the predecessor volatility study and `2020` in Phase 3). No brokerage connection, live auto-trading, or claim of guaranteed market outperformance is made.
