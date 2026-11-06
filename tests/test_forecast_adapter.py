"""Offline unit tests for forecast schema, adapter validation, and frozen bundle integrity."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pytest

from ripple.data.market import SYMBOLS
from ripple.forecasts.adapter import (
    align_asset_forecasts,
    classify_prediction,
    load_forecast_bundle,
    save_forecast_bundle,
    validate_forecast,
)
from ripple.forecasts.schema import VarianceForecast


def _make_forecast(
    asset: str = "SPY",
    model_id: str = "ridge",
    session: str = "2020-02-03",
    as_of: str = "2020-02-04T05:00:00+00:00",
    last_label: str = "2020-02-04T05:00:00+00:00",
    variance: float | None = 0.00012,
    status: str = "ok",
) -> VarianceForecast:
    return classify_prediction(
        asset=asset,
        model_id=model_id,
        forecast_session=session,
        as_of_utc=as_of,
        horizon_sessions=5,
        raw_prediction=variance,
        training_last_label_at_utc=last_label,
        data_sha256="abc123",
        model_config_sha256="cfg456",
        status=status,
        training_cutoff_session="2020-01-27",
        train_count=756,
        regime="typical_recent_variance",
    )


def test_negative_zero_nan_inf_variance_flagged_invalid_while_retaining_raw():
    neg = _make_forecast(variance=-0.000045, status="ok")
    assert neg.status == "invalid"
    assert neg.error == "nonpositive_variance"
    assert neg.raw_prediction == pytest.approx(-0.000045)
    assert neg.predicted_daily_variance == pytest.approx(-0.000045)

    zero = _make_forecast(variance=0.0, status="ok")
    assert zero.status == "invalid"
    assert zero.error == "nonpositive_variance"
    assert zero.raw_prediction == 0.0

    nan_f = _make_forecast(variance=float("nan"), status="ok")
    assert nan_f.status == "invalid"
    assert nan_f.error == "nonfinite_prediction"
    assert nan_f.predicted_daily_variance is None

    inf_f = _make_forecast(variance=float("inf"), status="ok")
    assert inf_f.status == "invalid"
    assert inf_f.error == "nonfinite_prediction"


def test_validate_forecast_rejects_future_as_of_and_immature_labels():
    valid = _make_forecast()
    checked = validate_forecast(
        valid,
        decision_cutoff_utc="2020-02-04T05:00:00Z",
        expected_session="2020-02-03",
    )
    assert checked.asset == "SPY"

    # Future forecast relative to decision cutoff must fail closed
    with pytest.raises(ValueError, match="Future forecast"):
        validate_forecast(
            valid,
            decision_cutoff_utc="2020-02-04T04:59:59Z",
            expected_session="2020-02-03",
        )

    # Training label maturing after forecast as_of_utc must fail closed
    immature = _make_forecast(
        as_of="2020-02-04T05:00:00Z",
        last_label="2020-02-05T05:00:00Z",
    )
    with pytest.raises(ValueError, match="Look-ahead violation"):
        validate_forecast(immature)

    # Naive timestamp must fail closed
    naive = VarianceForecast(
        asset="SPY",
        model_id="ridge",
        forecast_session="2020-02-03",
        as_of_utc=datetime(2020, 2, 4, 5, 0),
        horizon_sessions=5,
        predicted_daily_variance=0.0001,
        training_last_label_at_utc=None,
        data_sha256="abc",
        model_config_sha256="cfg",
        status="ok",
    )
    with pytest.raises(ValueError, match="timezone-aware"):
        validate_forecast(naive)


def test_validate_forecast_rejects_spoofed_ok_with_nonpositive_variance():
    spoofed = VarianceForecast(
        asset="SPY",
        model_id="ridge_extended",
        forecast_session="2020-02-03",
        as_of_utc=datetime(2020, 2, 4, 5, 0, tzinfo=timezone.utc),
        horizon_sessions=5,
        predicted_daily_variance=-0.0001,
        training_last_label_at_utc=datetime(2020, 2, 4, 5, 0, tzinfo=timezone.utc),
        data_sha256="abc",
        model_config_sha256="cfg",
        status="ok",
        raw_prediction=-0.0001,
    )
    with pytest.raises(ValueError, match="non-positive"):
        validate_forecast(spoofed)


def test_align_asset_forecasts_checks_four_etf_consistency():
    slice_forecasts = [_make_forecast(asset=sym) for sym in SYMBOLS]
    aligned = align_asset_forecasts(
        slice_forecasts,
        decision_session="2020-02-03",
        decision_cutoff_utc="2020-02-04T05:00:00Z",
        expected_model_id="ridge",
    )
    assert tuple(aligned.keys()) == SYMBOLS

    # Duplicate asset rejected
    with pytest.raises(ValueError, match="Duplicate"):
        align_asset_forecasts(
            slice_forecasts + [_make_forecast(asset="SPY")],
            decision_session="2020-02-03",
            decision_cutoff_utc="2020-02-04T05:00:00Z",
        )

    # Mismatched session rejected
    bad_session = [_make_forecast(asset="SPY", session="2020-02-04")] + [
        _make_forecast(asset=sym) for sym in SYMBOLS[1:]
    ]
    with pytest.raises(ValueError, match="Mismatched forecast_session"):
        align_asset_forecasts(
            bad_session,
            decision_session="2020-02-03",
            decision_cutoff_utc="2020-02-05T05:00:00Z",
        )

    # Inconsistent model_config_sha256 across assets rejected
    bad_cfg = [
        classify_prediction(
            asset="SPY",
            model_id="ridge",
            forecast_session="2020-02-03",
            as_of_utc="2020-02-04T05:00:00+00:00",
            horizon_sessions=5,
            raw_prediction=0.00012,
            training_last_label_at_utc="2020-02-04T05:00:00+00:00",
            data_sha256="abc123",
            model_config_sha256="other_cfg",
        )
    ] + [_make_forecast(asset=sym) for sym in SYMBOLS[1:]]
    with pytest.raises(ValueError, match="inconsistent model_config_sha256"):
        align_asset_forecasts(
            bad_cfg,
            decision_session="2020-02-03",
            decision_cutoff_utc="2020-02-04T05:00:00Z",
        )


def test_frozen_forecast_bundle_roundtrip_and_tamper_rejection(tmp_path: Path):
    records = [_make_forecast(asset=sym) for sym in SYMBOLS]
    df = pd.DataFrame([r.to_dict() for r in records])
    out = tmp_path / "bundle"
    manifest = save_forecast_bundle(
        out,
        config={"horizon_sessions": 5},
        inputs={"dataset_sha256": "abc123"},
        forecasts_df=df,
        skipped=[{"forecast_session": "2020-03-31", "reason": "target_unavailable"}],
    )
    assert manifest["row_count"] == 4
    loaded_records, loaded_df, loaded_manifest = load_forecast_bundle(out)
    assert len(loaded_records) == 4
    assert [r.record_hash() for r in loaded_records] == [r.record_hash() for r in records]
    assert len(loaded_df) == 4
    assert loaded_manifest["skipped_count"] == 1

    # Tampering with forecasts.csv must fail closed
    (out / "forecasts.csv").write_text("tampered\n", encoding="utf-8")
    with pytest.raises(ValueError, match="hash mismatch"):
        load_forecast_bundle(out)
