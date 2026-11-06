"""Empirical realism screening for resampled multi-asset return paths (Phase 5)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, dataclass
from typing import Any, Literal

import numpy as np
import pandas as pd

from ripple.data.market import SYMBOLS


@dataclass(frozen=True)
class RealismThresholds:
    min_vol_ratio: float = 0.65
    max_vol_ratio: float = 1.45
    borderline_min_vol_ratio: float = 0.75
    borderline_max_vol_ratio: float = 1.35
    max_tail_q01_multiple: float = 1.65
    max_corr_abs_diff: float = 0.25
    borderline_corr_abs_diff: float = 0.18
    min_mean_sq_autocorr_lag1: float = -0.05
    borderline_sq_autocorr_lag1: float = 0.02
    max_drawdown_multiple: float = 1.75
    borderline_drawdown_multiple: float = 1.45


@dataclass(frozen=True)
class RealismVerdict:
    verdict: Literal["valid", "borderline", "rejected"]
    reasons: tuple[str, ...]
    metrics: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _log_return_matrix(frame: pd.DataFrame, symbols: Sequence[str] = SYMBOLS) -> pd.DataFrame:
    piv = frame.pivot(index="session", columns="symbol", values="close").reindex(columns=symbols)
    return np.log(piv / piv.shift(1)).dropna()


def _max_drawdown_per_asset(
    frame: pd.DataFrame, symbols: Sequence[str] = SYMBOLS
) -> dict[str, float]:
    piv = frame.pivot(index="session", columns="symbol", values="close").reindex(columns=symbols)
    out: dict[str, float] = {}
    for sym in symbols:
        prices = piv[sym].to_numpy(dtype=float)
        peaks = np.maximum.accumulate(prices)
        out[sym] = float(np.min(prices / peaks - 1.0))
    return out


def _drawdown_episode_count(prices: np.ndarray, threshold: float = -0.10) -> int:
    peaks = np.maximum.accumulate(prices)
    dd = prices / peaks - 1.0
    in_dd = dd <= threshold
    transitions = np.diff(in_dd.astype(int), prepend=0)
    return int(np.sum(transitions == 1))


def _sq_autocorr(series: pd.Series, lag: int) -> float:
    sq = series**2
    if len(sq) <= lag + 2 or float(sq.std()) < 1e-15:
        return 0.0
    val = sq.autocorr(lag=lag)
    return float(val) if pd.notna(val) and np.isfinite(val) else 0.0


def screen_path_realism(
    candidate_frame: pd.DataFrame,
    reference_frame: pd.DataFrame,
    *,
    thresholds: RealismThresholds = RealismThresholds(),
    symbols: Sequence[str] = SYMBOLS,
) -> RealismVerdict:
    """Evaluate a candidate multi-asset path against historical empirical constraints."""
    ref_ret = _log_return_matrix(reference_frame, symbols)
    cand_ret = _log_return_matrix(candidate_frame, symbols)

    ref_std = ref_ret.std(ddof=1)
    cand_std = cand_ret.std(ddof=1)
    vol_ratios = {
        sym: float(cand_std[sym] / max(float(ref_std[sym]), 1e-12)) for sym in symbols
    }

    # 1. Marginal tail quantiles (1%, 5%, 95%, 99%)
    ref_q01 = {sym: float(np.percentile(ref_ret[sym], 1.0)) for sym in symbols}
    cand_q01 = {sym: float(np.percentile(cand_ret[sym], 1.0)) for sym in symbols}
    cand_q05 = {sym: float(np.percentile(cand_ret[sym], 5.0)) for sym in symbols}
    cand_q95 = {sym: float(np.percentile(cand_ret[sym], 95.0)) for sym in symbols}
    cand_q99 = {sym: float(np.percentile(cand_ret[sym], 99.0)) for sym in symbols}
    tail_q01_multiples = {
        sym: float(abs(cand_q01[sym]) / max(abs(ref_q01[sym]), 1e-12)) for sym in symbols
    }

    # 2. Volatility clustering (lag-1 and lag-5 autocorrelation of squared returns)
    sq_ac1 = {sym: _sq_autocorr(cand_ret[sym], 1) for sym in symbols}
    sq_ac5 = {sym: _sq_autocorr(cand_ret[sym], 5) for sym in symbols}
    mean_sq_ac1 = float(np.mean(list(sq_ac1.values())))
    mean_sq_ac5 = float(np.mean(list(sq_ac5.values())))

    # 3. Cross-asset correlations and rolling-window variation
    ref_corr = ref_ret.corr().to_numpy(dtype=float)
    cand_corr = cand_ret.corr().to_numpy(dtype=float)
    max_corr_diff = float(np.max(np.abs(cand_corr - ref_corr)))
    frobenius_corr_diff = float(np.linalg.norm(cand_corr - ref_corr, ord="fro"))
    if len(cand_ret) >= 63:
        rolling_spy_ief = (
            cand_ret["SPY"].rolling(63).corr(cand_ret["IEF"]).dropna().to_numpy(dtype=float)
        )
        rolling_corr_std = (
            float(np.std(rolling_spy_ief, ddof=1)) if len(rolling_spy_ief) > 1 else 0.0
        )
    else:
        rolling_corr_std = 0.0

    # 4. Drawdown severity and frequency
    ref_dd = _max_drawdown_per_asset(reference_frame, symbols)
    cand_dd = _max_drawdown_per_asset(candidate_frame, symbols)
    dd_multiples = {
        sym: float(abs(cand_dd[sym]) / max(abs(ref_dd[sym]), 0.02)) for sym in symbols
    }
    piv_cand = candidate_frame.pivot(index="session", columns="symbol", values="close").reindex(
        columns=symbols
    )
    dd_episodes = {
        sym: _drawdown_episode_count(piv_cand[sym].to_numpy(dtype=float), -0.10)
        for sym in symbols
    }

    # 5. Regime representation (high-recent-variance fraction sq21 > 0.0004)
    sq21_spy = (cand_ret["SPY"] ** 2).rolling(21).mean().dropna()
    high_var_fraction = float((sq21_spy > 0.0004).mean()) if len(sq21_spy) else 0.0

    reject_reasons: list[str] = []
    borderline_reasons: list[str] = []

    for sym, ratio in vol_ratios.items():
        if ratio < thresholds.min_vol_ratio or ratio > thresholds.max_vol_ratio:
            reject_reasons.append(f"vol_ratio_out_of_bounds:{sym}={ratio:.3f}")
        elif (
            ratio < thresholds.borderline_min_vol_ratio
            or ratio > thresholds.borderline_max_vol_ratio
        ):
            borderline_reasons.append(f"vol_ratio_borderline:{sym}={ratio:.3f}")

    for sym, mult in tail_q01_multiples.items():
        if mult > thresholds.max_tail_q01_multiple:
            reject_reasons.append(f"tail_q01_excess:{sym}={mult:.3f}")

    if max_corr_diff > thresholds.max_corr_abs_diff:
        reject_reasons.append(f"cross_asset_corr_drift:{max_corr_diff:.3f}")
    elif max_corr_diff > thresholds.borderline_corr_abs_diff:
        borderline_reasons.append(f"cross_asset_corr_borderline:{max_corr_diff:.3f}")

    if mean_sq_ac1 < thresholds.min_mean_sq_autocorr_lag1:
        reject_reasons.append(f"missing_vol_clustering_ac1:{mean_sq_ac1:.3f}")
    elif mean_sq_ac1 < thresholds.borderline_sq_autocorr_lag1:
        borderline_reasons.append(f"weak_vol_clustering_ac1:{mean_sq_ac1:.3f}")

    for sym, mult in dd_multiples.items():
        if mult > thresholds.max_drawdown_multiple:
            reject_reasons.append(f"excess_drawdown:{sym}={mult:.3f}")
        elif mult > thresholds.borderline_drawdown_multiple:
            borderline_reasons.append(f"borderline_drawdown:{sym}={mult:.3f}")

    if reject_reasons:
        verdict: Literal["valid", "borderline", "rejected"] = "rejected"
        reasons = tuple(reject_reasons + borderline_reasons)
    elif borderline_reasons:
        verdict = "borderline"
        reasons = tuple(borderline_reasons)
    else:
        verdict = "valid"
        reasons = ("passed_all_empirical_screens",)

    metrics = {
        "vol_ratios": vol_ratios,
        "tail_q01": cand_q01,
        "tail_q05": cand_q05,
        "tail_q95": cand_q95,
        "tail_q99": cand_q99,
        "tail_q01_multiples": tail_q01_multiples,
        "sq_autocorr_lag1": sq_ac1,
        "sq_autocorr_lag5": sq_ac5,
        "mean_sq_autocorr_lag1": mean_sq_ac1,
        "mean_sq_autocorr_lag5": mean_sq_ac5,
        "max_corr_abs_diff": max_corr_diff,
        "frobenius_corr_diff": frobenius_corr_diff,
        "rolling_spy_ief_corr_std": rolling_corr_std,
        "max_drawdowns": cand_dd,
        "drawdown_multiples": dd_multiples,
        "drawdown_episodes_10pct": dd_episodes,
        "spy_high_variance_regime_fraction": high_var_fraction,
    }
    return RealismVerdict(verdict=verdict, reasons=reasons, metrics=metrics)
