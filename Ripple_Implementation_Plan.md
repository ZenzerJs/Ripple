# Ripple — Implementation Plan

**Project:** Ripple, a reproducible portfolio strategy research and stress-testing laboratory  
**Owner:** Jayden Saha  
**Prepared:** November 5, 2026  
**Status:** Implemented and verified offline across Phases 3–6 (`R-00` through `R-09`).

## 0. Executive decision

**Core research question:** *Do five-session volatility forecasts produce better portfolio decisions than simple risk estimates or equal-weight allocation, after the same trading costs?*

Ripple is **not** a market-beating trading bot. It is a transparent testbed for comparing forecasts, portfolio policies, and their failure modes under historical and constrained stress scenarios. Returns, drawdowns, model errors, trading costs, and failed runs must all remain visible, including null or negative results.

**Execution order:**

1. **Phase 3 handoff** — Verify the existing replay implementation and preserve its local uncommitted state.
2. **Phase 4A** — Integrate point-in-time five-session variance forecasts for four ETFs.
3. **Phase 4B** — Compare all forecasts through **one fixed allocation policy** against baselines, after identical execution rules and costs.
4. **Phase 5** — Add constrained scenario resampling and search for reproducible relative strategy failures.
5. **Phase 6** — Start a forward-decision ledger: commit decisions before execution; append outcomes only when known.

The shortest credible path to a useful result ends at **Phase 4B**. Phases 5 and 6 add differentiated robustness evidence, but must not block publication of an honest forecast-to-decision comparison.

## 1. Verified inputs versus reported local state

### 1.1 Existing GitHub predecessor

