"""Immutable contracts for variance forecasts and portfolio allocation decisions."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone

VALID_STATUSES = (
    "ok",
    "unavailable",
    "nonconverged",
    "invalid",
    "failed",
    "insufficient_mature_labels",
)


def parse_utc(value: str | datetime) -> datetime:
    """Parse an ISO-8601 string or datetime into a timezone-aware UTC datetime."""
    if isinstance(value, str):
        text = value.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
    elif isinstance(value, datetime):
        dt = value
    else:
        raise TypeError(f"Expected ISO timestamp string or datetime, got {type(value).__name__}")
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        raise ValueError("Timestamp must be timezone-aware")
    return dt.astimezone(timezone.utc)


def _clean_float(val: object) -> float | None:
    if val is None or val == "":
        return None
    try:
        num = float(val)
    except (TypeError, ValueError):
        return None
    return num


@dataclass(frozen=True)
class VarianceForecast:
    asset: str
    model_id: str
    forecast_session: str
    as_of_utc: datetime
    horizon_sessions: int
    predicted_daily_variance: float | None
    training_last_label_at_utc: datetime | None
    data_sha256: str
    model_config_sha256: str
    status: str
    raw_prediction: float | None = None
    training_cutoff_session: str | None = None
    train_count: int = 0
    regime: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "asset": self.asset,
            "model_id": self.model_id,
            "forecast_session": self.forecast_session,
            "as_of_utc": parse_utc(self.as_of_utc).isoformat(),
            "horizon_sessions": int(self.horizon_sessions),
            "predicted_daily_variance": self.predicted_daily_variance,
            "raw_prediction": (
                self.raw_prediction
                if self.raw_prediction is not None
                else self.predicted_daily_variance
            ),
            "training_last_label_at_utc": (
                parse_utc(self.training_last_label_at_utc).isoformat()
                if self.training_last_label_at_utc is not None
                else None
            ),
            "training_cutoff_session": self.training_cutoff_session,
            "train_count": int(self.train_count),
            "data_sha256": self.data_sha256,
            "model_config_sha256": self.model_config_sha256,
            "status": self.status,
            "regime": self.regime,
            "error": self.error,
        }

    def record_hash(self) -> str:
        payload = self.to_dict()
        for key in ("predicted_daily_variance", "raw_prediction"):
            val = payload[key]
            if isinstance(val, float) and not math.isfinite(val):
                payload[key] = str(val)
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    @classmethod
    def from_dict(cls, row: dict[str, object]) -> VarianceForecast:
        as_of = parse_utc(str(row["as_of_utc"]))
        last_label_raw = row.get("training_last_label_at_utc")
        last_label = (
            parse_utc(str(last_label_raw))
            if last_label_raw is not None
            and str(last_label_raw).strip() not in ("", "None", "nan")
            else None
        )
        pred = _clean_float(row.get("predicted_daily_variance"))
        raw_pred = _clean_float(row.get("raw_prediction"))
        if raw_pred is None:
            raw_pred = pred
        cutoff_raw = row.get("training_cutoff_session")
        cutoff = (
            str(cutoff_raw)
            if cutoff_raw is not None and str(cutoff_raw).strip() not in ("", "None", "nan")
            else None
        )
        regime_raw = row.get("regime")
        regime = (
            str(regime_raw)
            if regime_raw is not None and str(regime_raw).strip() not in ("", "None", "nan")
            else None
        )
        err_raw = row.get("error")
        err = (
            str(err_raw)
            if err_raw is not None and str(err_raw).strip() not in ("", "None", "nan")
            else None
        )
        train_cnt_raw = row.get("train_count", 0)
        train_cnt = (
            0
            if train_cnt_raw is None or str(train_cnt_raw).strip() in ("", "None", "nan")
            else int(float(str(train_cnt_raw)))
        )
        return cls(
            asset=str(row["asset"]),
            model_id=str(row["model_id"]),
            forecast_session=str(row["forecast_session"]),
            as_of_utc=as_of,
            horizon_sessions=int(float(str(row["horizon_sessions"]))),
            predicted_daily_variance=pred,
            training_last_label_at_utc=last_label,
            data_sha256=str(row["data_sha256"]),
            model_config_sha256=str(row["model_config_sha256"]),
            status=str(row["status"]),
            raw_prediction=raw_pred,
            training_cutoff_session=cutoff,
            train_count=train_cnt,
            regime=regime,
            error=err,
        )


@dataclass(frozen=True)
class AllocationDecision:
    decision_session: str
    as_of_utc: datetime
    policy_id: str
    target_weights: dict[str, float]
    cash_weight: float
    source_forecast_hashes: tuple[str, ...]
    action: str = "rebalance"
    reason: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "decision_session": self.decision_session,
            "as_of_utc": parse_utc(self.as_of_utc).isoformat(),
            "policy_id": self.policy_id,
            "target_weights": {k: float(v) for k, v in sorted(self.target_weights.items())},
            "cash_weight": float(self.cash_weight),
            "source_forecast_hashes": list(self.source_forecast_hashes),
            "action": self.action,
            "reason": self.reason,
        }

    def record_hash(self) -> str:
        encoded = json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()
