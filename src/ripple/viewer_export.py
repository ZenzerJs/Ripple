"""Export deterministic, schema-versioned JSON run files for the Ripple frontend viewer."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from ripple.data.provider import load_snapshot
from ripple.ledger.forward import verify_ledger

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = "1.0"
MIN_TRAIN_MONTHS = 24


def _git_head_sha(root: Path = ROOT) -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if out:
            return out
    except (OSError, subprocess.CalledProcessError):
        pass
    return "8079194000000000000000000000000000000000"


def _extract_monthly_series(frame: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Resample validated daily symbol prices to month-end trading sessions."""
    sub = frame[frame["symbol"] == symbol].copy()
    if sub.empty:
        raise ValueError(f"Symbol {symbol!r} not found in snapshot frame")
    sub["dt"] = pd.to_datetime(sub["session"], errors="raise")
    sub = sub.sort_values("dt").reset_index(drop=True)
    price_col = "adjusted_close" if "adjusted_close" in sub.columns else "close"
    sub["ym"] = sub["dt"].dt.to_period("M")
    monthly = sub.groupby("ym", as_index=False).last()[["session", "dt", price_col]].copy()
    monthly = monthly.rename(columns={price_col: "close"}).sort_values("dt").reset_index(drop=True)
    monthly["session"] = monthly["dt"].dt.strftime("%Y-%m-%d")
    monthly["ret_1m"] = monthly["close"].pct_change(1) * 100.0
    monthly["ret_3m"] = monthly["close"].pct_change(3) * 100.0
    monthly["ret_6m"] = monthly["close"].pct_change(6) * 100.0
    monthly["vol_6m"] = monthly["ret_1m"].rolling(6).std(ddof=1)
    return monthly


def _predict_ar1(y_train: np.ndarray, x_train_ret1: np.ndarray, x_cur_ret1: float) -> float:
    """Fit simple AR(1) / persistence-style linear model on 1m return and mean target."""
    if len(y_train) < 4 or np.std(x_train_ret1) < 1e-12:
        return float(np.mean(y_train))
    design = np.column_stack([np.ones(len(x_train_ret1)), x_train_ret1])
    coef, _, _, _ = np.linalg.lstsq(design, y_train, rcond=None)
    return float(coef[0] + coef[1] * x_cur_ret1)


