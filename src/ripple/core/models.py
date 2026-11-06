"""Shared replay records and narrow extension interfaces."""

from dataclasses import dataclass
from typing import Mapping, Protocol


@dataclass(frozen=True)
class Observation:
    session: str
    available_at: str
    symbols: tuple[str, ...]
    # Each row is a session and dimensionless close-to-close returns.
    returns: tuple[tuple[str, tuple[float, ...]], ...]


@dataclass(frozen=True)
class TargetWeights:
    weights: Mapping[str, float]


@dataclass(frozen=True)
class PortfolioState:
    cash: float
    equity: float
    weights: Mapping[str, float]


@dataclass(frozen=True)
class Trade:
    session: str
    symbol: str
    side: str
    units: float
    price: float
    notional: float
    fee: float
    cash_after: float
    pretrade_equity: float


@dataclass
class BacktestResult:
    name: str
    initial_cash: float
    ledger: list[dict]
    trades: list[Trade]
    allocations: list[dict]
    decisions: list[dict]
    pending: dict | None


@dataclass(frozen=True)
class RunManifest:
    kind: str
    dataset_sha256: str
    raw_sha256: str | None
    config_sha256: str
    source_sha256: Mapping[str, str]
    code_revision: str | None
    environment: Mapping[str, str]
    config: Mapping
    provider: Mapping


class MarketEnvironment(Protocol):
    def observation(self, session: str) -> Observation: ...


class Strategy(Protocol):
    name: str

    def decide(
        self,
        observation: Observation,
        state: PortfolioState,
        *,
        initial: bool,
        first_of_month: bool,
    ) -> TargetWeights | None: ...


class Evaluator(Protocol):
    def metrics(self, result: BacktestResult) -> dict[str, float]: ...
