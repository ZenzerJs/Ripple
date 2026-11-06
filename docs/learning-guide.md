# Guided learning guide

1. Run the offline demo. Inspect the first four trades: fees reduce affordable notional, so each unit allocation is slightly below a frictionless quarter.
2. Compare daily allocations. Buy-and-hold keeps units while prices drift; monthly equal weight trades after its scheduled decision. Check cash, trade fees and equity against the ledger.
3. Read the timing and data contracts. Identify why a decision can use a completed close but not the next open, and why adjusted historical prices do not prove point-in-time availability.
4. Read the separate predecessor variance experiment. Its five-session average squared daily log-return target is a volatility proxy, not the portfolio's return. A forecast only becomes a portfolio decision after a separately specified allocation rule.
5. Before future model work, reserve a final evaluation period, use only matured labels and fit transformations on training rows. Compare baselines before examining a final holdout.
