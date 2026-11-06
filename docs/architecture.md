# Architecture

A provider acquires an immutable raw response and normalized snapshot; replay consumes only verified local data. A validated XNYS market environment exposes bounded returns, while strategies output target weights or retain holdings. Execution applies next-open fills and fees to a cash-and-units ledger. Evaluation computes metrics from the ledger and writes reports, CSVs, plot and provenance manifest. Core dataclasses and `MarketEnvironment`, `Strategy`, and `Evaluator` protocols define extension boundaries.

Future responsibilities: research modules will own chronological forecasting and frozen model evaluation; allocation policies translate risk forecasts to weights without coupling models to the ledger; stress modules will construct synchronized paths and disclose search budgets; forward modules will append decisions and hashes before outcomes. These are not implemented by this scaffold.
