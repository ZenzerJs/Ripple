"""Offline tests for the Ripple frontend viewer JSON exporter and schema invariants."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from ripple.viewer_export import build_leakage_audit_run, export_all_viewer_runs


def test_reference_excludes_forecast_row_and_its_own_target() -> None:
    """Changing only a forecast's target must not change either fitted prediction."""
    dates = pd.date_range("2010-01-01", periods=70, freq="ME")
    rng = np.random.default_rng(7)
    frame = pd.DataFrame({
        "session": dates.strftime("%Y-%m-%d"),
        "symbol": "SPY",
        "close": 100 * np.exp(np.cumsum(rng.normal(0.005, 0.04, len(dates)))),
    })

    def build(prices: pd.DataFrame) -> dict:
        return build_leakage_audit_run(
            prices, symbol="SPY", data_sha256="fixture", repo_commit="fixture",
        )

    baseline = build(frame)
    partial = pd.concat([
        frame,
        pd.DataFrame({"session": ["2015-11-02"], "symbol": ["SPY"], "close": [123.0]}),
    ], ignore_index=True)
    assert build(partial)["folds"] == baseline["folds"]
    original = [f for f in baseline["folds"] if f["variant"] == "original"]
    assert all(f["last_train_date"] < f["forecast_date"] for f in original)
    assert all(
        row["row_date"] < f["forecast_date"]
        for f in original for row in f["leaked_rows"]
    )
    # Six-month reference retains five immature prior labels, not the forecast label.
    assert all(len(f["leaked_rows"]) == f["horizon_months"] - 1 for f in original)
    changed = frame.copy()
    forecast_idx, horizon = 40, 6
    changed.loc[forecast_idx + horizon, "close"] *= 1.5
    altered = build(changed)

    def selected(run: dict) -> dict:
        return {
            (f["variant"], f["model"]): f
            for f in run["folds"]
            if f["forecast_date"] == dates[forecast_idx].strftime("%Y-%m-%d")
            and f["horizon_months"] == horizon
        }

    before, after = selected(baseline), selected(altered)
    assert len(before) == len(after) == 6
    for key, fold in before.items():
        assert fold["actual_pct"] != after[key]["actual_pct"]
        assert fold["prediction_pct"] == after[key]["prediction_pct"]


def test_export_all_viewer_runs_synthetic_fallback(tmp_path: Path) -> None:
    out_dir = tmp_path / "runs"
    missing_snap = tmp_path / "nonexistent_snapshot"
    index = export_all_viewer_runs(out_dir, snapshot_dir=missing_snap)

    assert index["schema_version"] == "1.0"
    assert (out_dir / "index.json").exists()
    assert all(len(r["sha256"]) == 64 and isinstance(r["fixture"], bool) for r in index["runs"])
    assert (out_dir / "leakage-audit-spy-2016-2026.json").exists()
    assert (out_dir / "leakage-audit-gld-draft.json").exists()
    assert (out_dir / "leakage-audit-vnq-null-control.json").exists()
    assert (out_dir / "invalid-provenance.json").exists()
    assert (out_dir / "ripple-phase4b-to-6-lab.json").exists()

    spy = json.loads((out_dir / "leakage-audit-spy-2016-2026.json").read_text(encoding="utf-8"))
    assert spy["schema_version"] == "1.0"
    assert spy["kind"] == "leakage_audit"
    assert spy["status"] == "draft"
    assert spy["source"]["repo_commit"]
    assert spy["source"]["data_sha256"]
    assert spy["variants"] == ["original", "corrected"]
    assert spy["models"] == ["ar1", "ridge", "random_forest"]

    # Check fold states include both ok and skipped_insufficient_labels for corrected
    states = {f["state"] for f in spy["folds"]}
    assert "ok" in states
    assert "skipped_insufficient_labels" in states

    # Check leaked rows are populated on ok original folds and empty on corrected folds
    orig_ok = [f for f in spy["folds"] if f["variant"] == "original" and f["state"] == "ok"]
    corr_ok = [f for f in spy["folds"] if f["variant"] == "corrected" and f["state"] == "ok"]
    assert orig_ok and len(orig_ok[0]["leaked_rows"]) == orig_ok[0]["horizon_months"] - 1
    assert corr_ok and corr_ok[0]["leaked_rows"] == []
    assert all(len(f["forecast_date"]) == 10 for f in spy["folds"])
    assert all(
        len(f["latest_label_available"]) == 10 and f["latest_label_available"] <= f["forecast_date"]
        for f in corr_ok
        if f["latest_label_available"] is not None
    )

    # Check null-control run produces identical original and corrected summaries on common_dates
    null_run = json.loads(
        (out_dir / "leakage-audit-vnq-null-control.json").read_text(encoding="utf-8")
    )
    common_ridge_6 = [
        s
        for s in null_run["summary"]
        if s["horizon_months"] == 6
        and s["model"] == "ridge"
        and s["metric"] == "mae"
        and s["scope"] == "common_dates"
    ]
    assert len(common_ridge_6) == 2
    assert common_ridge_6[0]["value"] == common_ridge_6[1]["value"]

    # Check draft run includes all 4 fold states on corrected folds
    draft_run = json.loads(
        (out_dir / "leakage-audit-gld-draft.json").read_text(encoding="utf-8")
    )
    corr_states = {
        f["state"] for f in draft_run["folds"] if f["variant"] == "corrected"
    }
    assert corr_states == {
        "ok",
        "skipped_insufficient_labels",
        "model_failed",
        "unavailable",
    }


def test_committed_viewer_exports_match_index_sha256_and_lab_bundle() -> None:
    import hashlib

    runs_dir = Path(__file__).resolve().parents[1] / "frontend" / "public" / "runs"
    index = json.loads((runs_dir / "index.json").read_text(encoding="utf-8"))
    public_runs = [r for r in index["runs"] if not r.get("fixture")]
    fixture_runs = [r for r in index["runs"] if r.get("fixture")]
    assert [r["ticker"] for r in public_runs] == ["SPY", "IEF"]
    assert len(fixture_runs) == 3

    for entry in index["runs"]:
        raw_bytes = (runs_dir / entry["file"]).read_text(encoding="utf-8").encode("utf-8")
        assert hashlib.sha256(raw_bytes).hexdigest() == entry["sha256"]

    lab = json.loads((runs_dir / index["lab_bundle_file"]).read_text(encoding="utf-8"))
    assert lab["status"] == "verified"
    assert lab["stress_summary"]["search_budget"]["total_scenarios_evaluated"] == 18
    assert lab["stress_summary"]["worst_valid_scenario"]["scenario_id"] == "search_b5_s104"
    assert lab["forward_ledger"]["verification"]["valid"] is True


