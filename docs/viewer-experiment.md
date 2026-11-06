# Label-maturity experiment

The viewer compares two training-window rules in a controlled reimplementation.
It does not execute ML Stock Simulator and does not measure the effect of fixing
that project's entire pipeline. The monthly experiment is separate from Ripple's
four-ETF, five-session variance and portfolio experiments.

## Rules

At monthly forecast row `t`, neither variant trains on row `t`:

- **Unpurged reference** (`original` in legacy JSON): trains on prior feature-valid
  rows, including `h - 1` prior rows with immature `h`-month return labels.
- **Matured-label** (`corrected`): further requires `i + h <= t`. Both use the same
  features, models, scaling procedure, and input snapshot.

Features are 1-, 3-, and 6-month returns and the standard deviation of six monthly
returns. An incomplete final month is excluded using the XNYS session calendar.
Models are a simple AR(1)-style linear regression, ridge with alpha 1,
and a 15-tree Random Forest with maximum depth 3 and seed 42. Features are scaled
within each fit. These choices differ from the predecessor's features, ARIMA,
and model settings. Excluding the forecast row reproduces the historical bug's
timing boundary, not the original simulator's numerical results.

The prior export incorrectly included row `t` and its answer in the reference
fit. Its +2.41 percentage-point headline is withdrawn. Regenerated summaries
must be read from the new exports; the previous number is not retained as a
claim about ML Stock Simulator. Common-date comparisons exclude dates on which
either model lacks enough training labels. All-fold tables preserve skips.

## Reproduction and evidence

Use Python 3.12 and the locked environment:

```powershell
uv sync --frozen
uv run ripple data fetch --output data/snapshots/viewer-refresh --start 2016-01-04 --end-exclusive 2026-11-05
uv run python scripts/refresh_viewer_experiment.py --snapshot data/snapshots/viewer-refresh
uv run pytest tests/test_viewer_export.py
```

Each run records the normalized dataset hash, base commit, and exporter source
hash. A fresh vendor download may revise adjusted history and is a new snapshot.
The refresh script preserves the independent portfolio/stress lab export.

“Export integrity checked” means the JSON matches its index hash. It does not
prove data provenance, statistical validity, an untouched holdout, or execution
of the predecessor. Temporal cutoffs remain simulation assumptions for adjusted
historical data. Overlapping targets imply correlated errors; no significance
claim is made. The tests check both strict forecast-row exclusion and prediction
invariance when only that forecast's future target changes.
