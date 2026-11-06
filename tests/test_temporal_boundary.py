"""Offline unit tests for multi-asset calendar alignment, maturity, and future perturbation."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ripple.data.market import SYMBOLS
from ripple.forecasts import models as fm


def _synthetic_multi_asset_frame(n: int = 120, start: str = "2019-01-02") -> pd.DataFrame:
    cal = fm.xc.get_calendar("XNYS", start=start, end="2025-12-31")
    dates = cal.sessions[:n]
    idx = np.arange(len(dates), dtype=float)
    rows = []
    for i, sym in enumerate(SYMBOLS):
        rets = 0.004 * np.sin((idx + i * 3) / 6.0) + 0.007 * np.cos((idx + i * 5) / 15.0) + 0.0005
        closes = (100.0 + 10.0 * i) * np.exp(np.cumsum(rets))
        for d, c in zip(dates, closes):
            rows.append(
                {
                    "session": d.strftime("%Y-%m-%d"),
                    "symbol": sym,
                    "open": c * 0.999,
                    "high": c * 1.005,
                    "low": c * 0.995,
                    "close": c,
                    "adjusted_close": c,
                }
            )
    return pd.DataFrame(rows)


def test_four_etf_shared_calendar_and_missing_date_no_compression_or_cross_fill():
    frame = _synthetic_multi_asset_frame(80)
    grids_full = fm.multi_asset_calendar_grids(frame, "2030-01-01T00:00:00Z")
    missing_session = grids_full["SPY"].index[30].strftime("%Y-%m-%d")

    # Drop one session for IEF only
    reduced = frame[~((frame["symbol"] == "IEF") & (frame["session"] == missing_session))].copy()
    grids = fm.multi_asset_calendar_grids(reduced, "2030-01-01T00:00:00Z")

    # All four assets must still share the exact 80-session XNYS index
    for sym in SYMBOLS:
        assert len(grids[sym]) == 80
        assert grids[sym].index.equals(grids_full["SPY"].index)

    # IEF missing date is NaN (no forward-fill), invalidating return at t, t+1 and target at t-5
    ief_grid = grids["IEF"]
    assert pd.isna(ief_grid.loc[pd.Timestamp(missing_session), "close"])
    assert pd.isna(ief_grid["return"].iloc[30])
    assert pd.isna(ief_grid["return"].iloc[31])
    _, target_ief, _ = fm.make_dataset(ief_grid)
    assert pd.isna(target_ief.iloc[25])

    # Other assets on that date remain unaffected
    assert pd.notna(grids["SPY"].loc[pd.Timestamp(missing_session), "close"])


def test_target_maturity_and_training_window_strictly_exclude_unmatured_labels():
    frame = _synthetic_multi_asset_frame(120)
    grid = fm.multi_asset_calendar_grids(frame, "2030-01-01T00:00:00Z")["SPY"]
    x, y, maturity = fm.make_dataset(grid)

    tp = 90
    cutoff = grid["available_at"].iloc[tp]
    idx = fm.training_indices(x, y, maturity, tp, cutoff, window=60)
    assert len(idx) > 0
    # Every training label must have matured on or before the decision cutoff
    assert (maturity.iloc[idx] <= cutoff).all()
    # Because target requires 5 future sessions, idx.max() can never exceed tp - 5
    assert idx.max() <= tp - 5
    assert idx.min() >= tp - 60 + 1


def test_future_perturbation_cannot_change_forecasts_and_scaler_fits_only_train(monkeypatch):
    original = _synthetic_multi_asset_frame(120)
    perturbed = original.copy()
    grids_orig = fm.multi_asset_calendar_grids(original, "2030-01-01T00:00:00Z")
    tp = 85
    pivot_session = grids_orig["SPY"].index[tp].strftime("%Y-%m-%d")

    # Multiply all prices strictly after pivot_session by 4.5x
    mask = perturbed["session"] > pivot_session
    for col in ("open", "high", "low", "close", "adjusted_close"):
        perturbed.loc[mask, col] *= 4.5

    recorded_fits: list[np.ndarray] = []
    orig_scaler = fm.StandardScaler

    class InspectScaler(orig_scaler):
        def fit(self, X, y=None, **kwargs):
            recorded_fits.append(np.asarray(X))
            return super().fit(X, y, **kwargs)

    monkeypatch.setattr(fm, "StandardScaler", InspectScaler)

    g1 = fm.multi_asset_calendar_grids(original, "2030-01-01T00:00:00Z")["SPY"]
    g2 = fm.multi_asset_calendar_grids(perturbed, "2030-01-01T00:00:00Z")["SPY"]
    x1, y1, m1 = fm.make_dataset(g1)
    x2, y2, m2 = fm.make_dataset(g2)
    cutoff = g1["available_at"].iloc[tp]
    i1 = fm.training_indices(x1, y1, m1, tp, cutoff, window=60)
    i2 = fm.training_indices(x2, y2, m2, tp, cutoff, window=60)
    np.testing.assert_array_equal(i1, i2)

    out1 = fm.fit_models(g1, x1, y1, tp, i1, min_train=30, window=60)
    out2 = fm.fit_models(g2, x2, y2, tp, i2, min_train=30, window=60)

    for model_name in fm.MODELS:
        assert out1[model_name]["status"] == out2[model_name]["status"]
        if out1[model_name]["prediction"] is not None:
            assert out1[model_name]["prediction"] == pytest.approx(
                out2[model_name]["prediction"], rel=1e-10, abs=1e-15
            )

    # Verify StandardScaler was fitted strictly on training indices i1
    assert len(recorded_fits) == 4
    np.testing.assert_allclose(recorded_fits[0], x1.iloc[i1][fm.BASE_FEATURES].to_numpy())
    np.testing.assert_allclose(
        recorded_fits[1], x1.iloc[i1][fm.BASE_FEATURES + fm.EXTRA_FEATURES].to_numpy()
    )


def test_multi_asset_forecast_grid_reproducibility_and_missing_bar_handling():
    frame = _synthetic_multi_asset_frame(95)
    # Remove one bar at candidate index for GLD to test unavailable status
    grids = fm.multi_asset_calendar_grids(frame, "2030-01-01T00:00:00Z")
    cand_session = grids["GLD"].index[21 + 30 + 5].strftime("%Y-%m-%d")
    reduced = frame[~((frame["symbol"] == "GLD") & (frame["session"] == cand_session))].copy()

    f1, df1, skip1, sum1 = fm.generate_multi_asset_forecasts(
        reduced,
        as_of="2030-01-01T00:00:00Z",
        data_sha256="hash1",
        min_train=30,
        window=60,
        step=5,
        models=fm.CORE_MODELS,
    )
    f2, df2, skip2, sum2 = fm.generate_multi_asset_forecasts(
        reduced,
        as_of="2030-01-01T00:00:00Z",
        data_sha256="hash1",
        min_train=30,
        window=60,
        step=5,
        models=fm.CORE_MODELS,
    )
    assert [x.record_hash() for x in f1] == [x.record_hash() for x in f2]
    assert sum1 == sum2
    assert skip1 == skip2

    # On cand_session, GLD must have status 'unavailable' while SPY, IEF, VNQ have 'ok'
    gld_cand = df1[(df1["forecast_session"] == cand_session) & (df1["asset"] == "GLD")]
    assert (gld_cand["status"] == "unavailable").all()
    spy_cand = df1[(df1["forecast_session"] == cand_session) & (df1["asset"] == "SPY")]
    assert (spy_cand["status"] == "ok").all()
