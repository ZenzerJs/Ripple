# Roadmap and scope

The predecessor's temporal leakage correction and separate daily variance study are complete on its own branch. Ripple's first replay milestone is implemented and verified: 14 offline tests and Ruff pass, frozen historical replay is deterministic, and independent ledger, data and source-hash checks reconcile. It compares two fixed strategies and does not train or deploy a forecasting model.

Remaining milestones:

1. Integrate a separately evaluated five-session variance experiment with chronological splits, mature labels and a final evaluation period reserved before selection. The predecessor has already examined SPY/AAPL outcomes across 2016–2026; disclose that exposure.
2. Compare forecasts through the same fixed inverse-volatility allocation policy and trading schedule, alongside equal weight.
3. Search synchronized multi-asset return-block scenarios with a declared budget; recompute path features and keep search away from the final evaluation period.
4. Append forward decisions and input hashes before execution, then record outcomes separately.

The 2020 comparison is an accounting demonstration, not an untouched holdout or evidence of strategy utility. No broker, automated trading, dashboard, or claim of profitability is part of this milestone.
