"""Explicit Yahoo acquisition into immutable, validated local snapshots."""

import hashlib
import importlib.metadata
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

from ripple.data.market import COLUMNS, SYMBOLS, validate


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def normalize(raw: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    rows = []
    for symbol in SYMBOLS:
        try:
            data = raw[symbol]
            factor = data["Adj Close"] / data["Close"]
            adjusted = pd.DataFrame({name: data[name.capitalize()] * factor for name in COLUMNS})
        except (KeyError, TypeError) as exc:
            raise ValueError(f"Missing Yahoo adjusted OHLC for {symbol}") from exc
        adjusted.index = pd.DatetimeIndex(adjusted.index).tz_localize(None)
        adjusted["session"] = adjusted.index
        adjusted["symbol"] = symbol
        rows.append(adjusted.reset_index(drop=True))
    return validate(pd.concat(rows, ignore_index=True), start, end)


def fetch(destination: Path, start: str, end_exclusive: str):
    if destination.exists():
        raise FileExistsError(f"Snapshot already exists: {destination}")
    started = datetime.now(timezone.utc).isoformat()
    # Explicitly preserve unadjusted OHLC and corporate-action fields in the response.
    raw = yf.download(
        list(SYMBOLS),
        start=start,
        end=end_exclusive,
        interval="1d",
        auto_adjust=False,
        actions=True,
        repair=False,
        keepna=True,
        group_by="ticker",
        progress=False,
        threads=False,
        ignore_tz=True,
        multi_level_index=True,
    )
    completed = datetime.now(timezone.utc).isoformat()
    if raw.empty:
        raise RuntimeError("Yahoo returned no rows; check connectivity or rate limits")
    end = (pd.Timestamp(end_exclusive) - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    normalized = normalize(raw, start, end)
    destination.mkdir(parents=True, exist_ok=False)
    raw_path, normalized_path = destination / "raw.csv", destination / "normalized.csv"
    raw.to_csv(raw_path, float_format="%.17g", date_format="%Y-%m-%d")
    normalized.to_csv(normalized_path, index=False, float_format="%.17g", date_format="%Y-%m-%d")
    metadata = {
        "provider": "Yahoo Finance via yfinance",
        "provider_version": importlib.metadata.version("yfinance"),
        "started_utc": started,
        "retrieved_utc": completed,
        "symbols": list(SYMBOLS),
        "request": {
            "start": start,
            "end_exclusive": end_exclusive,
            "interval": "1d",
            "auto_adjust": False,
            "actions": True,
            "repair": False,
            "keepna": True,
            "group_by": "ticker",
            "ignore_tz": True,
        },
        "adjustment": "raw OHLC multiplied by Adj Close / Close; no separate action cash flows",
        "raw_sha256": sha(raw_path),
        "normalized_sha256": sha(normalized_path),
        "first_session": normalized.session.min().strftime("%Y-%m-%d"),
        "last_session": normalized.session.max().strftime("%Y-%m-%d"),
    }
    (destination / "manifest.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    return metadata


def load_snapshot(directory: Path):
    metadata = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    for name, key in (("raw.csv", "raw_sha256"), ("normalized.csv", "normalized_sha256")):
        if sha(directory / name) != metadata[key]:
            raise ValueError(f"Snapshot hash mismatch: {name}")
    data = pd.read_csv(directory / "normalized.csv")
    data = validate(data, metadata["first_session"], metadata["last_session"])
    return data, metadata
