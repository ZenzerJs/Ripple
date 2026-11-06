"""Metrics and local artifacts for a reproducible comparison."""

import json
from dataclasses import asdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def metrics(result):
    equity = np.array([result.initial_cash] + [x["equity"] for x in result.ledger], dtype=float)
    returns = equity[1:] / equity[:-1] - 1
    peak = np.maximum.accumulate(equity)
    return {
        "net_return": float(equity[-1] / equity[0] - 1),
        "annualized_volatility": float(np.std(returns, ddof=1) * np.sqrt(252))
        if len(returns) > 1
        else 0.0,
        "max_drawdown": float(np.min(equity / peak - 1)),
        "turnover": float(sum(row["turnover"] for row in result.ledger)),
        "total_costs": float(sum(t.fee for t in result.trades)),
        "final_equity": float(equity[-1]),
    }


def report(results, manifest, output: Path):
    if output.exists() and any(output.iterdir()):
        raise FileExistsError(f"Output directory is not empty: {output}")
    output.mkdir(parents=True, exist_ok=True)
    summary = {r.name: metrics(r) for r in results}
    fig, axes = plt.subplots(2, 1, figsize=(10, 7), sharex=True)
    for r in results:
        ledger = pd.DataFrame(r.ledger)
        ledger.to_csv(output / f"{r.name}_ledger.csv", index=False, float_format="%.17g")
        pd.DataFrame([asdict(t) for t in r.trades]).to_csv(
            output / f"{r.name}_trades.csv", index=False, float_format="%.17g"
        )
        pd.DataFrame(r.allocations).to_csv(
            output / f"{r.name}_allocations.csv", index=False, float_format="%.17g"
        )
        (output / f"{r.name}_decisions.json").write_text(
            json.dumps({"decisions": r.decisions, "pending": r.pending}, indent=2) + "\n",
            encoding="utf-8",
        )
        dates = pd.to_datetime(ledger.session)
        equity = ledger.equity.to_numpy()
        peaks = np.maximum.accumulate(np.concatenate(([r.initial_cash], equity)))[1:]
        axes[0].plot(dates, equity, label=r.name)
        axes[1].plot(dates, equity / peaks - 1, label=r.name)
    axes[0].set_ylabel("Equity ($)")
    axes[0].legend()
    axes[1].set_ylabel("Drawdown")
    axes[1].set_xlabel("Session")
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(output / "equity_drawdown.png", dpi=140)
    plt.close(fig)
    lines = [
        "# Replay comparison",
        "",
        "Initial capital: "
        + ", ".join(f"{r.name} ${r.initial_cash:,.2f}" for r in results)
        + ". Adjusted total-return units, not ETF shares.",
        "",
        "| Strategy | Final equity | Net return | Annualized volatility | "
        "Max drawdown | Turnover | Costs |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for name, m in summary.items():
        lines.append(
            f"| {name} | ${m['final_equity']:.2f} | {m['net_return']:.2%} | "
            f"{m['annualized_volatility']:.2%} | {m['max_drawdown']:.2%} | "
            f"{m['turnover']:.4f} | ${m['total_costs']:.2f} |"
        )
    lines += [
        "",
        "Turnover sums traded notional divided by pre-trade open equity; "
        "no half-turnover convention.",
        "Volatility uses sample standard deviation of close-to-close returns, "
        "including initial capital, times sqrt(252).",
        "Historical adjusted data is revised and not a point-in-time vintage. "
        "This is not evidence of trading utility.",
    ]
    (output / "comparison.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (output / "manifest.json").write_text(
        json.dumps({**asdict(manifest), "metrics": summary}, indent=2) + "\n", encoding="utf-8"
    )
    return summary
