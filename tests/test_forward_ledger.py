"""Offline unit tests for Phase 6 prospective forward-decision hash-chained ledger."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ripple.ledger.forward import GENESIS_HASH, ForwardDecisionLedger, verify_ledger


def test_forward_ledger_lifecycle_idempotence_and_commit_before_outcome(tmp_path: Path):
    ledger_path = tmp_path / "forward" / "ledger.jsonl"
    ledger = ForwardDecisionLedger(ledger_path)

    weights = {"SPY": 0.22, "IEF": 0.40, "GLD": 0.21, "VNQ": 0.17}
    common = {
        "run_id": "fwd-2026-11-04-ewma094",
        "scheduled_utc": "2026-11-05T05:00:00Z",
        "observation_cutoff_utc": "2026-11-05T05:00:00Z",
        "strategy_id": "forecast_ewma094",
        "model_id": "ewma094",
        "config_sha256": "cfg_sha_001",
        "dataset_sha256": "data_sha_001",
        "code_commit_sha": "42d0e15",
    }

    # Outcome before decision_committed must fail closed
    with pytest.raises(ValueError, match="before 'decision_committed'"):
        ledger.append_event(
            **common,
            event_type="outcome_finalized",
            recorded_utc="2026-11-12T05:05:00Z",
            linked_decision_hash="deadbeef",
            outcome_payload={"realized_5d_return": 0.012},
        )

    r1 = ledger.append_event(
        **common,
        event_type="run_scheduled",
        recorded_utc="2026-11-05T05:00:01Z",
    )
    assert r1.sequence_no == 1
    assert r1.prev_record_hash == GENESIS_HASH

    r2 = ledger.append_event(
        **common,
        event_type="data_snapshot_ready",
        recorded_utc="2026-11-05T05:00:05Z",
    )
    assert r2.prev_record_hash == r1.record_hash

    r3 = ledger.append_event(
        **common,
        event_type="prediction_generated",
        recorded_utc="2026-11-05T05:00:10Z",
    )
    assert r3.prev_record_hash == r2.record_hash

    r4 = ledger.append_event(
        **common,
        event_type="decision_committed",
        recorded_utc="2026-11-05T05:00:15Z",
        proposed_weights=weights,
        cash_weight=0.0,
    )
    assert r4.prev_record_hash == r3.record_hash

    # Idempotent retry with identical payload returns existing record without duplicating
    r4_retry = ledger.append_event(
        **common,
        event_type="decision_committed",
        recorded_utc="2026-11-05T05:01:00Z",
        proposed_weights=weights,
        cash_weight=0.0,
    )
    assert r4_retry.record_hash == r4.record_hash
    assert len(ledger.read_records()) == 4

    # Attempting to rewrite committed weights raises ValueError
    with pytest.raises(ValueError, match="Cannot rewrite or alter"):
        ledger.append_event(
            **common,
            event_type="decision_committed",
            recorded_utc="2026-11-05T05:02:00Z",
            proposed_weights={"SPY": 0.25, "IEF": 0.25, "GLD": 0.25, "VNQ": 0.25},
            cash_weight=0.0,
        )

    # Mismatched linked_decision_hash rejected
    with pytest.raises(ValueError, match="linked_decision_hash"):
        ledger.append_event(
            **common,
            event_type="execution_simulated",
            recorded_utc="2026-11-05T14:35:00Z",
            linked_decision_hash="wrong_hash",
        )

    # Backdated outcome earlier than decision_committed rejected
    with pytest.raises(ValueError, match="precedes decision_committed"):
        ledger.append_event(
            **common,
            event_type="outcome_finalized",
            recorded_utc="2026-11-05T04:59:00Z",
            linked_decision_hash=r4.record_hash,
            outcome_payload={"realized_5d_return": 0.01},
        )

    r5 = ledger.append_event(
        **common,
        event_type="execution_simulated",
        recorded_utc="2026-11-05T14:35:00Z",
        linked_decision_hash=r4.record_hash,
    )
    r6 = ledger.append_event(
        **common,
        event_type="outcome_finalized",
        recorded_utc="2026-11-12T05:05:00Z",
        linked_decision_hash=r4.record_hash,
        outcome_payload={"realized_5d_return": 0.0114, "fees_paid": 1.25},
    )
    assert r6.prev_record_hash == r5.record_hash

    summary = verify_ledger(ledger_path)
    assert summary["valid"] is True
    assert summary["record_count"] == 6
    assert summary["committed_decisions"] == 1
    assert summary["finalized_outcomes"] == 1
    assert summary["pending_outcome_runs"] == []


def test_missed_run_logging_pending_decisions_and_tamper_detection(tmp_path: Path):
    ledger_path = tmp_path / "forward" / "ledger.jsonl"
    ledger = ForwardDecisionLedger(ledger_path)

    # Missed schedule run logged explicitly
    ledger.append_event(
        run_id="fwd-2026-11-11-missed",
        event_type="run_missed",
        scheduled_utc="2026-11-12T05:00:00Z",
        recorded_utc="2026-11-12T06:00:00Z",
        observation_cutoff_utc="2026-11-12T05:00:00Z",
        strategy_id="forecast_garch11",
        model_id="garch11",
        config_sha256="cfg",
        dataset_sha256="none",
        status="missed",
        error_reason="provider_snapshot_timeout",
    )

    # Committed decision awaiting future outcome
    dec = ledger.append_event(
        run_id="fwd-2026-11-18-garch11",
        event_type="decision_committed",
        scheduled_utc="2026-11-19T05:00:00Z",
        recorded_utc="2026-11-19T05:00:12Z",
        observation_cutoff_utc="2026-11-19T05:00:00Z",
        strategy_id="forecast_garch11",
        model_id="garch11",
        config_sha256="cfg",
        dataset_sha256="snap_sha",
        proposed_weights={"SPY": 0.21, "IEF": 0.39, "GLD": 0.22, "VNQ": 0.18},
        cash_weight=0.0,
    )
    # Revision/correction note linked to original decision without mutating it
    ledger.append_event(
        run_id="fwd-2026-11-18-garch11",
        event_type="decision_note",
        scheduled_utc="2026-11-19T05:00:00Z",
        recorded_utc="2026-11-19T05:10:00Z",
        observation_cutoff_utc="2026-11-19T05:00:00Z",
        strategy_id="forecast_garch11",
        model_id="garch11",
        config_sha256="cfg",
        dataset_sha256="snap_sha",
        linked_decision_hash=dec.record_hash,
        error_reason="diagnostic_note:high_recent_variance_regime",
    )

    summary = verify_ledger(ledger_path)
    assert summary["status_counts"]["missed"] == 1
    assert summary["pending_outcome_runs"] == ["fwd-2026-11-18-garch11"]

    # Tamper with line 2 in ledger.jsonl -> verify_ledger must fail closed
    lines = ledger_path.read_text(encoding="utf-8").splitlines()
    obj = json.loads(lines[1])
    obj["proposed_weights"]["SPY"] = 0.30
    lines[1] = json.dumps(obj, sort_keys=True, separators=(",", ":"))
    ledger_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    with pytest.raises(ValueError, match="Tampered ledger record"):
        verify_ledger(ledger_path)

    # Appending a new event onto a tampered ledger must also fail closed
    with pytest.raises(ValueError, match="Tampered ledger record"):
        ledger.append_event(
            run_id="fwd-2026-11-25-garch11",
            event_type="run_scheduled",
            scheduled_utc="2026-11-26T05:00:00Z",
            recorded_utc="2026-11-26T05:00:01Z",
            observation_cutoff_utc="2026-11-26T05:00:00Z",
            strategy_id="forecast_garch11",
            model_id="garch11",
            config_sha256="cfg",
            dataset_sha256="snap_sha",
        )

    # Partial/truncated line at EOF or missing required fields must raise ValueError
    trunc_path = tmp_path / "forward" / "truncated.jsonl"
    trunc_path.write_text('{"sequence_no": 1, "run_id": "incomplete"\n', encoding="utf-8")
    with pytest.raises(ValueError, match="Malformed or truncated ledger record"):
        verify_ledger(trunc_path)

    missing_key_path = tmp_path / "forward" / "missing_key.jsonl"
    missing_key_path.write_text('{"sequence_no": 1}\n', encoding="utf-8")
    with pytest.raises(ValueError, match="Malformed or truncated ledger record"):
        verify_ledger(missing_key_path)
