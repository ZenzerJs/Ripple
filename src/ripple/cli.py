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
from ripple.evaluation.report import report
from ripple.simulation.replay import replay
from ripple.strategies.baselines import BuyAndHold, MonthlyEqualWeight

ROOT = Path(__file__).resolve().parents[2]


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
    config_hash = hashlib.sha256(
        json.dumps(config, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    files = sorted((ROOT / "src" / "ripple").rglob("*.py")) + [
        ROOT / "pyproject.toml",
        ROOT / "uv.lock",
        ROOT / "docs" / "decisions" / "001-replay-contract.md",
    ]
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
    manifest = RunManifest(
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
    args = parser.parse_args()
    try:
        if args.command == "data":
            cache = ROOT / ".uv-cache" / "yfinance"
            cache.mkdir(parents=True, exist_ok=True)
            yf.set_tz_cache_location(str(cache))
            result = fetch(Path(args.output), args.start, args.end_exclusive)
            print(json.dumps(result, indent=2))
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