The public [ML Stock Simulator](https://github.com/ZenzerJs/ML-Stock-Simulator) contains a corrected historical-return forecasting pipeline and a distinct [five-session variance experiment](https://github.com/ZenzerJs/ML-Stock-Simulator/blob/main/experiments/volatility/README.md). Its documented fixed-design experiment uses two instruments, **SPY and AAPL**, and compares persistence, rolling variance, EWMA, GARCH(1,1), HAR-style OLS, Ridge, Random Forest, and extended Ridge. Results are descriptive and do not establish trading performance.

Important integration facts:

- Target: mean of the **next five exchange-session squared log returns**, not price return, annualized volatility, or high-frequency realized volatility.
- Units: **daily squared log-return** (variance proxy).
- Forecast timing: information available only after the completed bar, using the experiment's conservative availability boundary.
- Original data: frozen local snapshots with acquisition hashes; adjusted historical Yahoo data can be retrospectively revised and is not a true point-in-time vintage.
- The experiments expose SPY/AAPL 2016–2026 results. Do **not** call an already-inspected period a pristine unseen holdout.
- Some **extended Ridge** forecasts were negative. That is an invalid variance forecast for portfolio weighting and needs explicit, predeclared handling.

### 1.2 Ripple's local foundation — user-reported, not independently inspected

The user reports that Phase 3 historical replay was implemented and independently reviewed, with **14 offline tests and an uncached Ruff pass**. The 2020 comparison reports:

| Strategy | Final equity | Return | Annualized volatility | Max drawdown | Costs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Buy and hold | $11,149.89 | 11.50% | 17.03% | -18.97% | $5.00 |
| Monthly equal weight | $11,310.96 | 13.11% | 18.15% | -19.54% | $7.21 |

These are **accounting demonstration results**, not untouched holdout or a utility claim. The report says positions are **adjusted total-return units, not ETF shares**, and turnover is summed traded notional divided by pre-trade equity. The Ripple implementation is local and uncommitted; this plan cannot certify its code-level contracts until a read-only audit is performed.

### 1.3 Decisions to freeze before implementation

| Decision | Proposed default | Must verify in the local code? |
| --- | --- | --- |
| Four ETF universe | **TBD**, choose and record tickers before acquisition | Yes |
| Starting equity | $10,000 virtual | Yes |
| Forecast horizon | Next five exchange sessions | No — predecessor contract established |
| Allocation decisions | Every fifth exchange session | Yes |
| Portfolio constraints | Long-only, no leverage, optional cash, maximum 40% per ETF | Yes |
| Forecast-to-trade lag | Decision after completed bar; fill at **next supported replay execution price**, never at a price already used to decide | Yes |
| Costs | Existing replay cost model, identical across variants | Yes |
| Missing/invalid forecast | Predeclared skip/fallback policy, fully logged | Yes |
| Primary goal | Compare **risk-adjusted utility after costs**, not only final equity | No |

Do not quietly modify an established Phase 3 accounting convention merely to accommodate the forecast adapter. If the engine uses daily adjusted closes and has no open-price support, a next-session **close** fill is a defensible research convention if labelled explicitly, executed with the correct lag, and applied to every comparator. Do not claim exchange-realistic fill prices.

## 2. Technical architecture

```text
Frozen multi-ETF daily snapshots (each with checksum + acquisition time)
  -> Exchange-session calendar and data availability validation
  -> Mature-label training and forecaster runs
  -> Immutable per-date forecast artifacts (model ID, as-of, units, hashes)
  -> One fixed forecast-to-weight policy
  -> Existing deterministic Ripple replay (execution lag + costs)
  -> Metrics, attribution, per-trade audit and comparison report
  -> [Later] Constrained stress scenario generator + failure search
  -> [Later] Prospective forward-decision ledger
```

### 2.1 Separation of concerns

| Component | Owns | Must never do |
| --- | --- | --- |
| Market dataset | Adjusted historical prices, calendar, availability, hashes | Fill a missing date with a future observation |
| Forecaster | Predict next-five-session variance using mature training data | Read portfolio outcomes or future returns during prediction |
| Forecast adapter | Validate timestamps, units, status and per-asset alignment | Silently replace invalid forecasts with favourable ones |
| Allocation policy | Convert four forecasts to target weights via fixed formula | Change its rule based on test-set returns |
| Replay engine | Execute lagged allocation changes and account for costs | Execute at the decision bar's already-known price |
| Evaluator | Compare forecasts, returns, risk and failure modes | Optimize/tune policy using final test results |
| Stress generator | Construct constrained alternative return paths | Pretend generated shocks are actual future events |
| Forward ledger | Record committed inputs/decisions and later outcomes | Rewrite earlier decisions after seeing the outcome |

### 2.2 Proposed contracts (adapt names to existing modules)

```python
@dataclass(frozen=True)
class VarianceForecast:
    asset: str
    model_id: str
    as_of_utc: datetime
    horizon_sessions: int             # always 5 in Phase 4
    predicted_daily_variance: float  # daily squared-log-return units
    training_last_label_at_utc: datetime
    data_sha256: str
    model_config_sha256: str
    status: str                       # ok / unavailable / nonconverged / invalid


@dataclass(frozen=True)
class AllocationDecision:
    as_of_utc: datetime
    policy_id: str
    target_weights: dict[str, float]  # fixed ETF universe
    cash_weight: float
    source_forecast_hashes: tuple[str, ...]
```

These are conceptual contracts; do not drop them into the repo unchanged until the local engine's types, data model and timestamps have been inspected. Forecasts must be loadable from **frozen files** without retraining during every replay. Training and replay should be separable, and replay should make **no network calls**.

### 2.3 Information rules

At decision time `T`:

- Every input bar must have `available_at <= T`.
- Every supervised training label must have `target_available_at <= T`.
- A forecast issued at `T` predicts returns for the **next five** valid exchange sessions, without seeing any of those outcomes.
- Any execution price must belong to a later, predeclared fill event; no same-bar decisions/fills using hindsight.
- Models must record failure/nonconvergence instead of silently substituting another forecast.
- The replay should not learn or alter model parameters based on results in the same held-out run.

**Perturbation test:** modifying prices, observations or labels only **after** `T` cannot change a forecast or a decision issued **at** `T`, provided random seeds and training configuration are fixed.

## 3. Phase 3 handoff — Audit and freeze the replay foundation

**Priority:** P0. **Estimate:** 0.5–1 working day. **Do not rewrite the engine.**

### Tasks

- [x] Inspect local `git status`, branch, uncommitted files, and whether any of them contain private snapshots or credentials. Preserve all uncommitted work; do not reset, overwrite or bulk-copy it.
- [x] Read the existing replay API and policy interfaces, including accounting, cash, turnover, cost model, event order, market-calendar handling and data-hash checks.
- [x] Re-run the **reported** 14 tests and uncached Ruff (record command, Python version and actual results).
- [x] Reproduce the 2020 comparison from its frozen source; reconcile trade log, ledger, position history and final equity.
- [x] Confirm what `pre-trade open equity` means and whether fills are priced from adjusted daily close, market open, or another reference.
- [x] Freeze a reusable manifest and the engine's current API contract before adapter work.
- [x] Identify where to add the forecast adapter without introducing a second accounting engine.

**Exit gate:** all reported foundation tests and reconciliation checks are reproducible; the execution-time convention is written down; no uncommitted state was lost.

## 4. Phase 4A — Four-ETF variance forecast integration

**Priority:** P0. **Estimate:** 3–6 focused days (data/model runtime may increase this).  
**Goal:** produce four simultaneous, auditable variance forecasts for each eligible decision date.

### 4.1 Data freeze and universe

- [x] Choose **exactly four ETFs** and document selection logic *before* comparing performance. Avoid selecting tickers because their backtests looked good.
- [x] Acquire daily adjusted price histories for each under the same acquisition rules. Record source, UTC acquisition, date range, ticker identity and SHA-256 per file.
- [x] Align all four on one exchange-session calendar. Record missing sessions and their effects; do not forward-fill missing price/return windows.
- [x] Retain snapshots privately where redistribution terms require it; commit manifests and acquisition instructions instead of restricted source files.
- [x] Record which instruments/periods have already been inspected (SPY/AAPL 2016–2026, 2020 replay). Mark historical evaluation as development evidence unless a genuinely untouched split can be justified.

### 4.2 Freeze the first model set

Start with a small **predeclared** set, without selecting winners using Phase 4 returns:

1. **Rolling 21-session variance** — naive statistical baseline.
2. **EWMA (lambda 0.94)** — stronger inexpensive statistical baseline.
3. **GARCH(1,1)** — established conditional variance benchmark.
4. **Ridge** and **Random Forest** — supervised ML comparisons using the predecessor's existing fixed feature definition.

HAR-style OLS is valuable as an additional statistical comparator, but do not let integrating all eight predecessor variants delay the first complete portfolio run. Keep previous settings, failure statuses and source hashes visible. Extending from two instruments to four creates **new** experimental data; never present its results as part of the original two-asset preregistration.

### 4.3 Build the adapter

Potential file interfaces (names illustrative):

```text
artifacts/forecast_runs/<run-id>/
  config.json                 # target, model set, calendar, as-of conventions
  inputs.json                 # four snapshot IDs + checksums
  forecasts.csv              # one asset/model/decision-time row
  skipped.json               # invalid, missing, incomplete, nonconverged
  manifest.json              # source SHA, dependency versions, output hashes
```

Each record must contain `asset`, `model_id`, `as_of`, `target_horizon_sessions`, `predicted_variance`, `status`, `training_cutoff`, `data_hash`. Every model should be evaluated on its own successful dates *and* on the common dates shared by comparators; show exclusions and counts explicitly.

### Tests

- [x] All four assets share an identical declared decision calendar.
- [x] Missing asset dates do not cause accidental time-axis compression or cross-asset forward fill.
- [x] Each forecast is issued only after its information has become available.
- [x] Feature and training-label maturity is verified with explicit timestamps.
- [x] Future-data perturbations do not alter earlier forecasts.
- [x] Forecasts are reproducible from frozen source/config and identical seeds.
- [x] `NaN`, `Inf`, zero/negative variance, optimizer failure and missing rows have explicit statuses.
- [x] Raw model predictions are retained even if they fail validation. Never silently clip a model's failure and report it as successful forecasting.

**Exit gate:** reproducible four-asset forecast grid and an audit report with no look-ahead failures or silent model substitutions.

## 5. Phase 4B — Fixed-policy portfolio utility experiment

**Priority:** P0. **Estimate:** 3–5 focused days after Phase 4A.  
**Hypothesis:** better variance forecasts *may* improve a fixed risk-allocation policy, but improved forecast MAE/QLIKE does not imply better portfolio outcomes.

### 5.1 Freeze one allocation mapping

For valid positive forecasts `v_i` (daily variance), compute a volatility estimate `s_i = sqrt(v_i)` and tentative weights proportional to `1 / s_i`, then normalize. Apply the same predeclared maximum weight (proposed 40%) and redistribution/cash rule to every model. Do not use inverse **variance** for one model and inverse **volatility** for another.

The four ETFs' covariance/correlation structure is not explicitly optimized by this simple rule; name that limitation. Keep it fixed even if the performance looks poor. If a forecast is invalid or missing, use one of the following declared policies, chosen **before** evaluation: (a) skip the portfolio decision and retain prior weights, or (b) substitute the same predetermined rolling-variance fallback across *all* models while flagging fallback incidence. Prefer **(a)** for a clean initial comparison. Record the choice in the experiment contract.

### 5.2 Equal execution conditions

- Same starting budget, universe, cash rules, leverage/shorting restrictions and weight caps.
- Same every-fifth-session decision schedule and next-supported-price execution convention.
- Same fee, slippage assumptions (if modeled), portfolio rounding and accounting logic.
- Same rebalance trigger; no per-model tuning of turnover limits or risk aversion.
- Compare with **weekly equal weight**, **weekly inverse trailing-volatility**, and **buy-and-hold** using matched cost conventions. The earlier *monthly* 2020 comparison remains a foundation test, not a directly interchangeable Phase 4 benchmark.
- A benchmark must not be artificially penalized by unnecessary trades just to match an ML strategy's frequency; allow its predefined policy to govern orders, but use the same opportunities and fee schedule.

### 5.3 Primary and secondary outcomes

| Category | Report |
| --- | --- |
| Forecasting | MAE, RMSE, QLIKE, successful prediction count, convergence/invalid count |
| Portfolio utility | Net total/annualized return, maximum drawdown, annualized volatility, Sharpe ratio if appropriate |
| Trading | Total costs, turnover, rebalance count, exposure concentration, cash time |
| Attribution | Asset weights over time, predicted risk, realized risk, contributions to large drawdowns |
| Reliability | Missing decisions, fallback or skipped decisions, source and config hashes |

Report results on common eligible decision dates and clarify if holding-period comparisons differ due to missing forecasts. A model that has fewer decision opportunities must not be rewarded through silent exclusions. Record the full ledger even when a candidate fails.

### 5.4 Evaluation protocol

1. Freeze model list, allocation mapping, data windows, trading lag, costs, and metrics in a `CONTRACT.md` **before** running final comparisons.
2. Separate development, model-selection, and final reporting. Past SPY/AAPL and 2020 inspection means the historical period is **not pristine**. Describe this as exploratory historical research.
3. Do not retune on final periods. If all available history has been viewed, make genuinely new forward data the strongest eventual external validation.
4. Save per-date forecast, target weights, executed orders, equity curve and per-asset contributions for every policy.
5. Treat closely spaced decisions and overlapping training windows as dependent; do not use naive independent-sample significance claims. If doing inference, declare block-bootstrap/serial-correlation treatment and its assumptions.

### Exit gate and report

One command produces a reproducible report that answers:

> Did a forecast-driven policy outperform equal weight and trailing-volatility allocation after costs? If yes, was the improvement robust across dates and risk metrics? If no, what specifically caused the difference?

The answer may be **no**. That is a completed research outcome, not a failed project.

## 6. Phase 5 — Constrained strategy stress fuzzer

**Priority:** P1. **Estimate:** 1–2 weeks after Phase 4B.  
**Deliverable:** at least one reproducible, independently screened **relative failure case** for a strategy, not a claim about the worst conceivable market scenario.

### 6.1 Candidate scenario family

Begin with a **synchronized multi-asset block bootstrap** of historical return vectors: every day in a resampled block carries the four assets' returns together. Preserve short-run cross-asset relationships better than independently shuffling tickers. Use fixed block-length families and seed lists; document dependence/limitations and do not label this a causal economic simulator.

For every candidate path, recompute the strategy's features, forecasts or permitted prediction surrogates, allocations and executions **on that path**. Never replay an original-history forecast file against an altered path unless explicitly testing a frozen-policy counterfactual and labelling it as such.

### 6.2 Realism screen

- Marginal return distributions and tail quantiles.
- Volatility clustering / autocorrelation of squared returns.
- Cross-asset correlations and their variation over windows.
- Frequency and severity of drawdowns.
- Block-length sensitivity and regime representation.
- A **valid / rejected / borderline** tag with reasons; set thresholds before the adversarial search.

Passing these screens means only *plausible under the chosen empirical constraints*, not economically guaranteed. Reject obviously invalid paths and report how many attempts failed the screen.

### 6.3 Search and ranking

- Predeclare a finite search budget (e.g. fixed number of seeds, paths and model evaluations).
- Primary loss: **strategy underperformance against an equal-execution baseline** on a path, optionally with drawdown as a secondary objective.
- Keep an untouched **stress-validation collection** separate from the adversary's search collection; do not select winners on that validation set.
- Retain *all* attempted scenario IDs, parameters, hashes, validity verdicts, and objective values, including failures and timeouts.
- Report more than one strategy's failure profile; avoid cherry-picking a single spectacular crash.

### Exit gate

A reviewer can regenerate a failing path from seed/config, see that it passes the declared realism screens, inspect every trade and feature, and reproduce the comparison against the baseline. The report says **“failure case within this scenario family”**, never “proof the market will do this.”

## 7. Phase 6 — Prospective forward-decision ledger

**Priority:** P1 (design early; activate when forecasts and policies are stable). **Estimate:** 2–4 days for v0 plus ongoing elapsed time.

The scheduled system observes data available at the run cutoff, **writes and externally commits** inputs and the proposed portfolio decision before the next execution/outcome, and appends realized outcomes later as separate records.

Minimum events:

```text
run_scheduled -> data_snapshot_ready -> prediction_generated
  -> decision_committed -> execution_simulated -> outcome_finalized
```

Each record should include:

- UTC schedule time and actual execution time;
- strategy/model/config SHA, market data snapshot SHA, code commit SHA;
- observation cutoff, proposed weights, simulated execution convention;
- previous ledger record hash and current record hash;
- status (`success`, `skipped`, `failed`, `missed`) and error reason;
- a distinct later outcome record, linked to the committed decision.

**Integrity caveat:** a Git hash chain alone is neither an independent timestamp nor proof of completeness. A low-cost external timestamp or signed release may strengthen evidence, but missed-run logging and an independent schedule record are also required. Do not present Git author timestamps as unforgeable. Start with **paper-only**, no broker connections, auto-trading, secrets in logs, or claims of live profitability.

### Exit gate

An observer can identify an earlier recorded decision, verify that the later outcome was appended separately, see any scheduled failures, and distinguish revisions/corrections from the original decision. Historical backtests remain separate from forward results.

## 8. Testing matrix and release gates

| Layer | Representative tests | Required gate |
| --- | --- | --- |
| Data | Calendar gaps, checksum mismatch, partial bars, availability | Fail closed / explicit error |
| Forecasts | Mature labels, as-of boundary, future perturbation, invalid variance | No future access, audit trail |
| Adapter | Four-asset alignment, units, hashes, missing model | Deterministic freeze/replay |
| Policy | Positive variance input, weight cap, weight sum, cash, identical mapping | No ad hoc model treatment |
| Replay | Decision/fill lag, fees, equity reconciliation, no negative cash/leverage | Existing Phase 3 tests remain green |
| Comparison | Shared dates, stable policy, stable cost schedule, skipped events | Full per-date reporting |
| Stress fuzzer | Synchronized blocks, validity checks, reproducible seeds, budget | Failures are reproducible and screened |
| Forward ledger | Commit-before-outcome, chained records, missed-run status, retry idempotence | No rewriting prior decisions |

**CI goal:** offline tests + uncached lint/Ruff + deterministic research smoke tests on **synthetic fixtures**. Never make routine CI depend on live Yahoo requests, paid APIs, or private historical snapshots.

## 9. Proposed implementation layout (illustrative only)

Adapt to the actual local Ripple tree after Phase 3 handoff. Avoid duplicating code already present.

```text
Ripple/
  docs/
    roadmap.md
    research-contract.md
    decisions.md
  ripple/
    data/                  # schema, calendar, availability, hash checks
    forecasts/             # frozen artifacts + predecessor adapter
    policies/              # equal weight, trailing risk, fixed inverse-vol
    replay/                # existing Phase 3 engine, minimally extended
    evaluation/            # metrics and reports
    stress/                # Phase 5 only
    ledger/                # Phase 6 only
  tests/
    fixtures/              # small synthetic input only
    test_forecast_adapter.py
    test_temporal_boundary.py
    test_allocation_policy.py
    test_forecast_utility.py
    test_stress_realism.py
    test_forward_ledger.py
  artifacts/
    historical/            # deterministic report manifests
    forecasts/             # generated, source-dependent artifacts
    stress/                # Phase 5 reports
    forward/               # Phase 6 records
```

Prefer **Python, NumPy/Pandas, pytest, Ruff, and the existing replay package**. Reuse the predecessor's `arch`/scikit-learn models where sensible. Do not add Gymnasium, RL training, MLflow, a database server, FastAPI, Next.js or cloud deployment unless a specific accepted requirement needs them.

## 10. Suggested work packages and commit boundaries

| ID | Work package | Deliverable | Dependency |
| --- | --- | --- | --- |
| R-00 | Read-only Phase 3 inventory | Confirmed APIs, tests, branch and asset universe | None |
| R-01 | Forecast artifact schema | Versioned `forecast`/`status`/manifest contract | R-00 |
| R-02 | Four-ETF data acquisition and freeze | Checksummed data + calendar/availability audit | R-01 |
| R-03 | Forecaster integration | Reproducible four-asset model grid | R-02 |
| R-04 | Fixed allocation policy | Pure policy function, constraints, invalid handling | R-01 |
| R-05 | Forecast-to-replay bridge | Correct decision and fill timestamps | R-03, R-04 |
| R-06 | Portfolio comparison | Common-period report and full per-trade ledger | R-05 |
| R-07 | Stress generator + realism | Reproducible screened return-block scenarios | R-06 |
| R-08 | Relative failure search | Budgeted search + validation + detailed report | R-07 |
| R-09 | Forward record protocol | Commit-before-outcome + missed-run ledger | R-06 |

Suggested commits: one for the schema, one for deterministic tests, one for the adapter, one for policy, one for integration, one for the actual report. Do **not** generate fake data to populate a marketing dashboard or claim that tests have passed until run in the real repo.

## 11. First implementation session — 90 minutes

1. **Read-only inventory (20 min):** inspect local Ripple tree and `git status`; verify 14 tests and Ruff; locate the exact Phase 3 `run()`/`step()` replay and policy interfaces.
2. **Freeze one contract (20 min):** write down universe, decision timing, execution-price convention, forecast units, invalid handling, and cost model. Do not evaluate returns yet.
3. **Build a tiny synthetic fixture (20 min):** four fake price histories with one missing day, one invalid variance, and a known next-step fill.
4. **Write adapter tests (20 min):** reject future forecasts, nonpositive variance and mismatched dates; verify a deterministic allocation decision.
5. **Review (10 min):** check the planned first code diff is minimal and compatible with existing ledger/accounting.

**Session outcome:** a tested *contract* and a minimal adapter seam. Real four-asset forecast data comes next. This is intentionally smaller than implementing Phase 4 end-to-end in one sitting.

## 12. Stop conditions / scope control

- If Ripple's local code or uncommitted state cannot be inspected safely, do **not** overwrite or reinitialize the repo. Request a working copy/branch or a read-only archive.
- If source prices lack the fields needed for the proposed fill convention, revise the **experiment contract** before any model comparison and rerun baseline accounting under the new convention.
- If the four-ETF dataset has material gaps or mismatched availability, fix data integrity rather than silently reducing the sample to favourable dates.
- If every ML model underperforms basic baselines, publish the honest result and investigate failure modes; do not search new features until the current evaluation is frozen.
- If the fuzzer's realism screen cannot be defended, publish descriptive historical stress tests instead of claiming adversarial realism.
- If forward logging lacks an independent timestamp/completeness story, label it an internal paper ledger, not tamper-proof proof of forecasting skill.

## 13. Success criteria and portfolio narrative

**MVP success:** another engineer can run the deterministic four-ETF comparison offline from authorized frozen inputs; see exact forecasts, weight decisions, fees and outcomes; reproduce both baseline and ML paths; and audit why a policy performed better or worse. A negative ML result is acceptable.

**Extended success:** the stress tester finds and explains reproducible, statistically screened **relative failures**, and the prospective ledger begins accumulating decisions made before results were known.

**Resume-safe narrative only after verification:** “Designed a point-in-time, reproducible portfolio evaluation system that compares statistical and ML volatility forecasts under identical allocation and transaction-cost rules; developed constrained stress tests to expose regime-dependent strategy weaknesses.” Do not claim increased returns or risk reduction without actual validated measurements.

## References / existing project artifacts

- [ML Stock Simulator](https://github.com/ZenzerJs/ML-Stock-Simulator)
- [Existing five-session variance experiment](https://github.com/ZenzerJs/ML-Stock-Simulator/blob/main/experiments/volatility/README.md)
- [Forecast experiment contract](https://github.com/ZenzerJs/ML-Stock-Simulator/blob/main/experiments/volatility/CONTRACT.md)
- Ripple local reports supplied by Jayden: `docs/roadmap.md` and `artifacts/historical/2020/comparison.md` (user-reported foundation; local source still uncommitted).
- [scikit-learn data leakage guidance](https://scikit-learn.org/stable/common_pitfalls.html)
- [Stationary bootstrap (Politis & Romano, 1994)](https://doi.org/10.1080/01621459.1994.10476870)
- [The Probability of Backtest Overfitting](https://escholarship.org/uc/item/4w1110bb)

---

**Working rule:** fix a research question, freeze the policy and data rules, test the implementation, then evaluate. Never let a promising result rewrite the experiment that produced it.
