"""Forecast adapter for timestamp validation, status classification, and frozen artifact I/O."""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import replace
from datetime import datetime
from pathlib import Path

import pandas as pd

from ripple.data.market import SYMBOLS
from ripple.forecasts.schema import VALID_STATUSES, VarianceForecast, parse_utc


def sha256_file(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def sha256_json(obj: object) -> str:
    encoded = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def classify_prediction(
    *,
    asset: str,
    model_id: str,
    forecast_session: str,
    as_of_utc: str | datetime,
    horizon_sessions: int,
    raw_prediction: float | None,
    training_last_label_at_utc: str | datetime | None,
    data_sha256: str,
    model_config_sha256: str,
    status: str = "ok",
    training_cutoff_session: str | None = None,
    train_count: int = 0,
    regime: str | None = None,
    error: str | None = None,
) -> VarianceForecast:
    """Create a VarianceForecast while preserving raw predictions and flagging invalid variance."""
    as_of = parse_utc(as_of_utc)
    last_label = (
        parse_utc(training_last_label_at_utc)
        if training_last_label_at_utc is not None
        else None
    )
    if status not in VALID_STATUSES:
        raise ValueError(f"Unsupported forecast status: {status}")
    effective_status = status
    effective_error = error
    effective_var = raw_prediction
    if effective_status == "ok":
        if raw_prediction is None or not math.isfinite(raw_prediction):
            effective_status = "invalid"
            effective_var = None
            effective_error = effective_error or "nonfinite_prediction"
        elif raw_prediction <= 0.0:
            effective_status = "invalid"
            effective_var = float(raw_prediction)
            effective_error = effective_error or "nonpositive_variance"
        else:
            effective_var = float(raw_prediction)
    return VarianceForecast(
        asset=asset,
        model_id=model_id,
        forecast_session=forecast_session,
        as_of_utc=as_of,
        horizon_sessions=int(horizon_sessions),
        predicted_daily_variance=effective_var,
        training_last_label_at_utc=last_label,
        data_sha256=data_sha256,
        model_config_sha256=model_config_sha256,
        status=effective_status,
        raw_prediction=raw_prediction,
        training_cutoff_session=training_cutoff_session,
        train_count=int(train_count),
        regime=regime,
        error=effective_error,
    )


def validate_forecast(
    forecast: VarianceForecast,
    *,
    decision_cutoff_utc: str | datetime | None = None,
    expected_session: str | None = None,
    expected_horizon: int = 5,
    expected_model_id: str | None = None,
) -> VarianceForecast:
    """Validate structural, temporal, and status invariants of a single VarianceForecast."""
    if forecast.asset not in SYMBOLS:
        raise ValueError(f"Unknown forecast asset: {forecast.asset}")
    if forecast.status not in VALID_STATUSES:
        raise ValueError(f"Invalid forecast status: {forecast.status}")
    if forecast.horizon_sessions != expected_horizon:
        raise ValueError(
            f"Expected horizon_sessions={expected_horizon}, got {forecast.horizon_sessions}"
        )
    if expected_model_id is not None and forecast.model_id != expected_model_id:
        raise ValueError(f"Mismatched model_id: {forecast.model_id} != {expected_model_id}")
    if expected_session is not None and forecast.forecast_session != expected_session:
        raise ValueError(
            f"Mismatched forecast_session: {forecast.forecast_session} != {expected_session}"
        )
    if not forecast.data_sha256 or not forecast.model_config_sha256:
        raise ValueError("Forecast must include non-empty data_sha256 and model_config_sha256")
    as_of = parse_utc(forecast.as_of_utc)
    last_label = (
        parse_utc(forecast.training_last_label_at_utc)
        if forecast.training_last_label_at_utc is not None
        else None
    )
    if last_label is not None and last_label > as_of:
        raise ValueError(
            f"Look-ahead violation: training_last_label_at_utc ({last_label.isoformat()}) "
            f"> as_of_utc ({as_of.isoformat()})"
        )
    if decision_cutoff_utc is not None:
        cutoff = parse_utc(decision_cutoff_utc)
        if as_of > cutoff:
            raise ValueError(
                f"Future forecast cannot be used at decision cutoff: "
                f"as_of_utc ({as_of.isoformat()}) > cutoff ({cutoff.isoformat()})"
            )
    if forecast.status == "ok":
        val = forecast.predicted_daily_variance
        if val is None or not math.isfinite(val) or val <= 0.0:
            raise ValueError(
                f"Forecast for {forecast.asset} has status 'ok' but non-positive or "
                f"non-finite variance: {val}"
            )
    return replace(forecast, as_of_utc=as_of, training_last_label_at_utc=last_label)


def align_asset_forecasts(
    forecasts: Sequence[VarianceForecast] | Mapping[str, VarianceForecast],
    *,
    decision_session: str,
    decision_cutoff_utc: str | datetime,
    expected_model_id: str | None = None,
    expected_horizon: int = 5,
) -> dict[str, VarianceForecast]:
    """Validate and align four-ETF forecasts for a single decision session."""
    items = list(forecasts.values()) if isinstance(forecasts, Mapping) else list(forecasts)
    aligned: dict[str, VarianceForecast] = {}
    for item in items:
        checked = validate_forecast(
            item,
            decision_cutoff_utc=decision_cutoff_utc,
            expected_session=decision_session,
            expected_horizon=expected_horizon,
            expected_model_id=expected_model_id,
        )
        if checked.asset in aligned:
            raise ValueError(f"Duplicate forecast for asset {checked.asset} on {decision_session}")
        aligned[checked.asset] = checked
    model_ids = {f.model_id for f in aligned.values()}
    if len(model_ids) > 1:
        raise ValueError(f"Mixed model_ids in single decision slice: {sorted(model_ids)}")
    data_hashes = {f.data_sha256 for f in aligned.values()}
    if len(data_hashes) > 1:
        raise ValueError("Forecasts in a single decision slice have inconsistent data_sha256")
    config_hashes = {f.model_config_sha256 for f in aligned.values()}
    if len(config_hashes) > 1:
        raise ValueError(
            "Forecasts in a single decision slice have inconsistent model_config_sha256"
        )
    return aligned


def save_forecast_bundle(
    output_dir: Path,
    *,
    config: Mapping[str, object],
    inputs: Mapping[str, object],
    forecasts_df: pd.DataFrame,
    skipped: Sequence[Mapping[str, object]],
    manifest_extra: Mapping[str, object] | None = None,
) -> dict[str, object]:
    """Write an immutable forecast run bundle with SHA-256 verification hashes."""
    output_dir = Path(output_dir)
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"Forecast output directory is not empty: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    config_path = output_dir / "config.json"
    inputs_path = output_dir / "inputs.json"
    forecasts_path = output_dir / "forecasts.csv"
    skipped_path = output_dir / "skipped.json"

    config_path.write_text(json.dumps(config, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    inputs_path.write_text(json.dumps(inputs, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    forecasts_df.to_csv(forecasts_path, index=False, float_format="%.17g")
    skipped_path.write_text(json.dumps(list(skipped), indent=2) + "\n", encoding="utf-8")

    manifest: dict[str, object] = {
        "artifact_hashes": {
            "config.json": sha256_file(config_path),
            "inputs.json": sha256_file(inputs_path),
            "forecasts.csv": sha256_file(forecasts_path),
            "skipped.json": sha256_file(skipped_path),
        },
        "row_count": int(len(forecasts_df)),
        "skipped_count": int(len(skipped)),
    }
    if manifest_extra:
        manifest.update(manifest_extra)
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return manifest


def load_forecast_bundle(
    directory: Path,
) -> tuple[list[VarianceForecast], pd.DataFrame, dict[str, object]]:
    """Load and hash-verify a frozen forecast run directory without network or retraining."""
    directory = Path(directory)
    manifest_path = directory / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Missing forecast manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    hashes = manifest.get("artifact_hashes", {})
    for filename in ("config.json", "inputs.json", "forecasts.csv", "skipped.json"):
        file_path = directory / filename
        if not file_path.exists():
            raise FileNotFoundError(f"Missing forecast artifact: {file_path}")
        if sha256_file(file_path) != hashes.get(filename):
            raise ValueError(f"Forecast artifact hash mismatch: {filename}")
    frame = pd.read_csv(directory / "forecasts.csv")
    records = [VarianceForecast.from_dict(row) for row in frame.to_dict(orient="records")]
    return records, frame, manifest
