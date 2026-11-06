"""Offline unit tests for forecast-to-replay bridge and Phase 4B utility comparison."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ripple.core.models import RunManifest
from ripple.data.market import SYMBOLS, FrameMarket
from ripple.evaluation.comparison import (
    run_forecast_portfolio_comparison,
    write_phase4_comparison_report,
)
from ripple.forecasts import models as fm
from ripple.forecasts.adapter import classify_prediction
from ripple.simulation.replay import replay
from ripple.strategies.forecast_policy import ForecastPolicyStrategy

FIXTURE = Path(__file__).parent / "fixtures" / "demo.csv"


def test_forecast_policy_strategy_skips_negative_variance_and_retains_holdings():
    frame = pd.read_csv(FIXTURE)
    market = FrameMarket(frame, "2019-12-30", "2020-03-31")
    decision_sessions = ["2019-12-31", "2020-01-08", "2020-01-15"]

    forecasts = []
    for sess in decision_sessions:
        obs = market.observation(sess)
        for i, sym in enumerate(SYMBOLS):
            # On 2020-01-08, inject a negative variance for SPY to trigger skip_retain
            var = -0.0001 if (sess == "2020-01-08" and sym == "SPY") else 0.0001 * (i + 1)
            forecasts.append(
                classify_prediction(
                    asset=sym,
                    model_id="ridge_extended",
                    forecast_session=sess,
                    as_of_utc=obs.available_at,
                    horizon_sessions=5,
                    raw_prediction=var,
                    training_last_label_at_utc=obs.available_at,
                    data_sha256="demo_sha",
                    model_config_sha256="cfg_sha",
                    status="ok",
                )
            )

    strat = ForecastPolicyStrategy(
        "ridge_extended",
        forecasts,
        decision_sessions=decision_sessions,
        invalid_policy="skip",
    )
    res = replay(market, strat, "2020-01-02", "2020-01-31")

    # 3 scheduled decisions; 2 executed (2019-12-31, 2020-01-15), 1 skipped (2020-01-08)
    assert len(strat.audit_log) == 3
    assert [d.action for d in strat.audit_log] == ["rebalance", "skip_retain", "rebalance"]
    assert [d["session"] for d in res.decisions] == ["2019-12-31", "2020-01-15"]
    assert [d["execution_session"] for d in res.decisions] == ["2020-01-02", "2020-01-16"]

    # Verify units did not change on 2020-01-09 (the session after the skipped 2020-01-08 decision)
    alloc_df = pd.DataFrame(res.allocations)
    u_jan08 = alloc_df[alloc_df["session"] == "2020-01-08"].set_index("symbol")["units"]
    u_jan09 = alloc_df[alloc_df["session"] == "2020-01-09"].set_index("symbol")["units"]
    pd.testing.assert_series_equal(u_jan08, u_jan09)


def test_end_to_end_synthetic_phase4b_comparison_and_report(tmp_path: Path):
    cal = fm.xc.get_calendar("XNYS", start="2019-01-02", end="2020-12-31")
    dates = cal.sessions[:95]
    rows = []
    for i, sym in enumerate(SYMBOLS):
        for k, d in enumerate(dates):
            base = 100.0 + 5.0 * i + 0.15 * k + (1.2 if (k + i) % 3 == 0 else -0.8)
            rows.append(
                {
                    "session": d.strftime("%Y-%m-%d"),
                    "symbol": sym,
                    "open": base * 0.999,
                    "high": base * 1.004,
                    "low": base * 0.996,
                    "close": base,
                    "adjusted_close": base,
                }
            )
    frame = pd.DataFrame(rows)
    models = ("rolling21", "ewma094", "ridge")
    forecasts, forecasts_df, _, _ = fm.generate_multi_asset_forecasts(
        frame,
        as_of="2030-01-01T00:00:00Z",
        data_sha256="syn_sha",
        models=models,
        min_train=30,
        window=60,
        step=5,
    )
    results, summary, audit_logs = run_forecast_portfolio_comparison(
        frame,
        forecasts,
        forecasts_df,
        snapshot_start=dates[0].strftime("%Y-%m-%d"),
        snapshot_end=dates[-1].strftime("%Y-%m-%d"),
        models=models,
    )
    expected_names = [
        "buy_and_hold",
        "equal_weight_5d",
        "trailing_vol21_5d",
        "forecast_rolling21",
        "forecast_ewma094",
        "forecast_ridge",
    ]
    assert [r.name for r in results] == expected_names
    for name in expected_names:
        m = summary["portfolio_metrics"][name]
        assert m["final_equity"] > 0
        assert m["max_asset_weight"] <= 1.0

    manifest = RunManifest("synthetic", "syn_sha", None, "cfg_sha", {}, None, {}, {}, {})
    out_dir = tmp_path / "phase4b_report"
    written = write_phase4_comparison_report(results, summary, audit_logs, manifest, out_dir)
    assert (out_dir / "comparison.md").exists()
    assert (out_dir / "manifest.json").exists()
    assert (out_dir / "equity_drawdown.png").exists()
    assert "forecast_ridge" in written["metrics"]

    # Subperiod eval_start not falling immediately after a candidate session must align
    # to the next candidate decision session without false skipped initial decisions
    cand_sessions = sorted({f.forecast_session for f in forecasts})
    second_cand_pos = int(dates.get_loc(pd.Timestamp(cand_sessions[1])))
    # Pick an off-grid start session between cand_sessions[0] and cand_sessions[1]
    off_grid_start = dates[second_cand_pos - 1].strftime("%Y-%m-%d")
    _, sub_summary, _ = run_forecast_portfolio_comparison(
        frame,
        forecasts,
        forecasts_df,
        snapshot_start=dates[0].strftime("%Y-%m-%d"),
        snapshot_end=dates[-1].strftime("%Y-%m-%d"),
        eval_start=off_grid_start,
        models=models,
    )
    assert sub_summary["evaluation_window"]["initial_decision_session"] == cand_sessions[1]
    for m_name in ("forecast_rolling21", "forecast_ewma094"):
        pm = sub_summary["portfolio_metrics"][m_name]
        assert pm["skipped_decision_count"] == 0
        assert pm["executed_decision_count"] == pm["scheduled_decision_count"]
