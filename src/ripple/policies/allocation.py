"""Pure fixed inverse-volatility allocation policy with weight cap and invalid-forecast handling."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Literal

from ripple.data.market import SYMBOLS
from ripple.forecasts.adapter import align_asset_forecasts
from ripple.forecasts.schema import AllocationDecision, VarianceForecast, parse_utc

DEFAULT_MAX_WEIGHT = 0.40


def cap_and_redistribute(
    raw_scores: Mapping[str, float],
    *,
    max_weight: float = DEFAULT_MAX_WEIGHT,
    excess_rule: Literal["redistribute", "cash"] = "redistribute",
    symbols: Sequence[str] = SYMBOLS,
) -> tuple[dict[str, float], float]:
    """Normalize positive scores and enforce per-asset max_weight via redistribution or cash."""
    if not math.isfinite(max_weight) or not 0.0 < max_weight <= 1.0:
        raise ValueError("max_weight must be in (0, 1]")
    if excess_rule not in ("redistribute", "cash"):
        raise ValueError(f"Unsupported excess_rule: {excess_rule}")
    scores: dict[str, float] = {}
    for sym in symbols:
        if sym not in raw_scores:
            raise ValueError(f"Missing score for symbol {sym}")
        val = float(raw_scores[sym])
        if not math.isfinite(val) or val <= 0.0:
            raise ValueError(f"Score for {sym} must be finite and positive, got {val}")
        scores[sym] = val

    total_score = sum(scores.values())
    tentative = {sym: scores[sym] / total_score for sym in symbols}

    if excess_rule == "cash":
        capped = {sym: min(tentative[sym], max_weight) for sym in symbols}
        cash_weight = max(0.0, 1.0 - sum(capped.values()))
        return capped, cash_weight

    # Iterative proportional water-filling cap and redistribution
    weights = dict(tentative)
    locked: set[str] = set()
    while True:
        over = [
            sym
            for sym in symbols
            if sym not in locked and weights[sym] > max_weight + 1e-12
        ]
        if not over:
            break
        for sym in over:
            weights[sym] = max_weight
            locked.add(sym)
        remaining_budget = max(0.0, 1.0 - len(locked) * max_weight)
        free = [sym for sym in symbols if sym not in locked]
        if not free or remaining_budget <= 1e-12:
            for sym in free:
                weights[sym] = 0.0
            break
        free_score_sum = sum(scores[sym] for sym in free)
        for sym in free:
            weights[sym] = remaining_budget * (scores[sym] / free_score_sum)

    cash_weight = max(0.0, 1.0 - sum(weights.values()))
    return weights, cash_weight


def inverse_volatility_weights(
    variances: Mapping[str, float],
    *,
    max_weight: float = DEFAULT_MAX_WEIGHT,
    excess_rule: Literal["redistribute", "cash"] = "redistribute",
    symbols: Sequence[str] = SYMBOLS,
) -> tuple[dict[str, float], float]:
    """Map positive daily variances v_i to capped weights proportional to 1 / sqrt(v_i)."""
    inv_vols: dict[str, float] = {}
    for sym in symbols:
        if sym not in variances:
            raise ValueError(f"Missing variance for {sym}")
        v = float(variances[sym])
        if not math.isfinite(v) or v <= 0.0:
            raise ValueError(f"Variance for {sym} must be finite and positive, got {v}")
        inv_vols[sym] = 1.0 / math.sqrt(v)
    return cap_and_redistribute(
        inv_vols, max_weight=max_weight, excess_rule=excess_rule, symbols=symbols
    )


def allocate_from_forecasts(
    forecasts: Sequence[VarianceForecast] | Mapping[str, VarianceForecast],
    *,
    decision_session: str,
    decision_cutoff_utc: str | datetime,
    policy_id: str = "fixed_inv_vol_cap40_skip",
    max_weight: float = DEFAULT_MAX_WEIGHT,
    invalid_policy: Literal["skip", "fallback_rolling21"] = "skip",
    excess_rule: Literal["redistribute", "cash"] = "redistribute",
    expected_model_id: str | None = None,
    fallback_forecasts: Sequence[VarianceForecast] | Mapping[str, VarianceForecast] | None = None,
    symbols: Sequence[str] = SYMBOLS,
) -> AllocationDecision:
    """Convert four-ETF variance forecasts into an AllocationDecision under frozen policy rules."""
    if invalid_policy not in ("skip", "fallback_rolling21"):
        raise ValueError(f"Unsupported invalid_policy: {invalid_policy}")
    cutoff = parse_utc(decision_cutoff_utc)
    aligned = align_asset_forecasts(
        forecasts,
        decision_session=decision_session,
        decision_cutoff_utc=cutoff,
        expected_model_id=expected_model_id,
    )
    hashes = tuple(aligned[sym].record_hash() for sym in symbols if sym in aligned)

    invalid_reasons: list[str] = []
    for sym in symbols:
        if sym not in aligned:
            invalid_reasons.append(f"{sym}:missing")
            continue
        f = aligned[sym]
        if (
            f.status != "ok"
            or f.predicted_daily_variance is None
            or not math.isfinite(f.predicted_daily_variance)
            or f.predicted_daily_variance <= 0.0
        ):
            invalid_reasons.append(f"{sym}:{f.status}")

    if invalid_reasons:
        reason_str = ",".join(invalid_reasons)
        if invalid_policy == "fallback_rolling21" and fallback_forecasts is not None:
            fb_aligned = align_asset_forecasts(
                fallback_forecasts,
                decision_session=decision_session,
                decision_cutoff_utc=cutoff,
                expected_model_id="rolling21",
            )
            primary_hashes = {f.data_sha256 for f in aligned.values()}
            fb_data_hashes = {f.data_sha256 for f in fb_aligned.values()}
            if primary_hashes and fb_data_hashes and primary_hashes != fb_data_hashes:
                raise ValueError("Fallback forecasts have inconsistent data_sha256")
            fb_ok = all(
                sym in fb_aligned
                and fb_aligned[sym].status == "ok"
                and fb_aligned[sym].predicted_daily_variance is not None
                and fb_aligned[sym].predicted_daily_variance > 0.0
                for sym in symbols
            )
            if fb_ok:
                fb_vars = {
                    sym: float(fb_aligned[sym].predicted_daily_variance)  # type: ignore[arg-type]
                    for sym in symbols
                }
                weights, cash_w = inverse_volatility_weights(
                    fb_vars, max_weight=max_weight, excess_rule=excess_rule, symbols=symbols
                )
                fb_hashes = tuple(fb_aligned[sym].record_hash() for sym in symbols)
                return AllocationDecision(
                    decision_session=decision_session,
                    as_of_utc=cutoff,
                    policy_id=policy_id,
                    target_weights=weights,
                    cash_weight=cash_w,
                    source_forecast_hashes=hashes + fb_hashes,
                    action="fallback",
                    reason=f"fallback_rolling21:{reason_str}",
                )
        return AllocationDecision(
            decision_session=decision_session,
            as_of_utc=cutoff,
            policy_id=policy_id,
            target_weights={},
            cash_weight=0.0,
            source_forecast_hashes=hashes,
            action="skip_retain",
            reason=f"invalid_or_missing_forecast:{reason_str}",
        )

    variances = {
        sym: float(aligned[sym].predicted_daily_variance)  # type: ignore[arg-type]
        for sym in symbols
    }
    weights, cash_w = inverse_volatility_weights(
        variances, max_weight=max_weight, excess_rule=excess_rule, symbols=symbols
    )
    return AllocationDecision(
        decision_session=decision_session,
        as_of_utc=cutoff,
        policy_id=policy_id,
        target_weights=weights,
        cash_weight=cash_w,
        source_forecast_hashes=hashes,
        action="rebalance",
        reason=None,
    )
