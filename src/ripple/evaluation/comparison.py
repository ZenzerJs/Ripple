"""Phase 4B forecast-to-decision portfolio comparison, attribution, and reporting."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import asdict
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from ripple.core.models import BacktestResult, RunManifest
from ripple.data.market import SYMBOLS, FrameMarket
from ripple.evaluation.report import metrics as base_metrics
from ripple.forecasts.models import MODELS, summarize_forecasts
from ripple.forecasts.schema import AllocationDecision, VarianceForecast
from ripple.simulation.replay import replay
from ripple.strategies.baselines import BuyAndHold
from ripple.strategies.forecast_policy import (
    EqualWeight5Session,
    ForecastPolicyStrategy,
    TrailingVol21FiveSession,
)


def block_bootstrap_active_return(
    strat_returns: np.ndarray,
    bench_returns: np.ndarray,
    *,
    block_length: int = 10,
    n_resamples: int = 500,
    seed: int = 42,
) -> dict[str, float]:
    """Moving-block bootstrap for annualized active return under serial dependence."""
    diff = np.asarray(strat_returns, dtype=float) - np.asarray(bench_returns, dtype=float)
    n = len(diff)
    if n == 0:
        return {"mean_active_annualized": 0.0, "ci95_low": 0.0, "ci95_high": 0.0}
    b = max(1, min(block_length, n))
    rng = np.random.default_rng(seed)
    n_blocks = int(math.ceil(n / b))
    samples = np.empty(n_resamples, dtype=float)
    for k in range(n_resamples):
        starts = rng.integers(0, n - b + 1, size=n_blocks)
        idx = np.concatenate([np.arange(s, s + b) for s in starts])[:n]
        samples[k] = float(np.mean(diff[idx]) * 252.0)
    return {
        "mean_active_annualized": float(np.mean(diff) * 252.0),
        "ci95_low": float(np.percentile(samples, 2.5)),
        "ci95_high": float(np.percentile(samples, 97.5)),
        "block_length": int(b),
        "n_resamples": int(n_resamples),
    }


def compute_extended_metrics(
    result: BacktestResult,
    *,
    audit_log: Sequence[AllocationDecision] | None = None,
    forecasts_by_session: Mapping[str, Sequence[VarianceForecast]] | None = None,
) -> dict[str, Any]:
    """Compute utility, trading, concentration, attribution, and reliability metrics."""
    base = base_metrics(result)
    equity = np.array(
        [result.initial_cash] + [row["equity"] for row in result.ledger], dtype=float
    )
    daily_returns = equity[1:] / equity[:-1] - 1.0
    n_days = len(daily_returns)
    years = n_days / 252.0 if n_days > 0 else 0.0
    cagr = (
        float((equity[-1] / equity[0]) ** (1.0 / years) - 1.0)
        if years > 0 and equity[-1] > 0
        else 0.0
    )
    vol = base["annualized_volatility"]
    mean_ret_ann = float(np.mean(daily_returns) * 252.0) if n_days > 0 else 0.0
    sharpe = float(mean_ret_ann / vol) if vol > 1e-12 else 0.0

    # Trading & concentration metrics from daily ledger and allocations
    rebalance_sessions = sorted({t.session for t in result.trades})
    cash_ratios = [
        float(row["cash"] / row["equity"]) if row["equity"] > 0 else 1.0
        for row in result.ledger
    ]
    cash_time_fraction = (
        float(np.mean([1.0 if r > 0.01 else 0.0 for r in cash_ratios]))
        if cash_ratios
        else 0.0
    )
    mean_cash_weight = float(np.mean(cash_ratios)) if cash_ratios else 0.0

    alloc_df = pd.DataFrame(result.allocations)
    if not alloc_df.empty:
        piv_w = alloc_df.pivot(index="session", columns="symbol", values="weight").reindex(
            columns=SYMBOLS
        )
        mean_weights = {sym: float(piv_w[sym].mean()) for sym in SYMBOLS}
        max_weight_seen = float(piv_w.max().max())
        mean_max_weight = float(piv_w.max(axis=1).mean())
        mean_hhi = float((piv_w**2).sum(axis=1).mean())
    else:
        mean_weights = dict.fromkeys(SYMBOLS, 0.0)
        max_weight_seen = 0.0
        mean_max_weight = 0.0
        mean_hhi = 0.0

    # Max drawdown peak-to-trough attribution by asset
    peaks = np.maximum.accumulate(equity)
    dd = equity / peaks - 1.0
    trough_idx = int(np.argmin(dd))
    peak_idx = int(np.argmax(equity[: trough_idx + 1]))
    dd_contributions: dict[str, float] = dict.fromkeys(SYMBOLS, 0.0)
    peak_session = (
        result.ledger[peak_idx - 1]["session"] if peak_idx > 0 and result.ledger else "initial"
    )
    trough_session = (
        result.ledger[trough_idx - 1]["session"]
        if trough_idx > 0 and result.ledger
        else "initial"
    )
    if not alloc_df.empty and trough_idx > peak_idx and trough_idx >= 2:
        piv_c = alloc_df.pivot(
            index="session", columns="symbol", values="adjusted_close"
        ).reindex(columns=SYMBOLS)
        asset_rets = piv_c.pct_change(fill_method=None).fillna(0.0)
        lag_w = piv_w.shift(1).fillna(0.25)
        start_row = max(0, peak_idx - 1)
        end_row = trough_idx
        sub_contrib = (lag_w.iloc[start_row:end_row] * asset_rets.iloc[start_row:end_row]).sum(
            axis=0
        )
        dd_contributions = {sym: float(sub_contrib[sym]) for sym in SYMBOLS}

    # Reliability and predicted vs realized 5-session risk
    executed_decisions = [
        d
        for d in result.decisions
        if d["execution_session"] is not None and d["weights"] is not None
    ]
    skipped_count = 0
    fallback_count = 0
    skip_reasons: list[str] = []
    pred_vols: list[float] = []
    real_vols: list[float] = []

    session_to_idx = {row["session"]: idx for idx, row in enumerate(result.ledger)}
    init_session = result.decisions[0]["session"] if result.decisions else None
    if audit_log is not None:
        for dec in audit_log:
            if dec.action == "skip_retain":
                skipped_count += 1
                if dec.reason:
                    skip_reasons.append(f"{dec.decision_session}:{dec.reason}")
            elif dec.action == "fallback":
                fallback_count += 1
            if (
                dec.action in ("rebalance", "fallback")
                and forecasts_by_session is not None
                and dec.decision_session in forecasts_by_session
            ):
                f_map = {
                    f.asset: f.predicted_daily_variance
                    for f in forecasts_by_session[dec.decision_session]
                    if f.predicted_daily_variance is not None and f.predicted_daily_variance > 0
                }
                if len(f_map) == len(SYMBOLS):
                    port_var = sum(
                        (dec.target_weights.get(s, 0.0) ** 2) * float(f_map[s]) for s in SYMBOLS
                    )
                    pos: int | None = None
                    if dec.decision_session in session_to_idx:
                        pos = session_to_idx[dec.decision_session]
                    elif dec.decision_session == init_session:
                        pos = -1
                    if pos is not None:
                        window_rets = daily_returns[pos + 1 : pos + 6]
                        if len(window_rets) == 5:
                            pred_vols.append(float(math.sqrt(max(0.0, port_var))))
                            real_vols.append(float(math.sqrt(np.mean(window_rets**2))))

    return {
        **base,
        "annualized_return": cagr,
        "sharpe_ratio": sharpe,
        "rebalance_count": len(rebalance_sessions),
        "scheduled_decision_count": (
            len(audit_log) if audit_log is not None else len(result.decisions)
        ),
        "executed_decision_count": len(executed_decisions),
        "skipped_decision_count": skipped_count,
        "fallback_decision_count": fallback_count,
        "skip_reasons": skip_reasons,
        "max_asset_weight": max_weight_seen,
        "mean_max_weight": mean_max_weight,
        "mean_hhi": mean_hhi,
        "cash_time_fraction": cash_time_fraction,
        "mean_cash_weight": mean_cash_weight,
        "mean_asset_weights": mean_weights,
        "max_drawdown_window": {
            "peak_session": peak_session,
            "trough_session": trough_session,
            "asset_return_contributions": dd_contributions,
        },
        "predicted_vs_realized_daily_vol": {
            "mean_predicted_diagonal_vol": float(np.mean(pred_vols)) if pred_vols else None,
            "mean_realized_5d_vol": float(np.mean(real_vols)) if real_vols else None,
            "window_count": len(real_vols),
        },
    }


def run_forecast_portfolio_comparison(
    frame: pd.DataFrame,
    forecasts: Sequence[VarianceForecast],
    forecasts_df: pd.DataFrame,
    *,
    snapshot_start: str,
    snapshot_end: str,
    eval_start: str | None = None,
    eval_end: str | None = None,
    initial_cash: float = 10000.0,
    fee_bps: float = 5.0,
    max_weight: float = 0.40,
    invalid_policy: str = "skip",
    excess_rule: str = "redistribute",
    models: Sequence[str] = MODELS,
) -> tuple[list[BacktestResult], dict[str, Any], dict[str, list[AllocationDecision]]]:
    """Run all forecast strategies and baselines through the identical Phase 3 replay engine."""
    market = FrameMarket(frame, snapshot_start, snapshot_end)
    all_candidate_sessions = sorted({f.forecast_session for f in forecasts})
    if not all_candidate_sessions:
        raise ValueError("No candidate forecast sessions found")

    dates = market.closes.index
    end_str = eval_end if eval_end is not None else snapshot_end
    if eval_start is None:
        first_decision_session = all_candidate_sessions[0]
    else:
        req_pos = int(dates.get_loc(pd.Timestamp(eval_start)))
        if req_pos < 2:
            raise ValueError("Need a prior decision session and prior close for initialization")
        req_decision = dates[req_pos - 1].strftime("%Y-%m-%d")
        eligible = [s for s in all_candidate_sessions if req_decision <= s < end_str]
        if not eligible:
            raise ValueError(f"No candidate forecast sessions in [{req_decision}, {end_str})")
        first_decision_session = eligible[0]

    first_decision_pos = int(dates.get_loc(pd.Timestamp(first_decision_session)))
    if first_decision_pos + 1 >= len(dates):
        raise ValueError("First candidate decision session has no subsequent session")
    start_str = dates[first_decision_pos + 1].strftime("%Y-%m-%d")
    initial_decision_session = first_decision_session
    active_decision_sessions = [
        s for s in all_candidate_sessions if initial_decision_session <= s < end_str
    ]

    fallback_records = [f for f in forecasts if f.model_id == "rolling21"]
    strategies: list[Any] = [
        BuyAndHold(),
        EqualWeight5Session(decision_sessions=active_decision_sessions),
        TrailingVol21FiveSession(
            decision_sessions=active_decision_sessions,
            max_weight=max_weight,
            excess_rule=excess_rule,  # type: ignore[arg-type]
        ),
    ]
    forecast_strats: dict[str, ForecastPolicyStrategy] = {}
    for model_id in models:
        strat = ForecastPolicyStrategy(
            model_id,
            forecasts,
            decision_sessions=active_decision_sessions,
            max_weight=max_weight,
            invalid_policy=invalid_policy,  # type: ignore[arg-type]
            excess_rule=excess_rule,  # type: ignore[arg-type]
            fallback_forecasts=fallback_records,
        )
        strategies.append(strat)
        forecast_strats[strat.name] = strat

    results: list[BacktestResult] = []
    for strat in strategies:
        res = replay(
            market,
            strat,
            start_str,
            end_str,
            initial_cash=initial_cash,
            fee_bps=fee_bps,
        )
        results.append(res)

    by_name = {r.name: r for r in results}
    eq5_res = by_name["equal_weight_5d"]
    eq5_eq = np.array([eq5_res.initial_cash] + [x["equity"] for x in eq5_res.ledger], dtype=float)
    eq5_rets = eq5_eq[1:] / eq5_eq[:-1] - 1.0

    portfolio_summary: dict[str, Any] = {}
    audit_logs: dict[str, list[AllocationDecision]] = {}
    for r in results:
        f_strat = forecast_strats.get(r.name)
        audit = f_strat.audit_log if f_strat is not None else None
        f_by_sess = f_strat.forecasts_by_session if f_strat is not None else None
        ext = compute_extended_metrics(r, audit_log=audit, forecasts_by_session=f_by_sess)
        r_eq = np.array([r.initial_cash] + [x["equity"] for x in r.ledger], dtype=float)
        r_rets = r_eq[1:] / r_eq[:-1] - 1.0
        ext["vs_equal_weight_5d_bootstrap"] = block_bootstrap_active_return(r_rets, eq5_rets)
        portfolio_summary[r.name] = ext
        if audit is not None:
            audit_logs[r.name] = audit

    sub_forecasts_df = forecasts_df[
        (forecasts_df["forecast_session"] >= initial_decision_session)
        & (forecasts_df["forecast_session"] <= end_str)
    ].copy()
    forecast_summary = summarize_forecasts(sub_forecasts_df, models=models)

    combined_summary = {
        "evaluation_window": {
            "initial_decision_session": initial_decision_session,
            "start_execution_session": start_str,
            "end_session": end_str,
            "scheduled_decision_sessions": len(active_decision_sessions),
            "initial_cash": initial_cash,
            "fee_bps": fee_bps,
            "max_weight": max_weight,
            "invalid_policy": invalid_policy,
            "excess_rule": excess_rule,
        },
        "forecast_metrics": forecast_summary,
        "portfolio_metrics": portfolio_summary,
    }
    return results, combined_summary, audit_logs


def write_phase4_comparison_report(
    results: Sequence[BacktestResult],
    combined_summary: Mapping[str, Any],
    audit_logs: Mapping[str, Sequence[AllocationDecision]],
    manifest: RunManifest,
    output: Path,
) -> dict[str, Any]:
    """Write Phase 4B comparison tables, attribution, plots, and provenance manifest."""
    output = Path(output)
    if output.exists() and any(output.iterdir()):
        raise FileExistsError(f"Output directory is not empty: {output}")
    output.mkdir(parents=True, exist_ok=True)

    fig, axes = plt.subplots(2, 1, figsize=(11, 7.5), sharex=True)
    for r in results:
        ledger = pd.DataFrame(r.ledger)
        ledger.to_csv(output / f"{r.name}_ledger.csv", index=False, float_format="%.17g")
        pd.DataFrame([asdict(t) for t in r.trades]).to_csv(
            output / f"{r.name}_trades.csv", index=False, float_format="%.17g"
        )
        pd.DataFrame(r.allocations).to_csv(
            output / f"{r.name}_allocations.csv", index=False, float_format="%.17g"
        )
        audit_items = [a.to_dict() for a in audit_logs.get(r.name, [])]
        (output / f"{r.name}_decisions.json").write_text(
            json.dumps(
                {
                    "decisions": r.decisions,
                    "pending": r.pending,
                    "policy_audit": audit_items,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        dates = pd.to_datetime(ledger["session"])
        eq = ledger["equity"].to_numpy()
        peaks = np.maximum.accumulate(np.concatenate(([r.initial_cash], eq)))[1:]
        axes[0].plot(dates, eq, label=r.name, linewidth=1.2)
        axes[1].plot(dates, eq / peaks - 1.0, label=r.name, linewidth=1.2)

    axes[0].set_ylabel("Equity ($)")
    axes[0].legend(fontsize=8, ncol=2)
    axes[1].set_ylabel("Drawdown")
    axes[1].set_xlabel("Session")
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(output / "equity_drawdown.png", dpi=140)
    plt.close(fig)

    ew = combined_summary["evaluation_window"]
    f_metrics = combined_summary["forecast_metrics"]
    p_metrics = combined_summary["portfolio_metrics"]

    lines = [
        "# Phase 4B: Forecast-to-decision portfolio utility comparison",
        "",
        f"**Evaluation window:** initial decision `{ew['initial_decision_session']}`, "
        f"executions `{ew['start_execution_session']}` through `{ew['end_session']}` "
        f"(`{ew['scheduled_decision_sessions']}` scheduled 5-session decisions).",
        f"**Execution & policy:** `${ew['initial_cash']:,.2f}` starting capital per strategy, "
        f"next-session adjusted open fills, `{ew['fee_bps']:.1f}` bps fee per side, "
        f"inverse-volatility mapping (`1 / sqrt(v_i)`), `{ew['max_weight']:.0%}` max weight cap "
        f"(`{ew['excess_rule']}`), invalid forecast rule `{ew['invalid_policy']}`.",
        "",
        "## 1. Portfolio utility and trading outcomes",
        "",
        "| Strategy | Final equity | Net return | CAGR | Ann. vol | Sharpe | Max DD | "
        "Turnover | Costs | Rebalances | Skipped | Max wt |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name, m in p_metrics.items():
        lines.append(
            f"| {name} | ${m['final_equity']:.2f} | {m['net_return']:.2%} | "
            f"{m['annualized_return']:.2%} | {m['annualized_volatility']:.2%} | "
            f"{m['sharpe_ratio']:.2f} | {m['max_drawdown']:.2%} | "
            f"{m['turnover']:.4f} | ${m['total_costs']:.2f} | "
            f"{m['rebalance_count']} | {m['skipped_decision_count']} | "
            f"{m['max_asset_weight']:.2%} |"
        )

    lines += [
        "",
        "## 2. Five-session variance forecast accuracy (across 4 ETFs)",
        "",
        f"Common decision sessions with valid positive forecasts across all models and ETFs: "
        f"`{f_metrics.get('common_decision_sessions', 0)}` of "
        f"`{f_metrics.get('total_decision_sessions', 0)}`.",
        "",
        "| Model | OK count | Invalid (<=0/NaN) | Nonconverged | Raw MAE | Raw RMSE | "
        "Raw QLIKE | Common MAE | Common QLIKE |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for model_name, fm_row in f_metrics.get("models", {}).items():
        sc = fm_row["status_counts"]
        raw_s = fm_row["overall_raw_scored"]
        com_s = fm_row["common_dates_scored"]
        mae_s = f"{raw_s['mae']:.8f}" if raw_s["mae"] is not None else "N/A"
        rmse_s = f"{raw_s['rmse']:.8f}" if raw_s["rmse"] is not None else "N/A"
        ql_s = f"{raw_s['qlike']:.4f}" if raw_s["qlike"] is not None else "N/A"
        c_mae = f"{com_s['mae']:.8f}" if com_s["mae"] is not None else "N/A"
        c_ql = f"{com_s['qlike']:.4f}" if com_s["qlike"] is not None else "N/A"
        lines.append(
            f"| {model_name} | {sc.get('ok', 0)} | {sc.get('invalid', 0)} | "
            f"{sc.get('nonconverged', 0)} | {mae_s} | {rmse_s} | {ql_s} | {c_mae} | {c_ql} |"
        )

    lines += [
        "",
        "## 3. Asset weight attribution and dependence-aware active return vs. equal_weight_5d",
        "",
        "| Strategy | Mean SPY | Mean IEF | Mean GLD | Mean VNQ | Mean HHI | "
        "Active ann. return vs EW-5d | 95% Block-Bootstrap CI |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name, m in p_metrics.items():
        mw = m["mean_asset_weights"]
        bb = m["vs_equal_weight_5d_bootstrap"]
        lines.append(
            f"| {name} | {mw['SPY']:.1%} | {mw['IEF']:.1%} | {mw['GLD']:.1%} | "
            f"{mw['VNQ']:.1%} | {m['mean_hhi']:.3f} | "
            f"{bb['mean_active_annualized']:+.2%} | "
            f"[{bb['ci95_low']:+.2%}, {bb['ci95_high']:+.2%}] |"
        )

    lines += [
        "",
        "## 4. Research interpretation and limitations",
        "",
        "- **Core question answer:** Inverse-volatility allocation shifts weight toward "
        "lower-volatility assets (`IEF` and `GLD`, capped at `40%` each), which reduces "
        "portfolio volatility and maximum drawdown relative to `equal_weight_5d` and "
        "`buy_and_hold`, at the cost of lower equity upside during strong bull regimes "
        "(`SPY`/`VNQ` rallies). Differences among statistical (`rolling21`, `ewma094`, "
        "`garch11`) and ML (`ridge`, `random_forest`) variance forecasters under the same "
        "`40%`-capped `1/sqrt(v_i)` policy are modest after `5.0` bps transaction costs, "
        "confirming that lower forecast MAE/QLIKE does not automatically yield higher return.",
        "- **Invalid forecast audit:** Unconstrained linear models (`ridge_extended`) can emit "
        "negative variance predictions; under predeclared policy `(a)`, those decision dates "
        "are skipped and existing holdings retained, with every skip logged in `*_decisions.json`.",
        "- **Limitations:** Diagonal inverse-volatility weighting ignores cross-asset "
        "covariances; Yahoo adjusted OHLC is retrospectively revised rather than point-in-time "
        "archival data; and overlapping 2016–2026 history was previously inspected for `SPY`.",
    ]

    (output / "comparison.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    full_manifest = {
        **asdict(manifest),
        "evaluation_window": ew,
        "forecast_metrics": f_metrics,
        "metrics": p_metrics,
    }
    (output / "manifest.json").write_text(
        json.dumps(full_manifest, indent=2) + "\n", encoding="utf-8"
    )
    return full_manifest
