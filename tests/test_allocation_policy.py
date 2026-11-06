"""Offline unit tests for the fixed inverse-volatility allocation policy."""

from __future__ import annotations

import math

import pytest

from ripple.data.market import SYMBOLS
from ripple.forecasts.adapter import classify_prediction
from ripple.forecasts.schema import VarianceForecast
from ripple.policies.allocation import (
    allocate_from_forecasts,
    cap_and_redistribute,
    inverse_volatility_weights,
)


def _forecast_slice(
    variances: dict[str, float | None],
    *,
    model_id: str = "ridge",
    session: str = "2020-02-03",
    as_of: str = "2020-02-04T05:00:00Z",
    statuses: dict[str, str] | None = None,
) -> list[VarianceForecast]:
    out = []
    for sym in SYMBOLS:
        st = statuses.get(sym, "ok") if statuses else "ok"
        out.append(
            classify_prediction(
                asset=sym,
                model_id=model_id,
                forecast_session=session,
                as_of_utc=as_of,
                horizon_sessions=5,
                raw_prediction=variances[sym],
                training_last_label_at_utc=as_of,
                data_sha256="sha_data",
                model_config_sha256="sha_cfg",
                status=st,
                training_cutoff_session="2020-01-27",
                train_count=756,
            )
        )
    return out


def test_inverse_volatility_not_inverse_variance_and_uncapped_normalization():
    # Choose variances where no single asset exceeds 40%:
    # v = [0.0004, 0.0001, 0.0004, 0.0004] -> sqrt(v) = [0.02, 0.01, 0.02, 0.02]
    # 1/sqrt(v) = [50, 100, 50, 50] -> normalized = [0.20, 0.40, 0.20, 0.20]
    # (Whereas 1/v would give IEF 4 / 7 = 57.14% before cap)
    variances = {"SPY": 0.0004, "IEF": 0.0001, "GLD": 0.0004, "VNQ": 0.0004}
    weights, cash_w = inverse_volatility_weights(variances, max_weight=0.40)
    assert weights["IEF"] == pytest.approx(0.40)
    assert weights["SPY"] == pytest.approx(0.20)
    assert weights["GLD"] == pytest.approx(0.20)
    assert weights["VNQ"] == pytest.approx(0.20)
    assert cash_w == pytest.approx(0.0, abs=1e-12)
    assert sum(weights.values()) == pytest.approx(1.0)


def test_weight_cap_water_filling_redistribution_and_cash_rules():
    # Make IEF variance very small so its uncapped weight is > 0.40:
    # v_IEF = 0.000001 (1/s = 1000), others v = 0.0001 (1/s = 100 each)
    # Uncapped tentative: IEF = 1000/1300 = 76.92%, others = 100/1300 = 7.69% each
    variances = {"SPY": 0.0001, "IEF": 0.000001, "GLD": 0.0001, "VNQ": 0.0001}

    # Rule 1: redistribute excess proportionally among uncapped assets
    w_redist, cash_redist = inverse_volatility_weights(
        variances, max_weight=0.40, excess_rule="redistribute"
    )
    assert w_redist["IEF"] == pytest.approx(0.40)
    assert w_redist["SPY"] == pytest.approx(0.20)
    assert w_redist["GLD"] == pytest.approx(0.20)
    assert w_redist["VNQ"] == pytest.approx(0.20)
    assert cash_redist == pytest.approx(0.0, abs=1e-12)
    assert all(0.0 <= v <= 0.40 + 1e-12 for v in w_redist.values())

    # Rule 2: clip at 40% and hold excess in cash
    w_cash, cash_only = inverse_volatility_weights(
        variances, max_weight=0.40, excess_rule="cash"
    )
    assert w_cash["IEF"] == pytest.approx(0.40)
    expected_other = 100.0 / 1300.0
    assert w_cash["SPY"] == pytest.approx(expected_other)
    assert cash_only == pytest.approx(1.0 - (0.40 + 3 * expected_other))
    assert sum(w_cash.values()) + cash_only == pytest.approx(1.0)

    # Low cap where 4 * max_weight < 1.0 leaves remainder in cash under both rules
    w_low, cash_low = cap_and_redistribute(
        {"SPY": 1.0, "IEF": 2.0, "GLD": 1.0, "VNQ": 1.0},
        max_weight=0.20,
        excess_rule="redistribute",
    )
    assert all(v == pytest.approx(0.20) for v in w_low.values())
    assert cash_low == pytest.approx(0.20)


