"""Forecast-to-replay strategy bridge and matched 5-session benchmarks."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Literal

import numpy as np

from ripple.core.models import Observation, PortfolioState, TargetWeights
from ripple.data.market import SYMBOLS
from ripple.forecasts.schema import AllocationDecision, VarianceForecast
from ripple.policies.allocation import (
    DEFAULT_MAX_WEIGHT,
    allocate_from_forecasts,
    inverse_volatility_weights,
)


class EqualWeight5Session:
    """Every-fifth-session equal-weight baseline on a shared decision calendar."""

    name = "equal_weight_5d"

    def __init__(self, decision_sessions: Sequence[str] | None = None):
        self.decision_sessions = set(decision_sessions) if decision_sessions is not None else None
        self.step_counter = 0

    def decide(
        self,
        observation: Observation,
        state: PortfolioState,
        *,
        initial: bool,
        first_of_month: bool,
    ) -> TargetWeights | None:
        if self.decision_sessions is not None:
            if observation.session not in self.decision_sessions:
                return None
            return TargetWeights({symbol: 0.25 for symbol in SYMBOLS})
        if initial:
            self.step_counter = 0
            return TargetWeights({symbol: 0.25 for symbol in SYMBOLS})
        self.step_counter += 1
        if self.step_counter % 5 == 0:
            return TargetWeights({symbol: 0.25 for symbol in SYMBOLS})
        return None


class TrailingVol21FiveSession:
    """Every-fifth-session inverse 21-day trailing sample volatility baseline."""

    name = "trailing_vol21_5d"

    def __init__(
        self,
        decision_sessions: Sequence[str] | None = None,
        *,
        max_weight: float = DEFAULT_MAX_WEIGHT,
        excess_rule: Literal["redistribute", "cash"] = "redistribute",
    ):
        self.decision_sessions = set(decision_sessions) if decision_sessions is not None else None
        self.max_weight = max_weight
        self.excess_rule = excess_rule
        self.step_counter = 0

    def decide(
        self,
        observation: Observation,
        state: PortfolioState,
        *,
        initial: bool,
        first_of_month: bool,
    ) -> TargetWeights | None:
        if self.decision_sessions is not None:
            if observation.session not in self.decision_sessions:
                return None
        else:
            if initial:
                self.step_counter = 0
            else:
                self.step_counter += 1
                if self.step_counter % 5 != 0:
                    return None
        if len(observation.returns) < 21:
            return None
        recent = np.array([row[1] for row in observation.returns[-21:]], dtype=float)
        if not np.isfinite(recent).all() or (recent <= -1.0).any():
            return None
        log_rets = np.log(1.0 + recent)
        sample_vars = np.var(log_rets, axis=0, ddof=1)
        if not np.isfinite(sample_vars).all() or (sample_vars <= 0.0).any():
            return None
        var_map = {sym: float(sample_vars[i]) for i, sym in enumerate(observation.symbols)}
        weights, _ = inverse_volatility_weights(
            var_map, max_weight=self.max_weight, excess_rule=self.excess_rule
        )
        return TargetWeights(weights)


class ForecastPolicyStrategy:
    """Bridge frozen VarianceForecasts through one fixed allocation policy into replay()."""

    def __init__(
        self,
        model_id: str,
        forecasts: Sequence[VarianceForecast],
        *,
        decision_sessions: Sequence[str] | None = None,
        max_weight: float = DEFAULT_MAX_WEIGHT,
        invalid_policy: Literal["skip", "fallback_rolling21"] = "skip",
        excess_rule: Literal["redistribute", "cash"] = "redistribute",
        fallback_forecasts: Sequence[VarianceForecast] | None = None,
        policy_id: str = "fixed_inv_vol_cap40_skip",
    ):
        self.model_id = model_id
        self.name = f"forecast_{model_id}"
        self.max_weight = max_weight
        self.invalid_policy = invalid_policy
        self.excess_rule = excess_rule
        self.policy_id = policy_id

        by_session: dict[str, list[VarianceForecast]] = {}
        for f in forecasts:
            if f.model_id == model_id:
                by_session.setdefault(f.forecast_session, []).append(f)
        self.forecasts_by_session: Mapping[str, list[VarianceForecast]] = by_session

        fb_by_session: dict[str, list[VarianceForecast]] = {}
        if fallback_forecasts is not None:
            for f in fallback_forecasts:
                fb_by_session.setdefault(f.forecast_session, []).append(f)
        self.fallback_by_session: Mapping[str, list[VarianceForecast]] = fb_by_session

        if decision_sessions is not None:
            self.decision_sessions = set(decision_sessions)
        else:
            self.decision_sessions = set(by_session.keys())

        self.audit_log: list[AllocationDecision] = []

    def decide(
        self,
        observation: Observation,
        state: PortfolioState,
        *,
        initial: bool,
        first_of_month: bool,
    ) -> TargetWeights | None:
        session = observation.session
        if session not in self.decision_sessions:
            return None
        slice_forecasts = self.forecasts_by_session.get(session, [])
        fb_slice = self.fallback_by_session.get(session) if self.fallback_by_session else None
        decision = allocate_from_forecasts(
            slice_forecasts,
            decision_session=session,
            decision_cutoff_utc=observation.available_at,
            policy_id=self.policy_id,
            max_weight=self.max_weight,
            invalid_policy=self.invalid_policy,
            excess_rule=self.excess_rule,
            expected_model_id=self.model_id,
            fallback_forecasts=fb_slice,
        )
        self.audit_log.append(decision)
        if decision.action == "skip_retain":
            return None
        return TargetWeights(decision.target_weights)
