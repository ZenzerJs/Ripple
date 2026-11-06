"""Budgeted relative failure search and validation across synchronized return-block paths."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from dataclasses import asdict
from pathlib import Path
from typing import Any

import pandas as pd

from ripple.evaluation.comparison import run_forecast_portfolio_comparison
from ripple.forecasts.models import generate_multi_asset_forecasts
from ripple.stress.bootstrap import generate_block_bootstrap_path
from ripple.stress.realism import RealismThresholds, screen_path_realism

DEFAULT_STRESS_MODELS = ("rolling21", "ewma094", "har_ols", "ridge")


def _frame_sha256(frame: pd.DataFrame) -> str:
    csv_bytes = frame.to_csv(index=False, float_format="%.12g").encode("utf-8")
    return hashlib.sha256(csv_bytes).hexdigest()


def evaluate_stress_scenario(
    reference_frame: pd.DataFrame,
    *,
    block_length: int,
    seed: int,
    collection: str,
    models: Sequence[str] = DEFAULT_STRESS_MODELS,
    min_train: int = 756,
    window: int = 1260,
    step: int = 5,
    initial_cash: float = 10000.0,
    fee_bps: float = 5.0,
    max_weight: float = 0.40,
    thresholds: RealismThresholds = RealismThresholds(),
) -> tuple[dict[str, Any], pd.DataFrame, list[Any], dict[str, Any]]:
    """Generate one block-bootstrap path, screen realism, and recompute forecasts and replay."""
    cand_frame, boot_meta = generate_block_bootstrap_path(
        reference_frame, block_length=block_length, seed=seed
    )
    path_sha = _frame_sha256(cand_frame)
    realism = screen_path_realism(cand_frame, reference_frame, thresholds=thresholds)

    dates = sorted(pd.to_datetime(cand_frame["session"]).unique())
    start_str = pd.Timestamp(dates[0]).strftime("%Y-%m-%d")
    end_str = pd.Timestamp(dates[-1]).strftime("%Y-%m-%d")

    forecasts, forecasts_df, _, _ = generate_multi_asset_forecasts(
        cand_frame,
        as_of="2030-01-01T00:00:00Z",
        data_sha256=path_sha,
        models=models,
        min_train=min_train,
        window=window,
        step=step,
    )
    results, combined_summary, _ = run_forecast_portfolio_comparison(
        cand_frame,
        forecasts,
        forecasts_df,
        snapshot_start=start_str,
        snapshot_end=end_str,
        initial_cash=initial_cash,
        fee_bps=fee_bps,
        max_weight=max_weight,
        models=models,
    )
    pm = combined_summary["portfolio_metrics"]
    ew_ret = float(pm["equal_weight_5d"]["net_return"])
    ew_dd = float(pm["equal_weight_5d"]["max_drawdown"])

    strategy_rel: dict[str, dict[str, float]] = {}
    for name, m in pm.items():
        strategy_rel[name] = {
            "net_return": float(m["net_return"]),
            "relative_return_vs_ew5d": float(m["net_return"] - ew_ret),
            "max_drawdown": float(m["max_drawdown"]),
            "excess_drawdown_vs_ew5d": float(m["max_drawdown"] - ew_dd),
            "annualized_volatility": float(m["annualized_volatility"]),
            "sharpe_ratio": float(m["sharpe_ratio"]),
            "turnover": float(m["turnover"]),
            "total_costs": float(m["total_costs"]),
        }

    record = {
        "scenario_id": f"{collection}_b{block_length}_s{seed}",
        "collection": collection,
        "block_length": int(block_length),
        "seed": int(seed),
        "path_sha256": path_sha,
        "verdict": realism.verdict,
        "reasons": ";".join(realism.reasons),
        "max_corr_abs_diff": realism.metrics["max_corr_abs_diff"],
        "mean_sq_autocorr_lag1": realism.metrics["mean_sq_autocorr_lag1"],
        "spy_vol_ratio": realism.metrics["vol_ratios"]["SPY"],
        "ief_vol_ratio": realism.metrics["vol_ratios"]["IEF"],
        "equal_weight_5d_return": ew_ret,
        "equal_weight_5d_max_dd": ew_dd,
        "strategy_outcomes": strategy_rel,
        "realism_detail": realism.to_dict(),
        "bootstrap_meta": boot_meta,
    }
    return record, cand_frame, results, combined_summary


def run_stress_search(
    reference_frame: pd.DataFrame,
    *,
    block_lengths: Sequence[int] = (5, 10, 21),
    search_seeds: Sequence[int] = (101, 102, 103, 104),
    validation_seeds: Sequence[int] = (201, 202),
    models: Sequence[str] = DEFAULT_STRESS_MODELS,
    min_train: int = 756,
    window: int = 1260,
    step: int = 5,
    initial_cash: float = 10000.0,
    fee_bps: float = 5.0,
    max_weight: float = 0.40,
    target_strategy: str = "forecast_ridge",
    thresholds: RealismThresholds = RealismThresholds(),
) -> dict[str, Any]:
    """Execute a budgeted stress search and separate validation collection."""
    all_records: list[dict[str, Any]] = []
    worst_valid_bundle: tuple[dict[str, Any], pd.DataFrame, list[Any], dict[str, Any]] | None = (
        None
    )
    worst_rel_return = float("inf")

    for collection, seeds in (("search", search_seeds), ("validation", validation_seeds)):
        for b in block_lengths:
            for s in seeds:
                rec, cand_frame, results, summary = evaluate_stress_scenario(
                    reference_frame,
                    block_length=b,
                    seed=s,
                    collection=collection,
                    models=models,
                    min_train=min_train,
                    window=window,
                    step=step,
                    initial_cash=initial_cash,
                    fee_bps=fee_bps,
                    max_weight=max_weight,
                    thresholds=thresholds,
                )
                all_records.append(rec)
                if collection == "search" and rec["verdict"] == "valid":
                    rel = rec["strategy_outcomes"][target_strategy]["relative_return_vs_ew5d"]
                    if rel < worst_rel_return:
                        worst_rel_return = rel
                        worst_valid_bundle = (rec, cand_frame, results, summary)

    # Fallback to worst search scenario overall if none passed strict valid screen
    if worst_valid_bundle is None and all_records:
        search_recs = [r for r in all_records if r["collection"] == "search"]
        chosen = min(
            search_recs,
            key=lambda r: r["strategy_outcomes"][target_strategy]["relative_return_vs_ew5d"],
        )
        worst_valid_bundle = evaluate_stress_scenario(
            reference_frame,
            block_length=chosen["block_length"],
            seed=chosen["seed"],
            collection="search",
            models=models,
            min_train=min_train,
            window=window,
            step=step,
            initial_cash=initial_cash,
            fee_bps=fee_bps,
            max_weight=max_weight,
            thresholds=thresholds,
        )

    verdict_counts: dict[str, int] = {}
    for r in all_records:
        v = str(r["verdict"])
        verdict_counts[v] = verdict_counts.get(v, 0) + 1

    # Summarize failure profiles across all evaluated strategies on valid paths
    valid_records = [r for r in all_records if r["verdict"] == "valid"]
    strategy_profiles: dict[str, Any] = {}
    if all_records:
        strat_names = list(all_records[0]["strategy_outcomes"].keys())
        for s_name in strat_names:
            pool = valid_records if valid_records else all_records
            rels = [r["strategy_outcomes"][s_name]["relative_return_vs_ew5d"] for r in pool]
            worst_rec = min(
                pool, key=lambda r: r["strategy_outcomes"][s_name]["relative_return_vs_ew5d"]
            )
            strategy_profiles[s_name] = {
                "worst_scenario_id": worst_rec["scenario_id"],
                "worst_relative_return_vs_ew5d": float(min(rels)),
                "median_relative_return_vs_ew5d": float(pd.Series(rels).median()),
                "underperformed_ew5d_count": int(sum(1 for x in rels if x < 0.0)),
                "evaluated_valid_scenarios": len(pool),
            }

    return {
        "budget": {
            "block_lengths": list(block_lengths),
            "search_seeds": list(search_seeds),
            "validation_seeds": list(validation_seeds),
            "total_scenarios_evaluated": len(all_records),
            "search_scenarios": len(block_lengths) * len(search_seeds),
            "validation_scenarios": len(block_lengths) * len(validation_seeds),
            "models_recomputed_per_path": list(models),
            "target_strategy": target_strategy,
        },
        "verdict_counts": verdict_counts,
        "strategy_failure_profiles": strategy_profiles,
        "scenarios": all_records,
        "worst_case_bundle": worst_valid_bundle,
    }


def write_stress_report(
    stress_output: dict[str, Any],
    output_dir: Path,
    *,
    dataset_sha256: str,
) -> dict[str, Any]:
    """Write Phase 5 stress search ledger, failure case artifacts, and report."""
    output_dir = Path(output_dir)
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"Stress output directory is not empty: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    flat_rows = []
    for rec in stress_output["scenarios"]:
        row = {
            "scenario_id": rec["scenario_id"],
            "collection": rec["collection"],
            "block_length": rec["block_length"],
            "seed": rec["seed"],
            "path_sha256": rec["path_sha256"],
            "verdict": rec["verdict"],
            "reasons": rec["reasons"],
            "max_corr_abs_diff": rec["max_corr_abs_diff"],
            "mean_sq_autocorr_lag1": rec["mean_sq_autocorr_lag1"],
            "spy_vol_ratio": rec["spy_vol_ratio"],
            "ief_vol_ratio": rec["ief_vol_ratio"],
            "equal_weight_5d_return": rec["equal_weight_5d_return"],
        }
        for s_name, s_metrics in rec["strategy_outcomes"].items():
            row[f"{s_name}_return"] = s_metrics["net_return"]
            row[f"{s_name}_rel_ew5d"] = s_metrics["relative_return_vs_ew5d"]
            row[f"{s_name}_max_dd"] = s_metrics["max_drawdown"]
        flat_rows.append(row)
    pd.DataFrame(flat_rows).to_csv(
        output_dir / "scenarios.csv", index=False, float_format="%.17g"
    )

    worst_bundle = stress_output.get("worst_case_bundle")
    worst_summary = None
    if worst_bundle is not None:
        w_rec, w_frame, w_results, _ = worst_bundle
        worst_dir = output_dir / "worst_failure_case"
        worst_dir.mkdir(parents=True, exist_ok=True)
        w_frame.to_csv(worst_dir / "resampled_path.csv", index=False, float_format="%.17g")
        for r in w_results:
            pd.DataFrame(r.ledger).to_csv(
                worst_dir / f"{r.name}_ledger.csv", index=False, float_format="%.17g"
            )
            pd.DataFrame([asdict(t) for t in r.trades]).to_csv(
                worst_dir / f"{r.name}_trades.csv", index=False, float_format="%.17g"
            )
        worst_summary = {
            "scenario_id": w_rec["scenario_id"],
            "block_length": w_rec["block_length"],
            "seed": w_rec["seed"],
            "path_sha256": w_rec["path_sha256"],
            "verdict": w_rec["verdict"],
            "reasons": w_rec["reasons"],
            "strategy_outcomes": w_rec["strategy_outcomes"],
        }

    budget = stress_output["budget"]
    vc = stress_output["verdict_counts"]
    profiles = stress_output["strategy_failure_profiles"]

    lines = [
        "# Phase 5: Constrained multi-asset block-bootstrap stress report",
        "",
        "> **Scope statement:** Any identified underperformance is a **failure case within this "
        "synchronized block-bootstrap scenario family**, never proof that the market will follow "
        "this path or a causal economic simulation.",
        "",
        "## 1. Predeclared search budget and realism screening",
        "",
        f"- **Source dataset SHA-256:** `{dataset_sha256}`",
        f"- **Block lengths:** `{budget['block_lengths']}`",
        f"- **Search seeds:** `{budget['search_seeds']}` "
        f"(`{budget['search_scenarios']}` search paths)",
        f"- **Untouched validation seeds:** `{budget['validation_seeds']}` "
        f"(`{budget['validation_scenarios']}` validation paths)",
        f"- **Total scenarios evaluated (all retained in `scenarios.csv`):** "
        f"`{budget['total_scenarios_evaluated']}`",
        f"- **Realism screen verdicts:** valid=`{vc.get('valid', 0)}`, "
        f"borderline=`{vc.get('borderline', 0)}`, rejected=`{vc.get('rejected', 0)}`",
        "",
        "## 2. Relative failure profiles across strategies (vs. `equal_weight_5d`)",
        "",
        "| Strategy | Worst valid scenario | Worst rel. return vs EW-5d | "
        "Median rel. return vs EW-5d | Underperformed EW-5d count |",
        "|---|---|---:|---:|---:|",
    ]
    for s_name, prof in profiles.items():
        lines.append(
            f"| {s_name} | `{prof['worst_scenario_id']}` | "
            f"{prof['worst_relative_return_vs_ew5d']:+.2%} | "
            f"{prof['median_relative_return_vs_ew5d']:+.2%} | "
            f"{prof['underperformed_ew5d_count']} / {prof['evaluated_valid_scenarios']} |"
        )

    if worst_summary is not None:
        lines += [
            "",
            f"## 3. Screened failure case detail (`{worst_summary['scenario_id']}`)",
            "",
            f"- **Block length:** `{worst_summary['block_length']}`, "
            f"**Seed:** `{worst_summary['seed']}`, "
            f"**Path SHA-256:** `{worst_summary['path_sha256']}`",
            f"- **Realism verdict:** `{worst_summary['verdict']}` (`{worst_summary['reasons']}`)",
            "",
            "| Strategy | Net return | Rel. return vs EW-5d | Max drawdown | "
            "Ann. vol | Sharpe | Turnover | Costs |",
            "|---|---:|---:|---:|---:|---:|---:|---:|",
        ]
        for s_name, sm in worst_summary["strategy_outcomes"].items():
            lines.append(
                f"| {s_name} | {sm['net_return']:.2%} | "
                f"{sm['relative_return_vs_ew5d']:+.2%} | {sm['max_drawdown']:.2%} | "
                f"{sm['annualized_volatility']:.2%} | {sm['sharpe_ratio']:.2f} | "
                f"{sm['turnover']:.4f} | ${sm['total_costs']:.2f} |"
            )

    (output_dir / "stress_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    manifest = {
        "dataset_sha256": dataset_sha256,
        "budget": budget,
        "verdict_counts": vc,
        "strategy_failure_profiles": profiles,
        "worst_failure_case": worst_summary,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return manifest
