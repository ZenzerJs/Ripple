"""Offline tests for the Ripple frontend viewer JSON exporter and schema invariants."""

from __future__ import annotations

import json
from pathlib import Path

from ripple.viewer_export import export_all_viewer_runs


def test_export_all_viewer_runs_synthetic_fallback(tmp_path: Path) -> None:
    out_dir = tmp_path / "runs"
    missing_snap = tmp_path / "nonexistent_snapshot"
    index = export_all_viewer_runs(out_dir, snapshot_dir=missing_snap)

    assert index["schema_version"] == "1.0"
    assert (out_dir / "index.json").exists()
    assert (out_dir / "leakage-audit-spy-2016-2026.json").exists()
    assert (out_dir / "leakage-audit-gld-draft.json").exists()
    assert (out_dir / "leakage-audit-vnq-null-control.json").exists()
    assert (out_dir / "invalid-provenance.json").exists()
    assert (out_dir / "ripple-phase4b-to-6-lab.json").exists()

    spy = json.loads((out_dir / "leakage-audit-spy-2016-2026.json").read_text(encoding="utf-8"))
    assert spy["schema_version"] == "1.0"
    assert spy["kind"] == "leakage_audit"
    assert spy["status"] == "verified"
    assert spy["source"]["repo_commit"]
    assert spy["source"]["data_sha256"]
    assert spy["variants"] == ["original", "corrected"]
    assert spy["models"] == ["arima", "ridge", "random_forest"]

    # Check fold states include both ok and skipped_insufficient_labels for corrected
    states = {f["state"] for f in spy["folds"]}
    assert "ok" in states
    assert "skipped_insufficient_labels" in states

    # Check leaked rows are populated on ok original folds and empty on corrected folds
    orig_ok = [f for f in spy["folds"] if f["variant"] == "original" and f["state"] == "ok"]
    corr_ok = [f for f in spy["folds"] if f["variant"] == "corrected" and f["state"] == "ok"]
    assert orig_ok and len(orig_ok[0]["leaked_rows"]) == orig_ok[0]["horizon_months"]
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