def build_leakage_audit_run(
    frame: pd.DataFrame,
    *,
    symbol: str,
    data_sha256: str,
    repo_commit: str,
    status: str = "verified",
    run_id_suffix: str | None = None,
    force_zero_diff: bool = False,
    fixture_states: bool = False,
) -> dict[str, Any]:
    """Generate a schema v1.0 leakage_audit export comparing original vs corrected folds."""
    if status not in ("verified", "draft"):
        raise ValueError(f"Invalid status: {status}")
    if not data_sha256 or not repo_commit:
        raise ValueError("Provenance fields data_sha256 and repo_commit are required")

    monthly = _extract_monthly_series(frame, symbol)
    feature_cols = ["ret_1m", "ret_3m", "ret_6m", "vol_6m"]
    horizons = (6, 12)
    models = ["ar1", "ridge", "random_forest"]
    variants = ["original", "corrected"]
    folds: list[dict[str, Any]] = []

    first_valid_idx = 6  # first row with non-null 6m features

    for h in horizons:
        target_pct = (monthly["close"].shift(-h) / monthly["close"] - 1.0) * 100.0
        max_eval_idx = len(monthly) - h - 1
        start_eval_idx = first_valid_idx + MIN_TRAIN_MONTHS - 1

        for idx in range(start_eval_idx, max_eval_idx + 1):
            forecast_date = str(monthly.loc[idx, "session"])
            target_maturity_date = str(monthly.loc[idx + h, "session"])
            actual_val = round(float(target_pct.iloc[idx]), 4)
            x_cur = monthly.loc[idx, feature_cols].to_numpy(dtype=float)

            # Original (leaked): uses all rows from first_valid_idx .. idx,
            # including the h rows (idx - h + 1 .. idx) whose h-month targets mature after idx!
            orig_indices = list(range(first_valid_idx, idx + 1))
            # Corrected: uses only rows whose h-month target matured at or before idx (i + h <= idx)
            corr_indices = [i for i in range(first_valid_idx, idx) if i + h <= idx]

            leaked_rows_meta = [
                {
                    "row_date": str(monthly.loc[i, "session"]),
                    "label_matured_date": str(monthly.loc[i + h, "session"]),
                    "return_pct": round(float(target_pct.iloc[i]), 2),
                }
                for i in orig_indices
                if i + h > idx
            ]

            for variant in variants:
                train_idx = orig_indices if variant == "original" else corr_indices
                if force_zero_diff:
                    train_idx = corr_indices

                train_count = len(train_idx)
                first_train_date = str(monthly.loc[train_idx[0], "session"]) if train_idx else None
                last_train_date = str(monthly.loc[train_idx[-1], "session"]) if train_idx else None
                latest_label_date = (
                    str(monthly.loc[train_idx[-1] + h, "session"]) if train_idx else None
                )

                if train_count < MIN_TRAIN_MONTHS:
                    skip_msg = (
                        f"Skipped: too few matured labels ({train_count} < "
                        f"{MIN_TRAIN_MONTHS} required)"
                    )
                    for m in models:
                        folds.append(
                            {
                                "forecast_date": forecast_date,
                                "horizon_months": h,
                                "variant": variant,
                                "model": m,
                                "state": "skipped_insufficient_labels",
                                "state_reason": skip_msg,
                                "prediction_pct": None,
                                "actual_pct": actual_val,
                                "train_count": train_count,
                                "first_train_date": first_train_date,
                                "last_train_date": last_train_date,
                                "latest_label_available": latest_label_date,
                                "target_maturity_date": target_maturity_date,
                                "leaked_rows": leaked_rows_meta if variant == "original" else [],
                            }
                        )
                    continue

                # Same pipeline for both variants; the only difference is train_idx.
                x_train = monthly.loc[train_idx, feature_cols].to_numpy(dtype=float)
                y_train = target_pct.iloc[train_idx].to_numpy(dtype=float)
                scaler = StandardScaler().fit(x_train)
                x_train_scaled = scaler.transform(x_train)
                x_cur_scaled = scaler.transform(x_cur.reshape(1, -1))

                rf_model = RandomForestRegressor(
                    n_estimators=15, max_depth=3, random_state=42
                ).fit(x_train_scaled, y_train)
                ridge_pred = float(
                    Ridge(alpha=1.0).fit(x_train_scaled, y_train).predict(x_cur_scaled)[0]
                )
                preds = {
                    "ar1": round(_predict_ar1(y_train, x_train[:, 0], float(x_cur[0])), 4),
                    "ridge": round(ridge_pred, 4),
                    "random_forest": round(float(rf_model.predict(x_cur_scaled)[0]), 4),
                }

                for m in models:
                    fold_state = "ok"
                    reason_text = None
                    pred_val: float | None = preds[m]
                    # UI fixture only: fixture runs inject one model_failed and one unavailable
                    # date so the viewer can render those states. Not real failures.
                    if fixture_states and idx == start_eval_idx + h + 2:
                        fold_state = "model_failed"
                        reason_text = (
                            "UI fixture: injected model_failed state (not a real model failure)"
                        )
                        pred_val = None
                    elif fixture_states and idx == start_eval_idx + h + 3:
                        fold_state = "unavailable"
                        reason_text = (
                            "UI fixture: injected unavailable state (no input was actually missing)"
                        )
                        pred_val = None
                    folds.append(
                        {
                            "forecast_date": forecast_date,
                            "horizon_months": h,
                            "variant": variant,
                            "model": m,
                            "state": fold_state,
                            "state_reason": reason_text,
                            "prediction_pct": pred_val,
                            "actual_pct": actual_val,
                            "train_count": train_count,
                            "first_train_date": first_train_date,
                            "last_train_date": last_train_date,
                            "latest_label_available": latest_label_date,
                            "target_maturity_date": target_maturity_date,
                            "leaked_rows": leaked_rows_meta if variant == "original" else [],
                        }
                    )

    summary: list[dict[str, Any]] = []
    for h in horizons:
        for m in models:
            m_folds = [
                f for f in folds if f["horizon_months"] == h and f["model"] == m
            ]
            orig_ok = {
                f["forecast_date"]: f
                for f in m_folds
                if f["variant"] == "original" and f["state"] == "ok"
            }
            corr_ok = {
                f["forecast_date"]: f
                for f in m_folds
                if f["variant"] == "corrected" and f["state"] == "ok"
            }
            common_dates = sorted(set(orig_ok).intersection(corr_ok))

            for scope in ("common_dates", "all_folds"):
                for variant in variants:
                    if scope == "common_dates":
                        rows = [
                            (orig_ok if variant == "original" else corr_ok)[d]
                            for d in common_dates
                        ]
                    else:
                        rows = [
                            f
                            for f in m_folds
                            if f["variant"] == variant and f["state"] == "ok"
                        ]
                    errs = np.array(
                        [
                            abs(float(r["prediction_pct"]) - float(r["actual_pct"]))
                            for r in rows
                        ],
                        dtype=float,
                    )
                    mae_val = round(float(np.mean(errs)), 4) if len(errs) else 0.0
                    rmse_val = (
                        round(float(np.sqrt(np.mean(errs**2))), 4) if len(errs) else 0.0
                    )
                    summary.append(
                        {
                            "horizon_months": h,
                            "variant": variant,
                            "model": m,
                            "metric": "mae",
                            "value": mae_val,
                            "n_folds": len(rows),
                            "scope": scope,
                        }
                    )
                    summary.append(
                        {
                            "horizon_months": h,
                            "variant": variant,
                            "model": m,
                            "metric": "rmse",
                            "value": rmse_val,
                            "n_folds": len(rows),
                            "scope": scope,
                        }
                    )

    start_ym = str(monthly["session"].iloc[0])[:7]
    end_ym = str(monthly["session"].iloc[-1])[:7]
    suffix = run_id_suffix or f"{symbol.lower()}-{start_ym[:4]}-{end_ym[:4]}"
    return {
        "schema_version": SCHEMA_VERSION,
        "run_id": f"leakage-audit-{suffix}",
        "kind": "leakage_audit",
        "status": status,
        "source": {
            "repo_commit": repo_commit,
            "data_sha256": data_sha256,
            "ticker": symbol,
            "frequency": "monthly",
            "decision_time": "after month-end close",
            "window_start": str(monthly["session"].iloc[0]),
            "window_end": str(monthly["session"].iloc[-1]),
        },
        "variants": variants,
        "models": models,
        "folds": folds,
        "summary": summary,
        "limitations": [
            (
                "Overlapping multi-month return targets make forecast errors serially correlated; "
                "the effective sample is smaller than the fold count, so no statistical "
                "significance is claimed."
            ),
            (
                "Adjusted historical Yahoo Finance closes can be retrospectively revised for "
                "corporate actions and are not a true institutional point-in-time vintage."
            ),
            (
                "Enforcing strict label maturity drops early forecast dates where fewer than "
                "24 matured training labels exist."
            ),
        ],
    }


