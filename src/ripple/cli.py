"""Command-line entry points; replay never fetches from the network."""

import argparse
import hashlib
import importlib.metadata
import json
import platform
import subprocess
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

from ripple.core.models import RunManifest
from ripple.data.market import FrameMarket
from ripple.data.provider import fetch, load_snapshot, sha
from ripple.evaluation.comparison import (
    run_forecast_portfolio_comparison,
    write_phase4_comparison_report,
)
from ripple.evaluation.report import report
from ripple.forecasts.adapter import load_forecast_bundle, save_forecast_bundle
from ripple.forecasts.models import (
    DEFAULT_MODEL_CONFIG,
    MODELS,
    generate_multi_asset_forecasts,
)
from ripple.ledger.forward import ForwardDecisionLedger, verify_ledger
from ripple.policies.allocation import allocate_from_forecasts
from ripple.simulation.replay import replay
from ripple.strategies.baselines import BuyAndHold, MonthlyEqualWeight
from ripple.stress.search import DEFAULT_STRESS_MODELS, run_stress_search, write_stress_report

ROOT = Path(__file__).resolve().parents[2]


def build_manifest(config, provider, raw_sha=None):
    config_hash = hashlib.sha256(
        json.dumps(config, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    files = sorted((ROOT / "src" / "ripple").rglob("*.py")) + [
        ROOT / "pyproject.toml",
        ROOT / "uv.lock",
        ROOT / "docs" / "decisions" / "001-replay-contract.md",
    ]
    contract2 = ROOT / "docs" / "decisions" / "002-phase4-experiment-contract.md"
    if contract2.exists():
        files.append(contract2)
    try:
        rev = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        rev = None
    return RunManifest(
        config["kind"],
        provider["normalized_sha256"],
        raw_sha,
        config_hash,
        {str(p.relative_to(ROOT)).replace("\\", "/"): sha(p) for p in files},
        rev,
        {
            "python": platform.python_version(),
            "numpy": importlib.metadata.version("numpy"),
            "pandas": importlib.metadata.version("pandas"),
            "exchange_calendars": importlib.metadata.version("exchange-calendars"),
            "scikit_learn": importlib.metadata.version("scikit-learn"),
            "arch": importlib.metadata.version("arch"),
            "yfinance": importlib.metadata.version("yfinance"),
            "matplotlib": importlib.metadata.version("matplotlib"),
            "run_utc": datetime.now(timezone.utc).isoformat(),
            "source_note": (
                "source hashes identify working files; revision alone may not include local changes"
            ),
        },
        config,
        provider,
    )


def run_comparison(frame, config, provider, raw_sha=None):
    market = FrameMarket(frame, config["snapshot_start"], config["snapshot_end"])
    results = [
        replay(
            market,
            strategy,
            config["start"],
            config["end"],
            config["initial_cash"],
            config["fee_bps"],
        )
        for strategy in (BuyAndHold(), MonthlyEqualWeight())
    ]
    manifest = build_manifest(config, provider, raw_sha)
    return results, manifest


def main():
    parser = argparse.ArgumentParser(prog="ripple")
    sub = parser.add_subparsers(dest="command", required=True)
    demo = sub.add_parser("demo", help="Run deterministic offline synthetic replay")
    demo.add_argument("--output", default="artifacts/synthetic/demo")
    data = sub.add_parser("data")
    ds = data.add_subparsers(dest="data_command", required=True)
    dl = ds.add_parser("fetch", help="Acquire one immutable Yahoo snapshot")
    dl.add_argument("--output", default="data/snapshots/2020")
    dl.add_argument("--start", default="2019-12-30")
    dl.add_argument("--end-exclusive", default="2021-01-01")
    bt = sub.add_parser("backtest", help="Replay a frozen snapshot")
    bt.add_argument("--config", required=True)

    fc = sub.add_parser("forecast", help="Generate frozen four-ETF 5-session variance forecasts")
    fc.add_argument("--snapshot", default="data/snapshots/2016-2026")
    fc.add_argument("--output", default="artifacts/forecasts/2016-2026")
    fc.add_argument("--min-train", type=int, default=756)
    fc.add_argument("--window", type=int, default=1260)
    fc.add_argument("--step", type=int, default=5)

    cf = sub.add_parser(
        "compare-forecasts", help="Compare forecast-driven policies against baselines in replay"
    )
    cf.add_argument("--snapshot", default="data/snapshots/2016-2026")
    cf.add_argument("--forecasts", default="artifacts/forecasts/2016-2026")
    cf.add_argument("--output", default="artifacts/historical/phase4b-2019-2026")
    cf.add_argument("--start", default=None)
    cf.add_argument("--end", default=None)
    cf.add_argument("--initial-cash", type=float, default=10000.0)
    cf.add_argument("--fee-bps", type=float, default=5.0)
    cf.add_argument("--max-weight", type=float, default=0.40)
    cf.add_argument("--invalid-policy", choices=("skip", "fallback_rolling21"), default="skip")

    st = sub.add_parser("stress", help="Run Phase 5 constrained multi-asset block-bootstrap fuzzer")
    st.add_argument("--snapshot", default="data/snapshots/2016-2026")
    st.add_argument("--output", default="artifacts/stress/2016-2026")
    st.add_argument("--min-train", type=int, default=756)
    st.add_argument("--window", type=int, default=1260)
    st.add_argument("--step", type=int, default=5)

    lg = sub.add_parser("ledger", help="Manage and verify Phase 6 prospective forward ledger")
    lgs = lg.add_subparsers(dest="ledger_command", required=True)
    lg_commit = lgs.add_parser("commit-latest", help="Commit latest forward decision to ledger")
    lg_commit.add_argument("--forecasts", default="artifacts/forecasts/2016-2026")
    lg_commit.add_argument("--model", default="ewma094")
    lg_commit.add_argument("--ledger", default="artifacts/forward/ledger.jsonl")
    lg_verify = lgs.add_parser("verify", help="Verify hash chain and invariants of forward ledger")
    lg_verify.add_argument("--ledger", default="artifacts/forward/ledger.jsonl")

    args = parser.parse_args()
    try:
        if args.command == "data":
            cache = ROOT / ".uv-cache" / "yfinance"
            cache.mkdir(parents=True, exist_ok=True)
            yf.set_tz_cache_location(str(cache))
            result = fetch(Path(args.output), args.start, args.end_exclusive)
            print(json.dumps(result, indent=2))
            return 0
        if args.command == "ledger":
            ledger_path = Path(args.ledger)
            if args.ledger_command == "verify":
                summary = verify_ledger(ledger_path)
                print(json.dumps(summary, indent=2))
                return 0
            records, _, f_manifest = load_forecast_bundle(Path(args.forecasts))
            model_records = [r for r in records if r.model_id == args.model]
            if not model_records:
                raise ValueError(f"No forecasts found for model {args.model}")
            latest_session = max(r.forecast_session for r in model_records)
            slice_records = [r for r in model_records if r.forecast_session == latest_session]
            cutoff_utc = max(r.as_of_utc for r in slice_records)
            dec = allocate_from_forecasts(
                slice_records,
                decision_session=latest_session,
                decision_cutoff_utc=cutoff_utc,
                expected_model_id=args.model,
            )
            now_iso = datetime.now(timezone.utc).isoformat()
            run_id = f"fwd-{latest_session}-{args.model}"
            ledger = ForwardDecisionLedger(ledger_path)
            common_kw = {
                "run_id": run_id,
                "scheduled_utc": cutoff_utc.isoformat(),
                "observation_cutoff_utc": cutoff_utc.isoformat(),
                "strategy_id": f"forecast_{args.model}",
                "model_id": args.model,
                "config_sha256": f_manifest["artifact_hashes"]["config.json"],
                "dataset_sha256": slice_records[0].data_sha256,
            }
            ledger.append_event(**common_kw, event_type="run_scheduled", recorded_utc=now_iso)
            ledger.append_event(**common_kw, event_type="data_snapshot_ready", recorded_utc=now_iso)
            ledger.append_event(
                **common_kw, event_type="prediction_generated", recorded_utc=now_iso
            )
            committed = ledger.append_event(
                **common_kw,
                event_type="decision_committed",
                recorded_utc=now_iso,
                proposed_weights=dec.target_weights if dec.action != "skip_retain" else None,
                cash_weight=dec.cash_weight,
                status="success" if dec.action != "skip_retain" else "skipped",
                error_reason=dec.reason,
            )
            print(
                json.dumps(
                    {
                        "committed_record": committed.to_dict(),
                        "verification": verify_ledger(ledger_path),
                    },
                    indent=2,
                )
            )
            return 0
        if args.command == "stress":
            snap_dir = Path(args.snapshot)
            frame, provider = load_snapshot(snap_dir)
            stress_out = run_stress_search(
                frame,
                models=DEFAULT_STRESS_MODELS,
                min_train=args.min_train,
                window=args.window,
                step=args.step,
            )
            manifest = write_stress_report(
                stress_out,
                Path(args.output),
                dataset_sha256=provider["normalized_sha256"],
            )
            print(json.dumps({"output": str(args.output), "manifest": manifest}, indent=2))
            return 0
        if args.command == "forecast":
            snap_dir = Path(args.snapshot)
            frame, provider = load_snapshot(snap_dir)
            as_of = provider.get("retrieved_utc", "2030-01-01T00:00:00Z")
            _, forecasts_df, skipped, summary = generate_multi_asset_forecasts(
                frame,
                as_of=as_of,
                data_sha256=provider["normalized_sha256"],
                models=MODELS,
                min_train=args.min_train,
                window=args.window,
                step=args.step,
            )
            f_config = {
                **DEFAULT_MODEL_CONFIG,
                "min_train_mature": args.min_train,
                "window_sessions": args.window,
                "step_sessions": args.step,
                "models": list(MODELS),
                "as_of_utc": as_of,
            }
            manifest = save_forecast_bundle(
                Path(args.output),
                config=f_config,
                inputs=provider,
                forecasts_df=forecasts_df,
                skipped=skipped,
                manifest_extra={"forecast_summary": summary},
            )
            print(json.dumps({"output": str(args.output), "summary": manifest}, indent=2))
            return 0
        if args.command == "compare-forecasts":
            snap_dir = Path(args.snapshot)
            frame, provider = load_snapshot(snap_dir)
            records, forecasts_df, f_manifest = load_forecast_bundle(Path(args.forecasts))
            config = {
                "kind": "historical_phase4b",
                "snapshot": str(args.snapshot),
                "forecasts": str(args.forecasts),
                "snapshot_start": provider["first_session"],
                "snapshot_end": provider["last_session"],
                "eval_start": args.start,
                "eval_end": args.end,
                "initial_cash": args.initial_cash,
                "fee_bps": args.fee_bps,
                "max_weight": args.max_weight,
                "invalid_policy": args.invalid_policy,
                "forecast_manifest_hashes": f_manifest.get("artifact_hashes", {}),
            }
            results, combined_summary, audit_logs = run_forecast_portfolio_comparison(
                frame,
                records,
                forecasts_df,
                snapshot_start=provider["first_session"],
                snapshot_end=provider["last_session"],
                eval_start=args.start,
                eval_end=args.end,
                initial_cash=args.initial_cash,
                fee_bps=args.fee_bps,
                max_weight=args.max_weight,
                invalid_policy=args.invalid_policy,
                models=MODELS,
            )
            manifest_obj = build_manifest(config, provider, provider.get("raw_sha256"))
            out_dir = Path(args.output)
            written = write_phase4_comparison_report(
                results, combined_summary, audit_logs, manifest_obj, out_dir
            )
            print(
                json.dumps(
                    {
                        "output": str(out_dir),
                        "evaluation_window": written["evaluation_window"],
                    },
                    indent=2,
                )
            )
            return 0
        if args.command == "demo":
            fixture = ROOT / "tests" / "fixtures" / "demo.csv"
            frame = pd.read_csv(fixture)
            config = {
                "kind": "synthetic",
                "snapshot_start": "2019-12-30",
                "snapshot_end": "2020-03-31",
                "start": "2020-01-02",
                "end": "2020-03-31",
                "initial_cash": 10000.0,
                "fee_bps": 5.0,
            }
            provider = {
                "provider": "deterministic synthetic fixture",
                "normalized_sha256": sha(fixture),
            }
            output = Path(args.output)
            raw_hash = None
        else:
            config = tomllib.loads(Path(args.config).read_text(encoding="utf-8"))
            frame, provider = load_snapshot(Path(config["snapshot"]))
            raw_hash = provider["raw_sha256"]
            output = Path(config["output"])
            config["kind"] = "historical"
        results, manifest = run_comparison(frame, config, provider, raw_hash)
        summary = report(results, manifest, output)
        print(json.dumps({"output": str(output), "metrics": summary}, indent=2))
        return 0
    except (ValueError, OSError, KeyError, RuntimeError) as exc:
        print(f"Ripple error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
