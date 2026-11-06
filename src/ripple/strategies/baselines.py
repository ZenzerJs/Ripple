"""The two predeclared, forecast-free comparison strategies."""

from ripple.core.models import TargetWeights
from ripple.data.market import SYMBOLS


class BuyAndHold:
    name = "buy_and_hold"

    def decide(self, observation, state, *, initial, first_of_month):
        return TargetWeights({symbol: 0.25 for symbol in SYMBOLS}) if initial else None


class MonthlyEqualWeight:
    name = "monthly_equal_weight"

    def decide(self, observation, state, *, initial, first_of_month):
        return (
            TargetWeights({symbol: 0.25 for symbol in SYMBOLS})
            if initial or first_of_month
            else None
        )
