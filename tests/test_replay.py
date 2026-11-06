import json
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ripple.core.models import TargetWeights
from ripple.data.market import SYMBOLS, FrameMarket, validate
from ripple.data.provider import load_snapshot, normalize, sha
from ripple.evaluation.report import metrics, report
from ripple.simulation.replay import execute, replay
from ripple.strategies.baselines import BuyAndHold, MonthlyEqualWeight

FIXTURE = Path(__file__).parent / "fixtures" / "demo.csv"


def market(frame=None):
    if frame is None:
        frame = pd.read_csv(FIXTURE)
    return FrameMarket(frame, "2019-12-30", "2020-03-31")


def test_initial_purchase_costs_and_cash_conservation():
    units = dict.fromkeys(SYMBOLS, 0.0)
    prices = dict.fromkeys(SYMBOLS, 100.0)
    weights = TargetWeights(dict.fromkeys(SYMBOLS, 0.25))
    units, cash, trades = execute("2020-01-02", prices, units, 10000, weights, 0.0005)
    invested = 10000 / 1.0005
    assert cash == pytest.approx(0, abs=1e-9)
    assert sum(units.values()) == pytest.approx(invested / 100)
    assert sum(t.fee for t in trades) == pytest.approx(invested * 0.0005)
    assert cash + sum(units[s] * prices[s] for s in SYMBOLS) + sum(
        t.fee for t in trades
    ) == pytest.approx(10000)
    assert all(t.side == "buy" and t.cash_after >= -1e-8 for t in trades)


def test_partial_cash_and_sell_first_rebalance():
    prices = dict.fromkeys(SYMBOLS, 100.0)
    units, cash, _ = execute(
        "d1", prices, dict.fromkeys(SYMBOLS, 0.0), 10000, TargetWeights({"SPY": 0.5}), 0.0005
    )
    assert units["SPY"] == pytest.approx(50)
    assert cash == pytest.approx(4997.5)
    units, cash, trades = execute("d2", prices, units, cash, TargetWeights({"IEF": 1.0}), 0.0005)
    assert trades[0].side == "sell" and trades[-1].side == "buy"
    assert units["SPY"] == pytest.approx(0)
    assert cash == pytest.approx(0, abs=1e-8)
    assert cash + sum(units[s] * prices[s] for s in SYMBOLS) + sum(
        t.fee for t in trades
    ) == pytest.approx(9997.5)


@pytest.mark.parametrize(
    "weights", [{"SPY": -0.1}, {"SPY": 1.1}, {"BAD": 0.1}, {"SPY": float("nan")}]
)
def test_invalid_weights_rejected(weights):
    with pytest.raises(ValueError):
        execute(
            "d",
            dict.fromkeys(SYMBOLS, 100.0),
            dict.fromkeys(SYMBOLS, 0.0),
            10000,
            TargetWeights(weights),
            0.0005,
        )


def test_schedule_retention_and_ledger_reconcile():
    m = market()
    hold = replay(m, BuyAndHold(), "2020-01-02", "2020-03-31")
    monthly = replay(m, MonthlyEqualWeight(), "2020-01-02", "2020-03-31")
    assert [d["session"] for d in monthly.decisions] == ["2019-12-31", "2020-02-03", "2020-03-02"]
    assert [d["execution_session"] for d in monthly.decisions] == [
        "2020-01-02",
        "2020-02-04",
        "2020-03-03",
    ]
    assert len(hold.trades) == 4
    allocations = pd.DataFrame(hold.allocations).pivot(
        index="session", columns="symbol", values="units"
    )
    assert allocations.nunique().eq(1).all()
    for result in (hold, monthly):
        summary = metrics(result)
        assert summary["total_costs"] == pytest.approx(sum(t.fee for t in result.trades))
        assert summary["turnover"] == pytest.approx(
            sum(t.notional / t.pretrade_equity for t in result.trades)
        )
        for row in result.ledger:
            group = [a for a in result.allocations if a["session"] == row["session"]]
            assert row["equity"] == pytest.approx(
                row["cash"] + sum(a["units"] * a["adjusted_close"] for a in group)
            )
            assert row["cash"] >= 0


def test_next_open_future_perturbation_cannot_change_decision():
    frame = pd.read_csv(FIXTURE)
    changed = frame.copy()
    mask = changed.session >= "2020-02-04"
    changed.loc[mask, ["open", "high", "low", "close"]] *= 1.7
    a, b = market(frame), market(changed)
    assert a.observation("2020-02-03") == b.observation("2020-02-03")
    ar = replay(a, MonthlyEqualWeight(), "2020-01-02", "2020-03-31")
    br = replay(b, MonthlyEqualWeight(), "2020-01-02", "2020-03-31")
    assert [d for d in ar.decisions if d["session"] <= "2020-02-03"] == [
        d for d in br.decisions if d["session"] <= "2020-02-03"
    ]
    assert [x for x in ar.ledger if x["session"] <= "2020-02-03"] == [
        x for x in br.ledger if x["session"] <= "2020-02-03"
    ]


