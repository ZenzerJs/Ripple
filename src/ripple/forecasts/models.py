"""Point-in-time five-session variance forecasters across the four-ETF universe."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

import exchange_calendars as xc
import numpy as np
import pandas as pd
from arch import arch_model
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from ripple.data.market import SYMBOLS
from ripple.forecasts.adapter import classify_prediction, sha256_json
from ripple.forecasts.schema import VarianceForecast, parse_utc

EPSILON = 1e-12
CORE_MODELS = ("rolling21", "ewma094", "garch11", "ridge", "random_forest")
MODELS = (
    "persistence5",
    "rolling21",
    "ewma094",
    "garch11",
    "har_ols",
    "ridge",
    "random_forest",
    "ridge_extended",
)
BASE_FEATURES = ["sq1", "sq5", "sq21"]
EXTRA_FEATURES = ["sq_lag1", "sq_lag2", "sq_lag9", "signed5", "signed21"]

DEFAULT_MODEL_CONFIG = {
    "horizon_sessions": 5,
    "min_train_mature": 756,
    "window_sessions": 1260,
    "step_sessions": 5,
    "rf_trees": 100,
    "rf_seed": 42,
    "ridge_alpha": 1.0,
    "ewma_lambda": 0.94,
    "qlike_floor": EPSILON,
    "high_recent_variance_threshold": 0.0004,
}


def qlike(actual: float, prediction: float) -> float:
    """Declared QLIKE loss with epsilon floor for finite predictions and nonnegative targets."""
    if not np.isfinite(actual) or actual < 0 or not np.isfinite(prediction):
        raise ValueError("QLIKE requires finite prediction and nonnegative finite target")
    pred_f = max(float(prediction), EPSILON)
    act_f = max(float(actual), EPSILON)
    return float(np.log(pred_f) + act_f / pred_f)


def calendar_grid(
    frame: pd.DataFrame,
    as_of: str | datetime,
    *,
    start_session: str | None = None,
    end_session: str | None = None,
) -> pd.DataFrame:
    """Reindex single-asset prices to XNYS sessions without forward-filling missing dates."""
    cutoff = pd.Timestamp(parse_utc(as_of))
    dates = pd.to_datetime(frame["session"], errors="raise")
    if dates.dt.tz is not None:
        raise ValueError("session labels must be timezone-naive calendar dates")
    if dates.duplicated().any() or not dates.is_monotonic_increasing:
        raise ValueError("session labels must be unique and sorted")
    if (dates != dates.dt.normalize()).any():
        raise ValueError("session labels must be normalized dates")
    first = pd.Timestamp(start_session) if start_session is not None else dates.iloc[0]
    last = pd.Timestamp(end_session) if end_session is not None else dates.iloc[-1]
    cal = xc.get_calendar("XNYS", start=first, end=last + pd.Timedelta(days=10))
    sessions = cal.sessions_in_range(first, last)
    if not pd.DatetimeIndex(dates).isin(sessions).all():
        raise ValueError("non-XNYS session in input")
    close_col = "adjusted_close" if "adjusted_close" in frame.columns else "close"
    close = pd.Series(
        frame[close_col].to_numpy(dtype=float), index=pd.DatetimeIndex(dates)
    ).reindex(sessions)
    if ((close <= 0) & close.notna()).any() or np.isinf(close).any():
        raise ValueError("invalid close price")
    availability = pd.Series(
        (sessions + pd.Timedelta(days=1)).tz_localize("America/New_York").tz_convert("UTC"),
        index=sessions,
    )
    close = close.where(availability <= cutoff)
    ret = np.log(close / close.shift(1))
    return pd.DataFrame(
        {"close": close, "available_at": availability, "return": ret}, index=sessions
    )



def multi_asset_calendar_grids(
    frame: pd.DataFrame,
    as_of: str | datetime,
    *,
    symbols: Sequence[str] = SYMBOLS,
) -> dict[str, pd.DataFrame]:
    """Align all four ETFs on one shared XNYS session calendar without filling gaps."""
    required = {"session", "symbol"}
    if not required.issubset(frame.columns):
        raise ValueError(f"Missing columns: {sorted(required - set(frame.columns))}")
    if not ({"close"} <= set(frame.columns) or {"adjusted_close"} <= set(frame.columns)):
        raise ValueError("Frame must include 'close' or 'adjusted_close'")
    present = set(frame["symbol"].unique())
    if present != set(symbols):
        raise ValueError(f"Expected symbols {list(symbols)}, got {sorted(present)}")
    all_dates = pd.to_datetime(frame["session"], errors="raise")
    start_str = all_dates.min().strftime("%Y-%m-%d")
    end_str = all_dates.max().strftime("%Y-%m-%d")
    grids: dict[str, pd.DataFrame] = {}
    for sym in symbols:
        sub = frame[frame["symbol"] == sym].sort_values("session").reset_index(drop=True)
        grids[sym] = calendar_grid(sub, as_of, start_session=start_str, end_session=end_str)
    ref_index = grids[symbols[0]].index
    for sym in symbols[1:]:
        if not grids[sym].index.equals(ref_index):
            raise ValueError(f"Calendar index mismatch for {sym}")
    return grids


def make_dataset(grid: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    """Compute lagged squared/signed return features and 5-session ahead variance target."""
    r = grid["return"]
    sq = r**2
    x = pd.DataFrame(
        {
            "sq1": sq,
            "sq5": sq.rolling(5).mean(),
            "sq21": sq.rolling(21).mean(),
            "sq_lag1": sq.shift(1),
            "sq_lag2": sq.shift(2),
            "sq_lag9": sq.shift(9),
            "signed5": r.rolling(5).mean(),
            "signed21": r.rolling(21).mean(),
        },
        index=grid.index,
    )
    future = pd.concat([sq.shift(-j) for j in range(1, 6)], axis=1)
    target = future.mean(axis=1).where(future.notna().all(axis=1))
    maturity = grid["available_at"].shift(-5)
    return x, target, maturity


def training_indices(
    x: pd.DataFrame,
    target: pd.Series,
    maturity: pd.Series,
    tp: int,
    cutoff: str | datetime,
    window: int = 1260,
    feature_cols: Sequence[str] | None = None,
) -> np.ndarray:
    """Return indices in [max(0, tp-window+1), tp) whose features and 5-day labels have matured."""
    cutoff_ts = pd.Timestamp(parse_utc(cutoff))
    cols = list(feature_cols) if feature_cols is not None else list( x.columns )
    mask = x[cols].notna().all(axis=1) & target.notna() & (maturity <= cutoff_ts)
    mask.iloc[: max(0, tp - window + 1)] = False
    mask.iloc[tp:] = False
    return np.flatnonzero(mask.to_numpy())


def return_suffix(grid: pd.DataFrame, tp: int, window: int = 1260) -> pd.Series:
    """Latest contiguous non-missing return suffix up to tp, capped at window sessions."""
    ret = grid["return"].iloc[max(0, tp - window + 1) : tp + 1]
    missing = np.flatnonzero(ret.isna().to_numpy())
    return ret.iloc[missing[-1] + 1 :] if len(missing) else ret


def fit_models(
    grid: pd.DataFrame,
    x: pd.DataFrame,
    y: pd.Series,
    tp: int,
    train_idx: np.ndarray,
    *,
    min_train: int = 756,
    window: int = 1260,
    models: Sequence[str] = MODELS,
) -> dict[str, dict[str, Any]]:
    """Fit each declared variance model at candidate index tp with no silent fallback."""
    results: dict[str, dict[str, Any]] = {}
    if pd.isna(grid["close"].iloc[tp]) or x.iloc[tp][BASE_FEATURES].isna().any():
        return {
            name: {"status": "unavailable", "prediction": None, "error": "features_unavailable"}
            for name in models
        }
    if len(train_idx) < min_train:
        return {
            name: {
                "status": "insufficient_mature_labels",
                "prediction": None,
                "error": f"train_count={len(train_idx)}<{min_train}",
            }
            for name in models
        }
    suffix = return_suffix(grid, tp, window=window)
    xt = x.iloc[[tp]]

    def calculate(name: str) -> tuple[float | None, dict[str, Any]]:
        if name == "persistence5":
            return float(xt["sq5"].iloc[0]), {}
        if name == "rolling21":
            return float(xt["sq21"].iloc[0]), {}
        if name == "ewma094":
            if not len(suffix):
                raise ValueError("no contiguous returns")
            values = suffix.to_numpy() ** 2
            value = float(values[0])
            for item in values[1:]:
                value = 0.94 * value + 0.06 * float(item)
            return float(value), {"return_count": int(len(values))}
        if name == "garch11":
            if len(suffix) < min_train:
                raise ValueError("insufficient contiguous returns for GARCH")
            fitted = arch_model(
                suffix.to_numpy() * 100.0,
                mean="Zero",
                vol="GARCH",
                p=1,
                q=1,
                dist="normal",
                rescale=False,
            ).fit(disp="off", show_warning=False)
            code = int(fitted.convergence_flag)
            if code != 0:
                return None, {
                    "status": "nonconverged",
                    "optimizer_code": code,
                    "return_count": int(len(suffix)),
                    "error": f"convergence_flag={code}",
                }
            variance = np.asarray(
                fitted.forecast(horizon=5, method="analytic").variance.iloc[-1], dtype=float
            )
            if len(variance) != 5:
                raise ValueError("unexpected GARCH forecast shape")
            return float(variance.mean() / 10000.0), {
                "optimizer_code": code,
                "return_count": int(len(suffix)),
            }
        cols = BASE_FEATURES + EXTRA_FEATURES if name == "ridge_extended" else BASE_FEATURES
        if xt[cols].isna().any(axis=1).iloc[0]:
            return None, {"status": "unavailable", "error": "extended_features_unavailable"}
        train_x = x.iloc[train_idx][cols].to_numpy()
        test_x = xt[cols].to_numpy()
        train_y = y.iloc[train_idx].to_numpy()
        if name == "har_ols":
            model: Any = LinearRegression()
        elif name in ("ridge", "ridge_extended"):
            model = make_pipeline(StandardScaler(), Ridge(alpha=1.0))
        elif name == "random_forest":
            model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=1)
        else:
            raise ValueError(f"unknown model: {name}")
        model.fit(train_x, train_y)
        return float(model.predict(test_x)[0]), {}

    for name in models:
        try:
            prediction, meta = calculate(name)
            if prediction is None and "status" in meta:
                results[name] = {"prediction": None, **meta}
                continue
            if prediction is None or not np.isfinite(prediction):
                results[name] = {
                    "status": "invalid",
                    "prediction": prediction,
                    "error": "nonfinite_prediction",
                    **meta,
                }
                continue
            results[name] = {"status": "ok", "prediction": float(prediction), **meta}
        except Exception as exc:
            results[name] = {
                "status": "failed",
                "prediction": None,
                "error_type": type(exc).__name__,
                "error": str(exc),
            }
    return results


def generate_multi_asset_forecasts(
    frame: pd.DataFrame,
    *,
    as_of: str | datetime,
    data_sha256: str,
    models: Sequence[str] = MODELS,
    min_train: int = 756,
    window: int = 1260,
    step: int = 5,
    symbols: Sequence[str] = SYMBOLS,
) -> tuple[list[VarianceForecast], pd.DataFrame, list[dict[str, Any]], dict[str, Any]]:
    """Run point-in-time 5-session variance forecasters across all four ETFs."""
    cutoff = parse_utc(as_of)
    grids = multi_asset_calendar_grids(frame, cutoff, symbols=symbols)
    datasets = {sym: make_dataset(grids[sym]) for sym in symbols}
    sessions = grids[symbols[0]].index
    config_obj = {
        **DEFAULT_MODEL_CONFIG,
        "min_train_mature": int(min_train),
        "window_sessions": int(window),
        "step_sessions": int(step),
        "models": list(models),
        "symbols": list(symbols),
    }
    config_sha = sha256_json(config_obj)

    forecasts: list[VarianceForecast] = []
    rows: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    start_idx = 21 + min_train + 5
    with threadpool_limits(limits=1):
        for tp in range(start_idx, len(sessions), step):
            session_str = sessions[tp].strftime("%Y-%m-%d")
            decision_ts = grids[symbols[0]]["available_at"].iloc[tp]
            decision_iso = decision_ts.isoformat()
            if decision_ts > pd.Timestamp(cutoff):
                skipped.append(
                    {
                        "forecast_session": session_str,
                        "forecast_as_of": decision_iso,
                        "reason": "decision_after_cutoff",
                    }
                )
                continue

            for sym in symbols:
                grid = grids[sym]
                x, y, maturity = datasets[sym]
                idx = training_indices(x, y, maturity, tp, decision_ts, window=window)
                features_missing = bool(
                    pd.isna(grid["close"].iloc[tp]) or x.iloc[tp].isna().any()
                )
                if features_missing:
                    skipped.append(
                        {
                            "asset": sym,
                            "forecast_session": session_str,
                            "forecast_as_of": decision_iso,
                            "reason": "forecast_features_unavailable",
                        }
                    )
                elif len(idx) < min_train:
                    skipped.append(
                        {
                            "asset": sym,
                            "forecast_session": session_str,
                            "forecast_as_of": decision_iso,
                            "reason": "insufficient_mature_labels",
                            "train_count": int(len(idx)),
                        }
                    )

                has_target = bool(
                    tp + 5 < len(grid)
                    and pd.notna(y.iloc[tp])
                    and maturity.iloc[tp] <= pd.Timestamp(cutoff)
                )
                actual = float(y.iloc[tp]) if has_target else None
                target_end = grid.index[tp + 5].strftime("%Y-%m-%d") if tp + 5 < len(grid) else None
                target_avail = (
                    maturity.iloc[tp].isoformat()
                    if tp + 5 < len(grid) and pd.notna(maturity.iloc[tp])
                    else None
                )
                sq21_val = float(x["sq21"].iloc[tp]) if pd.notna(x["sq21"].iloc[tp]) else None
                regime = (
                    "high_recent_variance"
                    if sq21_val is not None and sq21_val > 0.0004
                    else "typical_recent_variance"
                )
                last_label_utc = (
                    maturity.iloc[idx].max().to_pydatetime() if len(idx) > 0 else None
                )
                cutoff_session = grid.index[idx[-1]].strftime("%Y-%m-%d") if len(idx) > 0 else None

                model_outputs = fit_models(
                    grid, x, y, tp, idx, min_train=min_train, window=window, models=models
                )
                for model_name, out in model_outputs.items():
                    raw_pred = out.get("prediction")
                    raw_status = out["status"]
                    vf = classify_prediction(
                        asset=sym,
                        model_id=model_name,
                        forecast_session=session_str,
                        as_of_utc=decision_ts.to_pydatetime(),
                        horizon_sessions=5,
                        raw_prediction=raw_pred,
                        training_last_label_at_utc=last_label_utc,
                        data_sha256=data_sha256,
                        model_config_sha256=config_sha,
                        status=raw_status if raw_status != "ok" else "ok",
                        training_cutoff_session=cutoff_session,
                        train_count=int(len(idx)),
                        regime=regime,
                        error=out.get("error"),
                    )
                    forecasts.append(vf)
                    row = vf.to_dict()
                    row["actual_variance"] = actual
                    row["target_end"] = target_end
                    row["target_available_at"] = target_avail
                    row["recent_variance21"] = sq21_val
                    if (
                        actual is not None
                        and raw_pred is not None
                        and np.isfinite(raw_pred)
                        and raw_status == "ok"
                    ):
                        row["error_actual_minus_raw"] = float(actual - raw_pred)
                        row["raw_qlike"] = qlike(actual, float(raw_pred))
                        row["prediction_floored_for_qlike"] = bool(raw_pred < EPSILON)
                        row["actual_floored_for_qlike"] = bool(actual < EPSILON)
                    else:
                        row["error_actual_minus_raw"] = None
                        row["raw_qlike"] = None
                        row["prediction_floored_for_qlike"] = False
                        row["actual_floored_for_qlike"] = False
                    rows.append(row)

    forecasts_df = pd.DataFrame(rows)
    summary = summarize_forecasts(forecasts_df, models=models, symbols=symbols)
    return forecasts, forecasts_df, skipped, summary


def summarize_forecasts(
    forecasts_df: pd.DataFrame,
    *,
    models: Sequence[str] = MODELS,
    symbols: Sequence[str] = SYMBOLS,
) -> dict[str, Any]:
    """Compute per-model, per-asset, and common-date forecast evaluation metrics."""
    if forecasts_df.empty:
        return {"models": {}, "common_decision_sessions": 0}

    def _score(sub: pd.DataFrame) -> dict[str, Any]:
        scored = sub[sub["error_actual_minus_raw"].notna()].copy()
        if scored.empty:
            return {"count": 0, "mae": None, "rmse": None, "qlike": None}
        err = scored["error_actual_minus_raw"].to_numpy(dtype=float)
        ql = scored["raw_qlike"].to_numpy(dtype=float)
        return {
            "count": int(len(scored)),
            "mae": float(np.mean(np.abs(err))),
            "rmse": float(np.sqrt(np.mean(err**2))),
            "qlike": float(np.mean(ql)),
            "prediction_floor_count": int(scored["prediction_floored_for_qlike"].sum()),
            "invalid_variance_count": int((sub["status"] == "invalid").sum()),
        }

    ok_df = forecasts_df[forecasts_df["status"] == "ok"]
    expected_pairs = len(models) * len(symbols)
    pair_counts = ok_df.groupby("forecast_session").size()
    common_sessions = sorted(pair_counts[pair_counts == expected_pairs].index.tolist())

    model_summary: dict[str, Any] = {}
    for model_name in models:
        m_df = forecasts_df[forecasts_df["model_id"] == model_name]
        status_counts = {str(k): int(v) for k, v in m_df["status"].value_counts().items()}
        by_asset = {
            sym: _score(m_df[m_df["asset"] == sym])
            for sym in symbols
        }
        common_m = m_df[m_df["forecast_session"].isin(common_sessions)]
        model_summary[model_name] = {
            "status_counts": status_counts,
            "overall_raw_scored": _score(m_df),
            "common_dates_scored": _score(common_m),
            "by_asset": by_asset,
        }
    return {
        "common_decision_sessions": len(common_sessions),
        "total_decision_sessions": int(forecasts_df["forecast_session"].nunique()),
        "models": model_summary,
    }
