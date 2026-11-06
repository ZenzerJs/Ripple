"""Self-financing adjusted-unit ledger and next-open execution."""

import math
from dataclasses import asdict

import pandas as pd

from ripple.core.models import BacktestResult, PortfolioState, TargetWeights, Trade
from ripple.data.market import SYMBOLS


def validate_weights(target: TargetWeights) -> dict[str, float]:
    if set(target.weights) - set(SYMBOLS):
        raise ValueError("Target includes an unknown symbol")
    weights = {s: float(target.weights.get(s, 0.0)) for s in SYMBOLS}
    if any(not math.isfinite(x) or x < 0 for x in weights.values()):
        raise ValueError("Weights must be finite and nonnegative")
    if sum(weights.values()) > 1.0 + 1e-12:
        raise ValueError("Weights must sum to at most one")
    return weights


def execute(session, prices, units, cash, target, fee_rate):
    """Trade at known open: sell first, then scale buys for fees and cash."""
    weights = validate_weights(target)
    if not math.isfinite(fee_rate) or not 0 <= fee_rate < 1:
        raise ValueError("Fee rate must be finite and in [0, 1)")
    equity = cash + sum(units[s] * prices[s] for s in SYMBOLS)
    desired = {s: weights[s] * equity for s in SYMBOLS}
    trades = []
    for s in SYMBOLS:
        amount = max(0.0, units[s] * prices[s] - desired[s])
        if amount > 1e-10:
            quantity = amount / prices[s]
            units[s] -= quantity
            fee = amount * fee_rate
            cash += amount - fee
            trades.append(Trade(session, s, "sell", quantity, prices[s], amount, fee, cash, equity))
    wanted = {s: max(0.0, desired[s] - units[s] * prices[s]) for s in SYMBOLS}
    gross = sum(wanted.values())
    scale = min(1.0, max(0.0, cash) / (gross * (1 + fee_rate))) if gross else 0.0
    for s in SYMBOLS:
        amount = wanted[s] * scale
        if amount > 1e-10:
            quantity = amount / prices[s]
            fee = amount * fee_rate
            units[s] += quantity
            cash -= amount + fee
            trades.append(Trade(session, s, "buy", quantity, prices[s], amount, fee, cash, equity))
    if cash < -1e-8 or any(value < -1e-10 for value in units.values()):
        raise ArithmeticError("Execution would create negative cash or units")
    return units, max(cash, 0.0), trades


def replay(market, strategy, start: str, end: str, initial_cash=10000.0, fee_bps=5.0):
    if not math.isfinite(initial_cash) or initial_cash <= 0:
        raise ValueError("Initial cash must be finite and positive")
    start_ts, end_ts = pd.Timestamp(start), pd.Timestamp(end)
    dates = market.closes.index
    if start_ts not in dates or end_ts not in dates or start_ts > end_ts:
        raise ValueError("Evaluation boundaries must be exchange sessions in the snapshot")
    first = dates.get_loc(start_ts)
    if first < 2:
        raise ValueError("Need a prior decision session and prior close for initialization")
    initial_session = dates[first - 1].strftime("%Y-%m-%d")
    units = {s: 0.0 for s in SYMBOLS}
    cash = float(initial_cash)
    initial_state = PortfolioState(cash, cash, {s: 0.0 for s in SYMBOLS})
    observation = market.observation(initial_session)
    if not observation.returns:
        raise ValueError("Insufficient initialization return history")
    order = strategy.decide(observation, initial_state, initial=True, first_of_month=False)
    if order is not None:
        validate_weights(order)
    decisions = [
        {
            "session": initial_session,
            "available_at": observation.available_at,
            "weights": dict(order.weights) if order is not None else None,
            "execution_session": start,
        }
    ]
    ledger, trades, allocations = [], [], []
    last_month = start_ts.to_period("M")
    for day in dates[first : dates.get_loc(end_ts) + 1]:
        label = day.strftime("%Y-%m-%d")
        daily_trades = []
        if order is not None:
            opens = market.opens.loc[day].to_dict()
            units, cash, daily_trades = execute(label, opens, units, cash, order, fee_bps / 10000)
            trades.extend(daily_trades)
            order = None
        closes = market.closes.loc[day].to_dict()
        equity = cash + sum(units[s] * closes[s] for s in SYMBOLS)
        weights = {s: units[s] * closes[s] / equity for s in SYMBOLS}
        ledger.append(
            {
                "session": label,
                "cash": cash,
                "equity": equity,
                "fees": sum(t.fee for t in daily_trades),
                "turnover": sum(t.notional / t.pretrade_equity for t in daily_trades),
            }
        )
        allocations.extend(
            {
                "session": label,
                "symbol": s,
                "units": units[s],
                "adjusted_close": closes[s],
                "weight": weights[s],
            }
            for s in SYMBOLS
        )
        obs = market.observation(label)
        new_month = day.to_period("M") != last_month
        last_month = day.to_period("M")
        order = strategy.decide(
            obs, PortfolioState(cash, equity, weights), initial=False, first_of_month=new_month
        )
        if order is not None:
            validate_weights(order)
            next_position = dates.get_loc(day) + 1
            next_date = dates[next_position] if next_position < len(dates) else None
            execution = (
                next_date.strftime("%Y-%m-%d")
                if next_date is not None and next_date <= end_ts
                else None
            )
            decisions.append(
                {
                    "session": label,
                    "available_at": obs.available_at,
                    "weights": dict(order.weights),
                    "execution_session": execution,
                }
            )
    pending = asdict(order) if order is not None else None
    return BacktestResult(
        strategy.name, initial_cash, ledger, trades, allocations, decisions, pending
    )