def test_adjusted_prices_do_not_double_count_distributions():
    dates = pd.to_datetime(["2019-12-30", "2019-12-31", "2020-01-02"])
    data = {}
    for sym in SYMBOLS:
        data[(sym, "Open")] = [100.0, 100.0, 50.0]
        data[(sym, "High")] = [101.0, 101.0, 51.0]
        data[(sym, "Low")] = [99.0, 99.0, 49.0]
        data[(sym, "Close")] = [100.0, 100.0, 50.0]
        data[(sym, "Adj Close")] = [50.0, 50.0, 50.0]
        data[(sym, "Stock Splits")] = [0.0, 0.0, 2.0]
        data[(sym, "Dividends")] = [0.0, 0.0, 1.0]
    raw = pd.DataFrame(data, index=dates)
    adjusted = normalize(raw, "2019-12-30", "2020-01-02")
    assert adjusted.close.tolist() == [50.0] * 12
    result = replay(
        FrameMarket(adjusted, "2019-12-30", "2020-01-02"),
        BuyAndHold(),
        "2020-01-02",
        "2020-01-02",
        fee_bps=0,
    )
    assert result.ledger[-1]["equity"] == pytest.approx(10000)


def test_missing_duplicate_invalid_and_history_rejected():
    frame = pd.read_csv(FIXTURE)
    with pytest.raises(ValueError, match="missing"):
        validate(frame.iloc[1:], "2019-12-30", "2020-03-31")
    with pytest.raises(ValueError, match="Duplicate"):
        validate(pd.concat([frame, frame.iloc[:1]]), "2019-12-30", "2020-03-31")
    broken = frame.copy()
    broken.loc[0, "close"] = np.nan
    with pytest.raises(ValueError, match="finite"):
        validate(broken, "2019-12-30", "2020-03-31")
    with pytest.raises(ValueError, match="prior"):
        replay(market(), BuyAndHold(), "2019-12-31", "2020-03-31")


def test_deterministic_results_and_nondefault_report(tmp_path):
    m = market()
    one = replay(m, BuyAndHold(), "2020-01-02", "2020-03-31", initial_cash=15000)
    two = replay(m, BuyAndHold(), "2020-01-02", "2020-03-31", initial_cash=15000)
    assert asdict(one) == asdict(two)
    from ripple.core.models import RunManifest

    manifest = RunManifest("synthetic", sha(FIXTURE), None, "config", {}, None, {}, {}, {})
    summary = report([one], manifest, tmp_path / "report")
    content = (tmp_path / "report" / "comparison.md").read_text()
    assert "$15,000.00" in content
    assert summary[one.name]["final_equity"] == pytest.approx(one.ledger[-1]["equity"])
    assert json.loads((tmp_path / "report" / "manifest.json").read_text())["metrics"] == summary


def test_snapshot_hash_rejects_tampering(tmp_path):
    raw = tmp_path / "raw.csv"
    raw.write_text("original")
    normalized = tmp_path / "normalized.csv"
    normalized.write_bytes(FIXTURE.read_bytes())
    manifest = {
        "raw_sha256": sha(raw),
        "normalized_sha256": sha(normalized),
        "first_session": "2019-12-30",
        "last_session": "2020-03-31",
    }
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    assert len(load_snapshot(tmp_path)[0]) == len(pd.read_csv(FIXTURE))
    raw.write_text("tampered")
    with pytest.raises(ValueError, match="hash mismatch"):
        load_snapshot(tmp_path)


def test_pending_last_decision_and_drawdown_initial_base():
    result = replay(market(), MonthlyEqualWeight(), "2020-01-02", "2020-03-02")
    assert result.pending is not None
    assert result.decisions[-1]["session"] == "2020-03-02"
    assert result.decisions[-1]["execution_session"] is None
    assert all(t.session <= "2020-03-02" for t in result.trades)
    from ripple.core.models import BacktestResult

    hand = BacktestResult(
        "hand",
        10000,
        [
            {"equity": 9000, "turnover": 0},
            {"equity": 9500, "turnover": 0},
        ],
        [],
        [],
        [],
        None,
    )
    assert metrics(hand)["max_drawdown"] == pytest.approx(-0.1)
    assert metrics(hand)["net_return"] == pytest.approx(-0.05)


def test_observation_exposes_returns_not_levels():
    obs = market().observation("2019-12-31")
    assert obs.session == "2019-12-31"
    assert len(obs.returns) == 1
    assert not hasattr(obs, "open") and not hasattr(obs, "close")
    assert pd.Timestamp(obs.available_at) == pd.Timestamp("2020-01-01T05:00:00Z")
