"""Synchronized multi-asset circular block bootstrap of historical OHLC return vectors."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

from ripple.data.market import SYMBOLS, validate


def generate_block_bootstrap_path(
    frame: pd.DataFrame,
    *,
    block_length: int,
    seed: int,
    symbols: Sequence[str] = SYMBOLS,
) -> tuple[pd.DataFrame, dict[str, object]]:
    """Resample synchronized 4-asset daily return and intraday OHLC ratio blocks."""
    if block_length < 1:
        raise ValueError("block_length must be >= 1")
    dates = sorted(pd.to_datetime(frame["session"]).unique())
    n_sessions = len(dates)
    if n_sessions < 3:
        raise ValueError("Need at least 3 sessions for block bootstrap")
    start_str = pd.Timestamp(dates[0]).strftime("%Y-%m-%d")
    end_str = pd.Timestamp(dates[-1]).strftime("%Y-%m-%d")
    clean = validate(frame, start_str, end_str)

    piv_open = clean.pivot(index="session", columns="symbol", values="open").reindex(
        columns=symbols
    )
    piv_high = clean.pivot(index="session", columns="symbol", values="high").reindex(
        columns=symbols
    )
    piv_low = clean.pivot(index="session", columns="symbol", values="low").reindex(
        columns=symbols
    )
    piv_close = clean.pivot(index="session", columns="symbol", values="close").reindex(
        columns=symbols
    )

    o_arr = piv_open.to_numpy(dtype=float)
    h_arr = piv_high.to_numpy(dtype=float)
    l_arr = piv_low.to_numpy(dtype=float)
    c_arr = piv_close.to_numpy(dtype=float)

    prev_c = c_arr[:-1]
    r_close = c_arr[1:] / prev_c
    r_open = o_arr[1:] / prev_c
    oc_max = np.maximum(o_arr[1:], c_arr[1:])
    oc_min = np.minimum(o_arr[1:], c_arr[1:])
    r_high_mult = np.maximum(1.0, h_arr[1:] / oc_max)
    r_low_mult = np.minimum(1.0, l_arr[1:] / oc_min)

    n_steps = n_sessions - 1
    b = min(int(block_length), n_steps)
    rng = np.random.default_rng(int(seed))
    n_blocks = int(np.ceil(n_steps / b))
    # Circular block bootstrap over step indices 0 .. n_steps - 1
    block_starts = rng.integers(0, n_steps, size=n_blocks)
    sampled_indices = np.concatenate(
        [( s + np.arange(b) ) % n_steps for s in block_starts]
    )[:n_steps]

    new_o = np.empty_like(o_arr)
    new_h = np.empty_like(h_arr)
    new_l = np.empty_like(l_arr)
    new_c = np.empty_like(c_arr)

    new_o[0] = o_arr[0]
    new_h[0] = h_arr[0]
    new_l[0] = l_arr[0]
    new_c[0] = c_arr[0]

    for t in range(n_steps):
        k = int(sampled_indices[t])
        prev = new_c[t]
        c_t = prev * r_close[k]
        o_t = prev * r_open[k]
        hi_base = np.maximum(o_t, c_t)
        lo_base = np.minimum(o_t, c_t)
        h_t = hi_base * r_high_mult[k]
        l_t = lo_base * r_low_mult[k]
        new_o[t + 1] = o_t
        new_h[t + 1] = h_t
        new_l[t + 1] = l_t
        new_c[t + 1] = c_t

    rows: list[dict[str, object]] = []
    session_strs = [pd.Timestamp(d).strftime("%Y-%m-%d") for d in piv_close.index]
    for t_idx, sess in enumerate(session_strs):
        for s_idx, sym in enumerate(symbols):
            rows.append(
                {
                    "session": sess,
                    "symbol": sym,
                    "open": float(new_o[t_idx, s_idx]),
                    "high": float(new_h[t_idx, s_idx]),
                    "low": float(new_l[t_idx, s_idx]),
                    "close": float(new_c[t_idx, s_idx]),
                    "adjusted_close": float(new_c[t_idx, s_idx]),
                }
            )
    out_frame = validate(pd.DataFrame(rows), start_str, end_str)
    out_frame["adjusted_close"] = out_frame["close"]
    metadata = {
        "scenario_id": f"block{b}_seed{seed}",
        "block_length": int(b),
        "seed": int(seed),
        "n_sessions": int(n_sessions),
        "block_starts": [int(x) for x in block_starts],
    }
    return out_frame, metadata
