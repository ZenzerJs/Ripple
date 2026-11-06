"""Offline unit tests for Phase 5 synchronized block bootstrap, realism screen, and search."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from ripple.data.market import SYMBOLS, validate
from ripple.forecasts import models as fm
from ripple.stress.bootstrap import generate_block_bootstrap_path
from ripple.stress.realism import RealismThresholds, screen_path_realism
from ripple.stress.search import run_stress_search, write_stress_report


def _make_reference_frame(n: int = 100) -> pd.DataFrame:
    cal = fm.xc.get_calendar("XNYS", start="2019-01-02", end="2025-12-31")
    dates = cal.sessions[:n]
    idx = np.arange(len(dates), dtype=float)
    # Create clustered volatility envelope so squared-return autocorrelation is positive
    vol_env = 1.0 + 0.8 * np.sin(idx / 12.0) ** 2
    common_shock = 0.004 * np.sin(idx / 5.0) * vol_env
    rows = []
    for i, sym in enumerate(SYMBOLS):
        idiosyncratic = 0.002 * np.cos((idx + i * 4) / 7.0) * vol_env
        sign = -0.6 if sym == "IEF" else 1.0
        rets = 0.0003 + sign * common_shock + idiosyncratic
        closes = (100.0 + 10.0 * i) * np.exp(np.cumsum(rets))
        for d, c in zip(dates, closes):
            rows.append(
                {
                    "session": d.strftime("%Y-%m-%d"),
                    "symbol": sym,
                    "open": float(c * 0.999),
                    "high": float(c * 1.005),
                    "low": float(c * 0.995),
                    "close": float(c),
                    "adjusted_close": float(c),
                }
            )
    return pd.DataFrame(rows)


def test_synchronized_block_bootstrap_preserves_ohlc_and_cross_asset_alignment():
    ref = _make_reference_frame(90)
    path1, meta1 = generate_block_bootstrap_path(ref, block_length=10, seed=101)
    path2, meta2 = generate_block_bootstrap_path(ref, block_length=10, seed=101)
    pd.testing.assert_frame_equal(path1, path2)
    assert meta1 == meta2

    # Validated against XNYS calendar and OHLC constraints
    dates = sorted(path1["session"].unique())
    validate(path1, dates[0], dates[-1])

    # Verify cross-asset return synchronization: each resampled day t matches historical day k
    ref_piv = ref.pivot(index="session", columns="symbol", values="close").reindex(columns=SYMBOLS)
    ref_gross = (ref_piv / ref_piv.shift(1)).dropna().to_numpy(dtype=float)

    cand_piv = path1.pivot(index="session", columns="symbol", values="close").reindex(
        columns=SYMBOLS
    )
    cand_gross = (cand_piv / cand_piv.shift(1)).dropna().to_numpy(dtype=float)

    for row in cand_gross:
        # Must match at least one historical joint 4-asset return vector
        diffs = np.max(np.abs(ref_gross - row), axis=1)
        assert float(np.min(diffs)) < 1e-10


def test_realism_screen_distinguishes_valid_borderline_and_rejected_paths():
    ref = _make_reference_frame(110)
    # Reference path against itself is strictly valid
    verdict_self = screen_path_realism(ref, ref)
    assert verdict_self.verdict == "valid"

    # Block-bootstrapped path with relaxed drawdown multiple is valid
    cand, _ = generate_block_bootstrap_path(ref, block_length=15, seed=101)
    verdict_ok = screen_path_realism(
        cand, ref, thresholds=RealismThresholds(max_drawdown_multiple=3.0, borderline_drawdown_multiple=2.5)
    )
    assert verdict_ok.verdict in ("valid", "borderline")

    # Borderline threshold test when drawdown multiple is between borderline and max
    verdict_border = screen_path_realism(
        cand,
        ref,
        thresholds=RealismThresholds(
            borderline_corr_abs_diff=0.00001,
            max_corr_abs_diff=0.90,
            max_drawdown_multiple=5.0,
            borderline_drawdown_multiple=4.0,
        ),
    )
    assert verdict_border.verdict == "borderline"

    # Distort SPY volatility by 3x -> must be rejected
    distorted = cand.copy()
    spy_mask = distorted["symbol"] == "SPY"
    spy_closes = distorted.loc[spy_mask, "close"].to_numpy(dtype=float)
    spy_rets = np.diff(np.log(spy_closes), prepend=0.0) * 3.0
    bad_closes = spy_closes[0] * np.exp(np.cumsum(spy_rets))
    distorted.loc[spy_mask, "close"] = bad_closes
    distorted.loc[spy_mask, "adjusted_close"] = bad_closes
    distorted.loc[spy_mask, "open"] = bad_closes * 0.999
    distorted.loc[spy_mask, "high"] = bad_closes * 1.01
    distorted.loc[spy_mask, "low"] = bad_closes * 0.99

    verdict_bad = screen_path_realism(distorted, ref)
    assert verdict_bad.verdict == "rejected"
    assert any("vol_ratio_out_of_bounds:SPY" in r for r in verdict_bad.reasons)


def test_budgeted_stress_search_recomputes_path_features_and_writes_report(tmp_path: Path):
    ref = _make_reference_frame(95)
    out = run_stress_search(
        ref,
        block_lengths=(5, 10),
        search_seeds=(11, 12),
        validation_seeds=(21,),
        models=("rolling21", "ewma094", "ridge"),
        min_train=30,
        window=60,
        step=5,
        target_strategy="forecast_ridge",
    )
    assert out["budget"]["total_scenarios_evaluated"] == 6
    assert out["budget"]["search_scenarios"] == 4
    assert out["budget"]["validation_scenarios"] == 2
    assert len(out["scenarios"]) == 6
    assert "forecast_ridge" in out["strategy_failure_profiles"]

    report_dir = tmp_path / "stress_out"
    manifest = write_stress_report(out, report_dir, dataset_sha256="ref_sha")
    assert (report_dir / "stress_report.md").exists()
    assert (report_dir / "scenarios.csv").exists()
    assert (report_dir / "manifest.json").exists()
    assert (report_dir / "worst_failure_case" / "resampled_path.csv").exists()
    assert manifest["budget"]["total_scenarios_evaluated"] == 6
    report_text = (report_dir / "stress_report.md").read_text(encoding="utf-8")
    assert "failure case within this synchronized block-bootstrap scenario family" in report_text
