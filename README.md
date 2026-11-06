# Ripple replay foundation

Ripple is a local research toolkit for auditable portfolio replays. This first milestone compares independently funded buy-and-hold and monthly equal-weight portfolios, with next-open execution and transaction costs. The variance study in the separate predecessor repository is research context; no forecast, stress-search or forward-testing policy is integrated here.

## Windows / PowerShell setup

Install Python 3.12 and [uv](https://docs.astral.sh/uv/). From this directory:

```powershell
uv lock --check --cache-dir .uv-cache
uv sync --frozen --cache-dir .uv-cache
uv run --frozen --cache-dir .uv-cache pytest tests -q
uv run --frozen --cache-dir .uv-cache ruff check src tests
uv run --frozen --cache-dir .uv-cache ripple demo
```

The demo uses a deterministic synthetic fixture and needs no network after dependencies are installed. It writes `artifacts/synthetic/demo/`; output directories must be empty, so use `ripple demo --output artifacts/synthetic/another-run` for another run.

For the historical demonstration, acquire a private immutable snapshot once and replay it without network:

```powershell
uv run --frozen --cache-dir .uv-cache ripple data fetch
uv run --frozen --cache-dir .uv-cache ripple backtest --config configs/historical-2020.toml
```

Fetch refuses to overwrite the snapshot. A failure is an error; the simulator does not substitute synthetic data. The snapshot includes Yahoo's original response, adjusted OHLC, a retrieval manifest and SHA-256 hashes under ignored `data/`. Historical prices may be revised and are not archived point-in-time observations. Preserve the private snapshot to reproduce a result; another download may differ. Results, trades, daily allocations, ledger, decisions, comparison, plot and manifest are saved under ignored `artifacts/historical/2020/`. Do not publish vendor data without checking its terms.

[Replay decisions](docs/decisions/001-replay-contract.md) define timing and accounting. See the [architecture](docs/architecture.md), [data contract](docs/data-contract.md), [simulation contract](docs/simulation-contract.md), [research protocol](docs/research-protocol.md), [learning guide](docs/learning-guide.md) and [roadmap](docs/roadmap.md). This is educational research, not trading advice or a brokerage system.
