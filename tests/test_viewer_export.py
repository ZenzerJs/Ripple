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


