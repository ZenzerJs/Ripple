"""Append-only hash-chained ledger for prospective forward decisions and later outcomes."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from ripple.forecasts.schema import parse_utc

GENESIS_HASH = "0" * 64
VALID_EVENTS = (
    "run_scheduled",
    "data_snapshot_ready",
    "prediction_generated",
    "decision_committed",
    "execution_simulated",
    "outcome_finalized",
    "run_missed",
    "decision_note",
)
VALID_LEDGER_STATUSES = ("success", "skipped", "failed", "missed")


@dataclass(frozen=True)
class LedgerRecord:
    sequence_no: int
    run_id: str
    event_type: str
    scheduled_utc: str
    recorded_utc: str
    observation_cutoff_utc: str
    strategy_id: str
    model_id: str
    config_sha256: str
    dataset_sha256: str
    code_commit_sha: str | None
    proposed_weights: dict[str, float] | None
    cash_weight: float | None
    execution_convention: str
    status: str
    error_reason: str | None
    linked_decision_hash: str | None
    outcome_payload: dict[str, Any] | None
    prev_record_hash: str
    record_hash: str

    def payload_without_hash(self) -> dict[str, Any]:
        return {
            "sequence_no": int(self.sequence_no),
            "run_id": self.run_id,
            "event_type": self.event_type,
            "scheduled_utc": parse_utc(self.scheduled_utc).isoformat(),
            "recorded_utc": parse_utc(self.recorded_utc).isoformat(),
            "observation_cutoff_utc": parse_utc(self.observation_cutoff_utc).isoformat(),
            "strategy_id": self.strategy_id,
            "model_id": self.model_id,
            "config_sha256": self.config_sha256,
            "dataset_sha256": self.dataset_sha256,
            "code_commit_sha": self.code_commit_sha,
            "proposed_weights": (
                {k: float(v) for k, v in sorted(self.proposed_weights.items())}
                if self.proposed_weights is not None
                else None
            ),
            "cash_weight": float(self.cash_weight) if self.cash_weight is not None else None,
            "execution_convention": self.execution_convention,
            "status": self.status,
            "error_reason": self.error_reason,
            "linked_decision_hash": self.linked_decision_hash,
            "outcome_payload": self.outcome_payload,
            "prev_record_hash": self.prev_record_hash,
        }

    def compute_hash(self) -> str:
        canonical = json.dumps(
            self.payload_without_hash(), sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        return hashlib.sha256(canonical).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        data = self.payload_without_hash()
        data["record_hash"] = self.record_hash
        return data

    @classmethod
    def from_dict(cls, row: Mapping[str, Any]) -> LedgerRecord:
        return cls(
            sequence_no=int(row["sequence_no"]),
            run_id=str(row["run_id"]),
            event_type=str(row["event_type"]),
            scheduled_utc=parse_utc(str(row["scheduled_utc"])).isoformat(),
            recorded_utc=parse_utc(str(row["recorded_utc"])).isoformat(),
            observation_cutoff_utc=parse_utc(str(row["observation_cutoff_utc"])).isoformat(),
            strategy_id=str(row["strategy_id"]),
            model_id=str(row["model_id"]),
            config_sha256=str(row["config_sha256"]),
            dataset_sha256=str(row["dataset_sha256"]),
            code_commit_sha=(
                str(row["code_commit_sha"]) if row.get("code_commit_sha") is not None else None
            ),
            proposed_weights=(
                {str(k): float(v) for k, v in row["proposed_weights"].items()}
                if row.get("proposed_weights") is not None
                else None
            ),
            cash_weight=(
                float(row["cash_weight"]) if row.get("cash_weight") is not None else None
            ),
            execution_convention=str(row["execution_convention"]),
            status=str(row["status"]),
            error_reason=(
                str(row["error_reason"]) if row.get("error_reason") is not None else None
            ),
            linked_decision_hash=(
                str(row["linked_decision_hash"])
                if row.get("linked_decision_hash") is not None
                else None
            ),
            outcome_payload=(
                dict(row["outcome_payload"]) if row.get("outcome_payload") is not None else None
            ),
            prev_record_hash=str(row["prev_record_hash"]),
            record_hash=str(row["record_hash"]),
        )


class ForwardDecisionLedger:
    """Append-only JSONL hash-chained ledger enforcing commit-before-outcome."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def read_records(self) -> list[LedgerRecord]:
        if not self.path.exists():
            return []
        records: list[LedgerRecord] = []
        for line_no, raw_line in enumerate(
            self.path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            line = raw_line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if not isinstance(obj, Mapping):
                    raise ValueError("JSON line is not an object")
                records.append(LedgerRecord.from_dict(obj))
            except (ValueError, KeyError, TypeError) as exc:
                raise ValueError(
                    f"Malformed or truncated ledger record at line {line_no}: {exc}"
                ) from exc
        return records

    def append_event(
        self,
        *,
        run_id: str,
        event_type: str,
        scheduled_utc: str | datetime,
        recorded_utc: str | datetime,
        observation_cutoff_utc: str | datetime,
        strategy_id: str,
        model_id: str,
        config_sha256: str,
        dataset_sha256: str,
        code_commit_sha: str | None = None,
        proposed_weights: Mapping[str, float] | None = None,
        cash_weight: float | None = None,
        execution_convention: str = "next_xnys_open_adjusted_units",
        status: str = "success",
        error_reason: str | None = None,
        linked_decision_hash: str | None = None,
        outcome_payload: Mapping[str, Any] | None = None,
    ) -> LedgerRecord:
        if event_type not in VALID_EVENTS:
            raise ValueError(f"Unsupported ledger event_type: {event_type}")
        if status not in VALID_LEDGER_STATUSES:
            raise ValueError(f"Unsupported ledger status: {status}")

        sched_iso = parse_utc(scheduled_utc).isoformat()
        rec_iso = parse_utc(recorded_utc).isoformat()
        cutoff_iso = parse_utc(observation_cutoff_utc).isoformat()
        weights_clean = (
            {str(k): float(v) for k, v in sorted(proposed_weights.items())}
            if proposed_weights is not None
            else None
        )
        outcome_clean = dict(outcome_payload) if outcome_payload is not None else None

        if self.path.exists():
            verify_ledger(self.path)
        existing = self.read_records()
        # Check idempotence or illegal rewrite for singleton lifecycle events per run_id
        if event_type != "decision_note":
            for prev in existing:
                if prev.run_id == run_id and prev.event_type == event_type:
                    same_payload = (
                        prev.strategy_id == strategy_id
                        and prev.model_id == model_id
                        and prev.config_sha256 == config_sha256
                        and prev.dataset_sha256 == dataset_sha256
                        and prev.proposed_weights == weights_clean
                        and prev.cash_weight
                        == (float(cash_weight) if cash_weight is not None else None)
                        and prev.status == status
                        and prev.linked_decision_hash == linked_decision_hash
                        and prev.outcome_payload == outcome_clean
                    )
                    if same_payload:
                        return prev
                    raise ValueError(
                        f"Cannot rewrite or alter already-recorded '{event_type}' "
                        f"for run_id={run_id}"
                    )

        # Enforce commit-before-outcome invariant
        if event_type in ("execution_simulated", "outcome_finalized"):
            decisions = [
                r
                for r in existing
                if r.run_id == run_id and r.event_type == "decision_committed"
            ]
            if not decisions:
                raise ValueError(
                    f"Cannot record '{event_type}' for run_id={run_id} before 'decision_committed'"
                )
            committed = decisions[0]
            if linked_decision_hash != committed.record_hash:
                raise ValueError(
                    f"linked_decision_hash ({linked_decision_hash}) does not match committed "
                    f"decision record_hash ({committed.record_hash})"
                )
            if parse_utc(rec_iso) < parse_utc(committed.recorded_utc):
                raise ValueError(
                    f"{event_type} recorded_utc ({rec_iso}) precedes decision_committed "
                    f"recorded_utc ({committed.recorded_utc})"
                )
            if event_type == "outcome_finalized" and outcome_clean is None:
                raise ValueError("outcome_finalized requires a non-empty outcome_payload")

        if event_type == "decision_committed" and status == "success" and not weights_clean:
            raise ValueError("Successful decision_committed requires proposed_weights")

        prev_hash = existing[-1].record_hash if existing else GENESIS_HASH
        seq_no = len(existing) + 1
        draft = LedgerRecord(
            sequence_no=seq_no,
            run_id=run_id,
            event_type=event_type,
            scheduled_utc=sched_iso,
            recorded_utc=rec_iso,
            observation_cutoff_utc=cutoff_iso,
            strategy_id=strategy_id,
            model_id=model_id,
            config_sha256=config_sha256,
            dataset_sha256=dataset_sha256,
            code_commit_sha=code_commit_sha,
            proposed_weights=weights_clean,
            cash_weight=float(cash_weight) if cash_weight is not None else None,
            execution_convention=execution_convention,
            status=status,
            error_reason=error_reason,
            linked_decision_hash=linked_decision_hash,
            outcome_payload=outcome_clean,
            prev_record_hash=prev_hash,
            record_hash="",
        )
        final_record = LedgerRecord(
            **{**draft.to_dict(), "record_hash": draft.compute_hash()}
        )
        with self.path.open("a", encoding="utf-8", newline="\n") as fh:
            fh.write(
                json.dumps(final_record.to_dict(), sort_keys=True, separators=(",", ":")) + "\n"
            )
        return final_record


def verify_ledger(path: Path) -> dict[str, Any]:
    """Verify hash chain integrity, commit-before-outcome links, and run statuses."""
    ledger = ForwardDecisionLedger(path)
    records = ledger.read_records()
    expected_prev = GENESIS_HASH
    committed_by_run: dict[str, LedgerRecord] = {}
    outcomes_by_run: dict[str, LedgerRecord] = {}
    status_counts = dict.fromkeys(VALID_LEDGER_STATUSES, 0)
    event_counts = dict.fromkeys(VALID_EVENTS, 0)

    for idx, rec in enumerate(records, start=1):
        if rec.sequence_no != idx:
            raise ValueError(f"Ledger sequence_no mismatch at line {idx}: got {rec.sequence_no}")
        if rec.prev_record_hash != expected_prev:
            raise ValueError(
                f"Broken prev_record_hash chain at sequence_no={idx}: "
                f"{rec.prev_record_hash} != {expected_prev}"
            )
        recomputed = rec.compute_hash()
        if rec.record_hash != recomputed:
            raise ValueError(
                f"Tampered ledger record at sequence_no={idx}: "
                f"record_hash {rec.record_hash} != {recomputed}"
            )
        expected_prev = rec.record_hash
        status_counts[rec.status] = status_counts.get(rec.status, 0) + 1
        event_counts[rec.event_type] = event_counts.get(rec.event_type, 0) + 1

        if rec.event_type == "decision_committed":
            if rec.run_id in committed_by_run:
                raise ValueError(f"Duplicate decision_committed for run_id={rec.run_id}")
            committed_by_run[rec.run_id] = rec
        elif rec.event_type in ("execution_simulated", "outcome_finalized"):
            if rec.run_id not in committed_by_run:
                raise ValueError(
                    f"{rec.event_type} at sequence_no={idx} has no prior decision_committed"
                )
            dec = committed_by_run[rec.run_id]
            if rec.linked_decision_hash != dec.record_hash:
                raise ValueError(
                    f"{rec.event_type} at sequence_no={idx} has mismatched linked_decision_hash"
                )
            if parse_utc(rec.recorded_utc) < parse_utc(dec.recorded_utc):
                raise ValueError(
                    f"{rec.event_type} at sequence_no={idx} precedes decision_committed timestamp"
                )
            if rec.event_type == "outcome_finalized":
                outcomes_by_run[rec.run_id] = rec

    pending_runs = sorted(set(committed_by_run.keys()) - set(outcomes_by_run.keys()))
    return {
        "valid": True,
        "record_count": len(records),
        "head_hash": expected_prev,
        "committed_decisions": len(committed_by_run),
        "finalized_outcomes": len(outcomes_by_run),
        "pending_outcome_runs": pending_runs,
        "status_counts": status_counts,
        "event_counts": event_counts,
    }
