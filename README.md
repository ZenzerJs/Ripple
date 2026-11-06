# Ripple

A reproducible research lab for volatility forecasts, portfolio decisions, and strategy failures.

**Research question:** Do five-session volatility forecasts improve portfolio decisions after identical trading costs?

In the exploratory 2019–2026 comparison, supervised ML did not improve portfolio utility over simpler volatility baselines. Random Forest finished at $18,584 versus $19,516 for EWMA and $20,895 for equal weight, from $10,000 each. These historical results overlap previously inspected data and are not an untouched holdout or prospective record. [Full results](docs/phase4b-results.md).

## What is implemented

- Four-ETF replay: SPY, IEF, GLD, and VNQ; next-session adjusted-open execution; 5 basis points per side; self-financing cash and unit accounting.
- Eight variance forecasters, explicit label maturity, train-only preprocessing, and recorded invalid predictions.
- One 40%-capped inverse-volatility policy for controlled model comparisons.
- Synchronized block-bootstrap stress search, empirical screening, and separate search and validation seeds.
- Hash-chained decision-ledger primitives with retry and commit-before-outcome checks.
- A read-only Next.js research viewer with fold diagnostics, tables, and provenance details.

[Open viewer](https://zenzerjs.github.io/Ripple/) · [Architecture](docs/architecture.md) · [Research contract](docs/research-contract.md) · [Stress results](docs/phase5-stress-results.md)

## Viewer experiment

The monthly label-maturity case is a **controlled reimplementation**, separate from the portfolio study. The unpurged reference excludes the forecast row but includes immature prior labels; the matured-label variant removes them. It does not run or reproduce ML Stock Simulator's complete pipeline.

The previous reference mistakenly trained on the forecast row itself. Its +2.41 pp headline is withdrawn; regenerated exports provide the replacement measurements. “Export integrity checked” means file bytes match the index hash, not that data provenance or research claims have been independently verified. [Method and reproduction](docs/viewer-experiment.md).

## Run locally

Requires Python 3.12 and uv. Node.js 20+ is needed only for the viewer.

```powershell
uv sync --frozen
uv run pytest tests -q
uv run ruff check src tests scripts
uv run ripple demo
```

The demo is synthetic and works offline. Historical runs need a locally acquired snapshot; replay itself never downloads data.

```powershell
uv run ripple data fetch --output data/snapshots/2016-2026 --start 2016-01-04 --end-exclusive 2026-11-05
uv run ripple forecast --snapshot data/snapshots/2016-2026 --output artifacts/forecasts/2016-2026
uv run ripple compare-forecasts --snapshot data/snapshots/2016-2026 --forecasts artifacts/forecasts/2016-2026 --output artifacts/historical/phase4b-2019-2026
uv run ripple stress --snapshot data/snapshots/2016-2026 --output artifacts/stress/2016-2026
```

For the viewer:

```powershell
cd frontend
npm ci
npm run dev
```

Frontend checks: `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`. The browser suite covers both themes, mobile layout, fixtures, and fold inspection.

## Limits

Adjusted historical prices model total-return units, not executable ETF shares or archived point-in-time data vintages. Stress cases apply only to the declared resampling family. The ledger detects hash-chain inconsistencies but does not independently prove timestamps or continuous operation; existing historical commitments are demonstrations. No broker connection or real-money execution is implemented.

[Learning guide](docs/learning-guide.md) · [Roadmap](docs/roadmap.md) · [Predecessor project](https://github.com/ZenzerJs/ML-Stock-Simulator)