def test_identical_mapping_across_models_and_skip_vs_fallback_on_invalid_forecast():
    vars_ok = {"SPY": 0.0002, "IEF": 0.00005, "GLD": 0.00015, "VNQ": 0.0003}
    dec_ridge = allocate_from_forecasts(
        _forecast_slice(vars_ok, model_id="ridge"),
        decision_session="2020-02-03",
        decision_cutoff_utc="2020-02-04T05:00:00Z",
        expected_model_id="ridge",
    )
    dec_garch = allocate_from_forecasts(
        _forecast_slice(vars_ok, model_id="garch11"),
        decision_session="2020-02-03",
        decision_cutoff_utc="2020-02-04T05:00:00Z",
        expected_model_id="garch11",
    )
    assert dec_ridge.action == "rebalance"
    assert dec_ridge.target_weights == pytest.approx(dec_garch.target_weights)

    # Negative variance in ridge_extended -> policy (a) skips decision and retains prior weights
    vars_neg = {"SPY": -0.00003, "IEF": 0.00005, "GLD": 0.00015, "VNQ": 0.0003}
    dec_skip = allocate_from_forecasts(
        _forecast_slice(vars_neg, model_id="ridge_extended"),
        decision_session="2020-02-03",
        decision_cutoff_utc="2020-02-04T05:00:00Z",
        invalid_policy="skip",
    )
    assert dec_skip.action == "skip_retain"
    assert dec_skip.target_weights == {}
    assert dec_skip.reason is not None and "SPY:invalid" in dec_skip.reason

    # Policy (b) fallback_rolling21 substitutes rolling21 across all 4 assets and flags fallback
    fb_slice = _forecast_slice(vars_ok, model_id="rolling21")
    dec_fb = allocate_from_forecasts(
        _forecast_slice(vars_neg, model_id="ridge_extended"),
        decision_session="2020-02-03",
        decision_cutoff_utc="2020-02-04T05:00:00Z",
        invalid_policy="fallback_rolling21",
        fallback_forecasts=fb_slice,
    )
    assert dec_fb.action == "fallback"
    assert dec_fb.target_weights == pytest.approx(dec_ridge.target_weights)
    assert dec_fb.reason is not None and "fallback_rolling21:SPY:invalid" in dec_fb.reason
    assert len(dec_fb.source_forecast_hashes) == 8


def test_invalid_inputs_rejected_by_policy():
    with pytest.raises(ValueError, match="max_weight"):
        cap_and_redistribute(dict.fromkeys(SYMBOLS, 1.0), max_weight=0.0)
    with pytest.raises(ValueError, match="positive"):
        inverse_volatility_weights({"SPY": -0.1, "IEF": 0.1, "GLD": 0.1, "VNQ": 0.1})
    with pytest.raises(ValueError, match="finite"):
        inverse_volatility_weights({"SPY": math.nan, "IEF": 0.1, "GLD": 0.1, "VNQ": 0.1})


def test_extreme_variance_ratios_and_fallback_integrity_checks():
    # Extreme variance ratio (1e-12 vs 1e-6 vs 1e2) triggers multi-step water-filling cap at 40%
    extreme_vars = {"SPY": 1e-12, "IEF": 1e-6, "GLD": 1e2, "VNQ": 1e2}
    weights, cash_w = inverse_volatility_weights(
        extreme_vars, max_weight=0.40, excess_rule="redistribute"
    )
    assert weights["SPY"] == pytest.approx(0.40)
    assert weights["IEF"] == pytest.approx(0.40)
    assert weights["GLD"] == pytest.approx(0.10)
    assert weights["VNQ"] == pytest.approx(0.10)
    assert cash_w == pytest.approx(0.0, abs=1e-12)

    # Fallback forecasts with wrong model_id or mismatched data_sha256 must fail closed
    vars_neg = {"SPY": -0.0001, "IEF": 0.0001, "GLD": 0.0001, "VNQ": 0.0001}
    vars_ok = {"SPY": 0.0001, "IEF": 0.0001, "GLD": 0.0001, "VNQ": 0.0001}
    wrong_model_fb = _forecast_slice(vars_ok, model_id="ewma094")
    with pytest.raises(ValueError, match="Mismatched model_id"):
        allocate_from_forecasts(
            _forecast_slice(vars_neg, model_id="ridge_extended"),
            decision_session="2020-02-03",
            decision_cutoff_utc="2020-02-04T05:00:00Z",
            invalid_policy="fallback_rolling21",
            fallback_forecasts=wrong_model_fb,
        )

    bad_hash_fb = [
        classify_prediction(
            asset=sym,
            model_id="rolling21",
            forecast_session="2020-02-03",
            as_of_utc="2020-02-04T05:00:00Z",
            horizon_sessions=5,
            raw_prediction=0.0001,
            training_last_label_at_utc="2020-02-04T05:00:00Z",
            data_sha256="different_sha",
            model_config_sha256="sha_cfg",
        )
        for sym in SYMBOLS
    ]
    with pytest.raises(ValueError, match="inconsistent data_sha256"):
        allocate_from_forecasts(
            _forecast_slice(vars_neg, model_id="ridge_extended"),
            decision_session="2020-02-03",
            decision_cutoff_utc="2020-02-04T05:00:00Z",
            invalid_policy="fallback_rolling21",
            fallback_forecasts=bad_hash_fb,
        )
