"""Strict calendar validation and bounded observations."""

import exchange_calendars as xc
import numpy as np
import pandas as pd

from ripple.core.models import Observation

SYMBOLS = ("SPY", "IEF", "GLD", "VNQ")
COLUMNS = ("open", "high", "low", "close")


def sessions(start: str, end: str) -> pd.DatetimeIndex:
    calendar = xc.get_calendar("XNYS", start=start, end=end)
    return calendar.sessions_in_range(start, end)


def validate(frame: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    required = {"session", "symbol", *COLUMNS}
    if not required.issubset(frame.columns):
        raise ValueError(f"Missing columns: {sorted(required - set(frame.columns))}")
    data = frame.copy()
    data["session"] = pd.to_datetime(data.session, errors="raise")
    if data.session.dt.tz is not None or (data.session != data.session.dt.normalize()).any():
        raise ValueError("Session labels must be timezone-naive calendar dates")
    if data.duplicated(["session", "symbol"]).any():
        raise ValueError("Duplicate session/symbol")
    if set(data.symbol) != set(SYMBOLS):
        raise ValueError("Snapshot must contain exactly SPY, IEF, GLD, VNQ")
    grid = pd.MultiIndex.from_product([sessions(start, end), SYMBOLS], names=["session", "symbol"])
    actual = pd.MultiIndex.from_frame(data[["session", "symbol"]])
    if (
        len(actual) != len(grid)
        or not actual.difference(grid).empty
        or not grid.difference(actual).empty
    ):
        raise ValueError("Snapshot has missing, extra, or inconsistent exchange sessions")
    for col in COLUMNS:
        data[col] = pd.to_numeric(data[col], errors="raise")
    values = data[list(COLUMNS)].to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values <= 0).any():
        raise ValueError("OHLC values must be finite and positive")
    if (
        (data.high < data[["open", "close", "low"]].max(axis=1))
        | (data.low > data[["open", "close", "high"]].min(axis=1))
    ).any():
        raise ValueError("Inconsistent OHLC values")
    return data.sort_values(["session", "symbol"]).reset_index(drop=True)


class FrameMarket:
    def __init__(self, frame: pd.DataFrame, start: str, end: str):
        self.frame = validate(frame, start, end)
        self.dates = tuple(x.strftime("%Y-%m-%d") for x in sessions(start, end))
        self.opens = self.frame.pivot(index="session", columns="symbol", values="open").reindex(
            columns=SYMBOLS
        )
        self.closes = self.frame.pivot(index="session", columns="symbol", values="close").reindex(
            columns=SYMBOLS
        )

    def observation(self, session: str) -> Observation:
        ts = pd.Timestamp(session)
        if ts not in self.closes.index:
            raise ValueError("Unknown decision session")
        # Slice before calculating returns, so no future row enters the observation.
        past = self.closes.loc[:ts]
        returns = past.pct_change(fill_method=None).dropna().tail(252)
        available = (ts + pd.Timedelta(days=1)).tz_localize("America/New_York").tz_convert("UTC")
        rows = tuple(
            (date.strftime("%Y-%m-%d"), tuple(float(v) for v in row))
            for date, row in returns.iterrows()
        )
        return Observation(session, available.isoformat(), SYMBOLS, rows)