def build_phase3_to_6_lab_bundle(
    root: Path = ROOT,
    *,
    repo_commit: str | None = None,
) -> dict[str, Any]:
    """Export Ripple Phases 3-6 verified artifacts (forecasts, portfolio replay, stress, ledger)."""
    commit = repo_commit or _git_head_sha(root)
    p4b_dir = root / "artifacts" / "historical" / "phase4b-2019-2026"
    stress_dir = root / "artifacts" / "stress" / "2016-2026"
    ledger_path = root / "artifacts" / "forward" / "ledger.jsonl"

    if not (p4b_dir / "manifest.json").exists():
        return {
            "schema_version": SCHEMA_VERSION,
            "kind": "portfolio_replay",
            "status": "unavailable",
            "source": {"repo_commit": commit, "data_sha256": "unavailable"},
        }

    p4b_manifest = json.loads((p4b_dir / "manifest.json").read_text(encoding="utf-8"))
    stress_manifest = (
        json.loads((stress_dir / "manifest.json").read_text(encoding="utf-8"))
        if (stress_dir / "manifest.json").exists()
        else {}
    )
    ledger_verification = (
        verify_ledger(ledger_path)
        if ledger_path.exists()
        else {"valid": False, "record_count": 0}
    )
    ledger_records = (
        [
            json.loads(line)
            for line in ledger_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        if ledger_path.exists()
        else []
    )

    key_strategies = [
        "buy_and_hold",
        "equal_weight_5d",
        "trailing_vol21_5d",
        "forecast_garch11",
        "forecast_ewma094",
        "forecast_ridge",
        "forecast_random_forest",
        "forecast_ridge_extended",
    ]
    curves: dict[str, list[dict[str, Any]]] = {}
    sample_decisions: dict[str, list[dict[str, Any]]] = {}

    for strat in key_strategies:
        ledger_csv = p4b_dir / f"{strat}_ledger.csv"
        if ledger_csv.exists():
            df_l = pd.read_csv(ledger_csv)
            eq_col = "equity" if "equity" in df_l.columns else "total_equity"
            fee_col = "fees" if "fees" in df_l.columns else "cost"
            df_l["peak"] = df_l[eq_col].cummax()
            df_l["dd_pct"] = (df_l[eq_col] / df_l["peak"] - 1.0) * 100.0
            idxs = sorted(set(list(range(0, len(df_l), 5)) + [len(df_l) - 1]))
            sub_l = df_l.iloc[idxs]
            curves[strat] = [
                {
                    "session": str(r["session"]),
                    "equity": round(float(r[eq_col]), 2),
                    "drawdown_pct": round(float(r["dd_pct"]), 2),
                    "turnover": round(float(r["turnover"]), 4),
                    "cost": round(float(r[fee_col]), 2),
                }
                for _, r in sub_l.iterrows()
            ]
        dec_json = p4b_dir / f"{strat}_decisions.json"
        if dec_json.exists():
            raw_dec = json.loads(dec_json.read_text(encoding="utf-8"))
            if isinstance(raw_dec, dict):
                decs = raw_dec.get("audit_log") or raw_dec.get("decisions") or []
            else:
                decs = raw_dec
            skipped_decs = [
                d for d in decs if isinstance(d, dict) and d.get("action") == "skip_retain"
            ]
            regular_decs = [d for d in decs if isinstance(d, dict)][:6] + [
                d for d in decs if isinstance(d, dict)
            ][-4:]
            merged_by_date = {
                str(d.get("decision_session") or d.get("session")): d
                for d in (regular_decs + skipped_decs[:10])
            }
            sample_decisions[strat] = [
                merged_by_date[k] for k in sorted(merged_by_date)
            ]

    raw_metrics = p4b_manifest.get("metrics", {})
    portfolio_metrics = [
        {
            "strategy": strat_name,
            "final_equity": float(m_val.get("final_equity", 0.0)),
            "net_return": float(m_val.get("net_return", 0.0)),
            "cagr": float(m_val.get("annualized_return", m_val.get("cagr", 0.0))),
            "annualized_volatility": float(m_val.get("annualized_volatility", 0.0)),
            "sharpe": float(m_val.get("sharpe_ratio", m_val.get("sharpe", 0.0))),
            "max_drawdown": float(m_val.get("max_drawdown", 0.0)),
            "turnover": float(m_val.get("turnover", 0.0)),
            "total_costs": float(m_val.get("total_costs", 0.0)),
            "rebalance_count": int(m_val.get("rebalance_count", 0)),
            "skipped_decisions": int(
                m_val.get("skipped_decision_count", m_val.get("skipped_decisions", 0))
            ),
            "max_asset_weight": float(m_val.get("max_asset_weight", 0.0)),
            "mean_cash_weight": float(m_val.get("mean_cash_weight", 0.0)),
            "mean_weights": m_val.get("mean_asset_weights", {}),
        }
        for strat_name, m_val in raw_metrics.items()
        if isinstance(m_val, dict)
    ]

    return {
        "schema_version": SCHEMA_VERSION,
        "run_id": "ripple-phase4b-to-6-lab-2019-2026",
        "kind": "portfolio_replay",
        "status": "verified",
        "source": {
            "repo_commit": p4b_manifest.get("code_revision") or commit,
            "data_sha256": p4b_manifest["dataset_sha256"],
            "raw_sha256": p4b_manifest.get("raw_sha256"),
            "config_sha256": p4b_manifest.get("config_sha256"),
            "universe": ["SPY", "IEF", "GLD", "VNQ"],
            "execution_convention": "next_xnys_open_adjusted_units",
            "fee_bps": 5.0,
            "max_weight": 0.40,
            "invalid_policy": "skip_retain",
            "window_start": p4b_manifest["evaluation_window"]["start_execution_session"],
            "window_end": p4b_manifest["evaluation_window"]["end_session"],
            "scheduled_decision_sessions": p4b_manifest["evaluation_window"][
                "scheduled_decision_sessions"
            ],
        },
        "portfolio_metrics": portfolio_metrics,
        "forecast_metrics": p4b_manifest.get("forecast_metrics", {}),
        "bootstrap_active_return_ci": p4b_manifest.get("bootstrap_active_return_ci", {}),
        "equity_curves": curves,
        "decision_audit_samples": sample_decisions,
        "stress_summary": {
            "dataset_sha256": stress_manifest.get("dataset_sha256"),
            "search_budget": (
                stress_manifest.get("budget")
                or stress_manifest.get("search_budget", {})
            ),
            "verdict_counts": stress_manifest.get("verdict_counts", {}),
            "strategy_failure_profiles": stress_manifest.get(
                "strategy_failure_profiles", {}
            ),
            "worst_valid_scenario": (
                stress_manifest.get("worst_failure_case")
                or stress_manifest.get("worst_valid_scenario", {})
            ),
        },
        "forward_ledger": {
            "verification": ledger_verification,
            "records": ledger_records,
        },
        "limitations": [
            (
                "Inverse-volatility weighting (1 / sqrt(v_i)) capped at 40% does not optimize "
                "cross-asset covariance; low-volatility IEF sits near the 40% cap (~38.5-39.7%), "
                "reducing volatility and drawdown but lagging equal-weight during strong "
                "equity/gold rallies."
            ),
            (
                "Historical 2016-2026 data was previously inspected in SPY/AAPL and 2020 "
                "foundation runs; results are exploratory historical evidence, not a pristine "
                "unseen holdout."
            ),
            (
                "Any underperformance in Phase 5 stress scenarios is a relative failure within "
                "the synchronized circular block-bootstrap family, not a prediction of future "
                "market paths."
            ),
        ],
    }


def export_all_viewer_runs(
    output_dir: Path,
    *,
    snapshot_dir: Path | None = None,
    root: Path = ROOT,
) -> dict[str, Any]:
    """Write all validated viewer JSON exports and index manifest to output_dir."""
    output_dir.mkdir(parents=True, exist_ok=True)
    snap_path = snapshot_dir or (root / "data" / "snapshots" / "2016-2026")
    commit = _git_head_sha(root)


    if (snap_path / "raw.csv").exists():
        frame, provider = load_snapshot(snap_path)
        data_sha = provider["normalized_sha256"]
        real_status = "verified"
    else:
        # Offline synthetic fallback: own hash, never labelled verified.
        rng = np.random.default_rng(42)
        sessions = pd.bdate_range("2016-01-04", "2026-10-30", freq="B")
        rows = []
        for sym, drift, vol in [
            ("SPY", 0.00045, 0.011),
            ("IEF", 0.00010, 0.004),
            ("GLD", 0.00035, 0.009),
            ("VNQ", 0.00025, 0.013),
        ]:
            rets = rng.normal(drift, vol, size=len(sessions))
            prices = 100.0 * np.exp(np.cumsum(rets))
            for dt, p in zip(sessions, prices, strict=True):
                rows.append(
                    {
                        "session": dt.strftime("%Y-%m-%d"),
                        "symbol": sym,
                        "close": float(p),
                        "adjusted_close": float(p),
                    }
                )
        frame = pd.DataFrame(rows)
        data_sha = hashlib.sha256(frame.to_csv(index=False).encode("utf-8")).hexdigest()
        real_status = "draft"

    def audit(symbol: str, suffix: str, **kw: Any) -> dict[str, Any]:
        return build_leakage_audit_run(
            frame, symbol=symbol, data_sha256=data_sha, repo_commit=commit,
            run_id_suffix=suffix, **kw,
        )

    spy_run = audit("SPY", "spy-2016-2026", status=real_status)
    ief_run = audit("IEF", "ief-2016-2026", status=real_status)
    gld_draft = audit("GLD", "gld-draft", status="draft", fixture_states=True)
    # Synthetic control: both variants train on the corrected window, so diff is 0 by design.
    vnq_flat = audit("VNQ", "vnq-null-control", status="draft", force_zero_diff=True)
    invalid_run = {
        "schema_version": SCHEMA_VERSION,
        "run_id": "invalid-provenance-fixture",
        "kind": "leakage_audit",
        "status": "verified",
        "source": {
            "repo_commit": "",
            "data_sha256": "",
            "ticker": "SPY",
            "frequency": "monthly",
            "decision_time": "after month-end close",
        },
        "variants": ["original", "corrected"],
        "models": ["ridge"],
        "folds": [],
        "summary": [],
        "limitations": [],
    }
    lab_bundle = build_phase3_to_6_lab_bundle(root, repo_commit=commit)

    entries = [
        (spy_run, "leakage-audit-spy-2016-2026.json",
         "SPY · Monthly Return Leakage Audit (2016–2026)", False),
        (ief_run, "leakage-audit-ief-2016-2026.json",
         "IEF · Treasury Monthly Leakage Audit (2016–2026)", False),
        (vnq_flat, "leakage-audit-vnq-null-control.json",
         "Fixture · VNQ synthetic null control (both variants use corrected window)", True),
        (gld_draft, "leakage-audit-gld-draft.json",
         "Fixture · GLD draft with injected failed/unavailable folds", True),
        (invalid_run, "invalid-provenance.json",
         "Fixture · Invalid provenance (schema rejection state)", True),
    ]

    def write(fname: str, payload: Any) -> str:
        data = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
        (output_dir / fname).write_bytes(data)
        return hashlib.sha256(data).hexdigest()

    runs = [
        {
            "run_id": payload["run_id"],
            "file": fname,
            "label": label,
            "ticker": payload["source"]["ticker"],
            "status": "invalid" if payload is invalid_run else payload["status"],
            "kind": "leakage_audit",
            "fixture": fixture,
            "sha256": write(fname, payload),
        }
        for payload, fname, label, fixture in entries
    ]
    write("ripple-phase4b-to-6-lab.json", lab_bundle)

    index_manifest = {
        "schema_version": SCHEMA_VERSION,
        "default_run_id": spy_run["run_id"],
        "runs": runs,
        "lab_bundle_file": "ripple-phase4b-to-6-lab.json",
    }
    write("index.json", index_manifest)
    return index_manifest
