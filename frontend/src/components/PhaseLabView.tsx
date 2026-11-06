"use client";

import React, { useState } from "react";
import { PortfolioReplayBundle } from "@/lib/schema";

export type LabView = "portfolio" | "stress" | "ledger";
export interface PhaseLabViewProps {
  bundle: PortfolioReplayBundle | null;
  selectedStrategy?: string;
  comparatorStrategy?: string;
  labView?: LabView;
  onSelectStrategy?: (value: string) => void;
  onSelectComparator?: (value: string) => void;
  onSelectLabView?: (value: LabView) => void;
}

const money = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const strategyNames: Record<string, string> = {
  buy_and_hold: "Buy and hold",
  equal_weight_5d: "Equal weight (5 sessions)",
  trailing_vol21_5d: "Trailing volatility (21 sessions)",
  forecast_persistence5: "Persistence (5 sessions)",
  forecast_rolling21: "Rolling variance (21 sessions)",
  forecast_garch11: "GARCH(1,1)",
  forecast_ewma094: "EWMA (0.94)",
  forecast_ridge: "Ridge",
  forecast_har_ols: "HAR-style OLS",
  forecast_random_forest: "Random forest",
  forecast_ridge_extended: "Extended ridge",
  persistence5: "Persistence (5 sessions)",
  rolling21: "Rolling variance (21 sessions)",
  garch11: "GARCH(1,1)",
  ewma094: "EWMA (0.94)",
  har_ols: "HAR-style OLS",
  ridge: "Ridge",
  random_forest: "Random forest",
  ridge_extended: "Extended ridge",
};
const strategyName = (key: string) => strategyNames[key] ?? key;
const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

export function PhaseLabView({
  bundle,
  selectedStrategy: selectedProp,
  comparatorStrategy: comparatorProp,
  labView: viewProp,
  onSelectStrategy,
  onSelectComparator,
  onSelectLabView,
}: PhaseLabViewProps) {
  const [localStrategy, setLocalStrategy] = useState("forecast_random_forest");
  const [localComparator, setLocalComparator] = useState("forecast_ewma094");
  const [localView, setLocalView] = useState<LabView>("portfolio");
  const requestedStrategy = selectedProp ?? localStrategy;
  const requestedComparator = comparatorProp ?? localComparator;
  const labView = viewProp ?? localView;
  const selectStrategy = (value: string) => {
    setLocalStrategy(value);
    onSelectStrategy?.(value);
  };
  const selectComparator = (value: string) => {
    setLocalComparator(value);
    onSelectComparator?.(value);
  };
  const selectView = (value: LabView) => {
    setLocalView(value);
    onSelectLabView?.(value);
  };

  if (!bundle || bundle.status !== "verified")
    return (
      <section data-testid="phase-lab-unavailable" className="ripple-card p-8">
        <h1 className="text-xl font-bold">Portfolio research unavailable</h1>
        <p className="text-muted mt-2">
          Export the viewer artifacts with{" "}
          <code>uv run ripple export-viewer</code> to inspect the replay.
        </p>
      </section>
    );

  const curveKeys = Object.keys(bundle.equity_curves).filter(
    (key) => bundle.equity_curves[key]?.length > 0,
  );
  const selectedStrategy = curveKeys.includes(requestedStrategy)
    ? requestedStrategy
    : curveKeys.includes("forecast_random_forest")
      ? "forecast_random_forest"
      : (curveKeys[0] ?? "forecast_random_forest");
  const comparatorStrategy = curveKeys.includes(requestedComparator)
    ? requestedComparator
    : curveKeys.includes("forecast_ewma094")
      ? "forecast_ewma094"
      : (curveKeys[0] ?? "forecast_ewma094");
  const unsupportedSelection =
    selectedStrategy !== requestedStrategy ||
    comparatorStrategy !== requestedComparator;
  const committedCount = bundle.forward_ledger.records.filter(
    (record) =>
      record.event_type === "decision_committed" && record.status === "success",
  ).length;
  const finalizedCount = bundle.forward_ledger.records.filter(
    (record) =>
      record.event_type === "outcome_finalized" && record.status === "success",
  ).length;
  const activeCurve = bundle.equity_curves[selectedStrategy] ?? [];
  const compCurve = bundle.equity_curves[comparatorStrategy] ?? [];
  const equities = [...activeCurve, ...compCurve].map((point) => point.equity);
  const min = Math.floor(Math.min(...equities, 10000) / 1000) * 1000;
  const max = Math.ceil(Math.max(...equities, 10000) / 1000) * 1000;
  const x = (i: number, length: number) =>
    65 + (length > 1 ? i / (length - 1) : 0) * 740;
  const y = (value: number) =>
    220 - ((value - min) / Math.max(1, max - min)) * 190;
  const path = (points: typeof activeCurve) =>
    points
      .map(
        (point, i) =>
          `${i ? "L" : "M"} ${x(i, points.length).toFixed(1)} ${y(point.equity).toFixed(1)}`,
      )
      .join(" ");
  const selectedMetric = bundle.portfolio_metrics.find(
    (row) => row.strategy === selectedStrategy,
  );
  const comparatorMetric = bundle.portfolio_metrics.find(
    (row) => row.strategy === comparatorStrategy,
  );
  const auditSamples = bundle.decision_audit_samples?.[selectedStrategy] ?? [];
  const worst = bundle.stress_summary?.worst_valid_scenario;
  const profiles = bundle.stress_summary?.strategy_failure_profiles ?? {};
  const metricSummary = (row: typeof selectedMetric) =>
    row ? (
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt>Final equity</dt>
          <dd className="font-mono">{money(row.final_equity)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Net return</dt>
          <dd className="font-mono">{pct(row.net_return)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Sharpe</dt>
          <dd className="font-mono">{row.sharpe.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Max drawdown</dt>
          <dd className="font-mono">{pct(row.max_drawdown)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Trading costs</dt>
          <dd className="font-mono">{money(row.total_costs)}</dd>
        </div>
      </dl>
    ) : (
      <p className="text-sm text-muted">
        No metrics available for this selection.
      </p>
    );

  return (
    <div data-testid="phase-lab-view" className="space-y-6 ripple-enter">
      <header className="workspace-heading">
        <p className="text-sm font-mono uppercase text-action">
          Research workspace
        </p>
        <h1 className="font-display text-3xl sm:text-4xl mt-2">
          Portfolio replay
        </h1>
        <p className="text-muted mt-2">
          Follow forecast policies through allocation, execution, and stress.{" "}
          {bundle.source.universe.join(" · ")} · {bundle.source.window_start} to{" "}
          {bundle.source.window_end}
        </p>
      </header>
      <nav
        aria-label="Portfolio research views"
        className="workspace-tabs flex flex-wrap gap-2"
      >
        {(
          [
            ["portfolio", "Portfolio"],
            ["stress", "Stress"],
            ["ledger", "Ledger"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            data-testid={`lab-view-${key}`}
            type="button"
            aria-current={labView === key ? "page" : undefined}
            onClick={() => selectView(key)}
            className={`min-h-[44px] px-4 rounded-lg border ${labView === key ? "border-action text-action bg-raised" : "border-border-subtle text-muted"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {labView === "portfolio" && (
        <>
          <div className="workspace-grid">
            <section
              aria-label="Portfolio equity replay comparison"
              data-testid="lab-equity-chart"
              className="ripple-card p-5 sm:p-7 min-w-0"
            >
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <p className="text-sm font-mono text-action">
                    NET EQUITY · {bundle.source.scheduled_decision_sessions}{" "}
                    SCHEDULED DECISIONS
                  </p>
                  <h2 className="text-xl font-bold mt-1">Compare the paths</h2>
                  <p className="text-sm text-muted mt-1">
                    $10,000 initial virtual cash ·{" "}
                    {bundle.source.fee_bps.toFixed(1)} bps per-side cost ·{" "}
                    {bundle.source.execution_convention}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 my-5">
                <label className="text-sm text-muted">
                  Policy (solid)
                  <br />
                  <select
                    data-testid="lab-select-policy"
                    value={selectedStrategy}
                    onChange={(e) => selectStrategy(e.target.value)}
                    className="min-h-[44px] max-w-full rounded-lg border border-action bg-surface px-3 text-text font-mono"
                  >
                    {curveKeys.map((key) => (
                      <option key={key} value={key}>
                        {strategyName(key)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-muted">
                  Comparator (dashed)
                  <br />
                  <select
                    data-testid="lab-select-baseline"
                    value={comparatorStrategy}
                    onChange={(e) => selectComparator(e.target.value)}
                    className="min-h-[44px] max-w-full rounded-lg border border-border-strong bg-surface px-3 text-text font-mono"
                  >
                    {curveKeys.map((key) => (
                      <option key={key} value={key}>
                        {strategyName(key)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {unsupportedSelection && (
                <p className="text-sm text-muted mb-3" role="status">
                  A requested strategy is unavailable; showing the available
                  default comparison.
                </p>
              )}
              {(!activeCurve.length || !compCurve.length) && (
                <p className="text-sm text-muted mb-3">
                  Equity paths are unavailable.
                </p>
              )}
              <div className="overflow-x-auto">
                <svg
                  viewBox="0 0 840 250"
                  className="w-full min-w-[600px] h-auto"
                  role="img"
                  aria-label={`Net equity comparing ${strategyName(selectedStrategy)} (solid) and ${strategyName(comparatorStrategy)} (dashed)`}
                >
                  {[0, 0.5, 1].map((t) => {
                    const value = min + t * (max - min);
                    return (
                      <g key={t}>
                        <line
                          x1="65"
                          x2="805"
                          y1={y(value)}
                          y2={y(value)}
                          stroke="var(--border-subtle)"
                        />
                        <text
                          x="55"
                          y={y(value) + 4}
                          textAnchor="end"
                          fontSize="12"
                          fill="var(--muted)"
                        >
                          ${Math.round(value).toLocaleString()}
                        </text>
                      </g>
                    );
                  })}
                  <path
                    d={path(compCurve)}
                    fill="none"
                    stroke="var(--comparison)"
                    strokeWidth="2"
                    strokeDasharray="6 5"
                  />
                  <path
                    d={path(activeCurve)}
                    fill="none"
                    stroke="var(--action)"
                    strokeWidth="2.75"
                  />
                  <text x="65" y="244" fontSize="12" fill="var(--muted)">
                    {activeCurve[0]?.session ?? bundle.source.window_start}
                  </text>
                  <text
                    x="805"
                    y="244"
                    textAnchor="end"
                    fontSize="12"
                    fill="var(--muted)"
                  >
                    {activeCurve[activeCurve.length - 1]?.session ??
                      bundle.source.window_end}
                  </text>
                </svg>
              </div>
            </section>
            <aside className="workspace-inspector ripple-card p-5">
              <details className="workspace-inspector-disclosure">
                <summary className="cursor-pointer min-h-[44px] font-semibold">
                  Comparison summary
                </summary>
                <div className="space-y-5">
                  <div>
                    <h3 className="font-mono text-sm break-all mb-2">
                      {strategyName(selectedStrategy)} · solid
                    </h3>
                    {metricSummary(selectedMetric)}
                  </div>
                  <div>
                    <h3 className="font-mono text-sm break-all mb-2">
                      {strategyName(comparatorStrategy)} · dashed
                    </h3>
                    {metricSummary(comparatorMetric)}
                  </div>
                  <p className="text-sm text-muted">
                    Results are exploratory and depend on this universe, window,
                    and fixed policy. {bundle.limitations[0]}
                  </p>
                </div>
              </details>
              <div className="workspace-inspector-desktop hidden">
                <h2 className="font-semibold mb-4">Comparison summary</h2>
                <div className="space-y-5">
                  <div>
                    <h3 className="font-mono text-sm break-all mb-2">
                      {strategyName(selectedStrategy)} · solid
                    </h3>
                    {metricSummary(selectedMetric)}
                  </div>
                  <div>
                    <h3 className="font-mono text-sm break-all mb-2">
                      {strategyName(comparatorStrategy)} · dashed
                    </h3>
                    {metricSummary(comparatorMetric)}
                  </div>
                  <p className="text-sm text-muted">
                    Results are exploratory and depend on this universe, window,
                    and fixed policy. {bundle.limitations[0]}
                  </p>
                </div>
              </div>
            </aside>
          </div>
          <section
            data-testid="lab-portfolio-table"
            className="ripple-card p-5 sm:p-7"
          >
            <h2 className="text-xl font-bold">Portfolio utility comparison</h2>
            <p className="text-sm text-muted my-3">
              Positive variance forecasts are converted to inverse-volatility
              weights, capped at {(bundle.source.max_weight * 100).toFixed(0)}%.
              Invalid forecasts retain prior holdings.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm font-mono">
                <thead>
                  <tr>
                    {[
                      "Strategy",
                      "Final equity",
                      "Net return",
                      "CAGR",
                      "Ann. vol",
                      "Sharpe",
                      "Max DD",
                      "Turnover",
                      "Costs",
                      "Rebalances",
                      "Skipped",
                    ].map((label) => (
                      <th key={label} className="p-2 whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bundle.portfolio_metrics.map((row) => (
                    <tr
                      key={row.strategy}
                      className="border-t border-border-subtle"
                    >
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => selectStrategy(row.strategy)}
                          disabled={!bundle.equity_curves[row.strategy]}
                          className="min-h-[44px] text-left text-action disabled:text-muted"
                        >
                          {strategyName(row.strategy)}
                        </button>
                      </td>
                      <td className="p-2">{money(row.final_equity)}</td>
                      <td className="p-2">{pct(row.net_return)}</td>
                      <td className="p-2">{pct(row.cagr)}</td>
                      <td className="p-2">{pct(row.annualized_volatility)}</td>
                      <td className="p-2">{row.sharpe.toFixed(2)}</td>
                      <td className="p-2">{pct(row.max_drawdown)}</td>
                      <td className="p-2">{row.turnover.toFixed(2)}×</td>
                      <td className="p-2">{money(row.total_costs)}</td>
                      <td className="p-2">{row.rebalance_count}</td>
                      <td className="p-2">{row.skipped_decisions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section
            data-testid="lab-forecast-table"
            className="ripple-card p-5 sm:p-7"
          >
            <h2 className="text-xl font-bold">Forecast accuracy</h2>
            <p className="text-sm text-muted my-3">
              Daily squared log-return variance proxy ·{" "}
              {bundle.forecast_metrics.common_decision_sessions} common decision
              sessions
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm font-mono">
                <thead>
                  <tr>
                    {[
                      "Model",
                      "OK",
                      "Invalid (≤0)",
                      "Common MAE",
                      "Common QLIKE",
                    ].map((label) => (
                      <th className="p-2 whitespace-nowrap" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(bundle.forecast_metrics.models).map(
                    ([key, info]) => (
                      <tr key={key} className="border-t border-border-subtle">
                        <td className="p-2">{strategyName(key)}</td>
                        <td className="p-2">{info.status_counts?.ok ?? 0}</td>
                        <td className="p-2">
                          {info.status_counts?.invalid ?? 0}
                        </td>
                        <td className="p-2">
                          {info.common_dates_scored.mae.toFixed(8)}
                        </td>
                        <td className="p-2">
                          {info.common_dates_scored.qlike.toFixed(4)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {labView === "stress" && (
        <section
          data-testid="lab-stress-summary"
          className="ripple-card p-5 sm:p-7"
        >
          <h2 className="text-2xl font-bold">Stress search</h2>
          <p className="text-muted mt-2">
            Constrained block-bootstrap scenarios are failure cases within this
            search family, not predictions of market returns.
          </p>
          <p className="text-sm mt-4">
            Screening: {bundle.stress_summary?.verdict_counts?.valid ?? 0} valid
            · {bundle.stress_summary?.verdict_counts?.borderline ?? 0}{" "}
            borderline · {bundle.stress_summary?.verdict_counts?.rejected ?? 0}{" "}
            rejected
          </p>
          <p className="text-sm mt-2">
            Worst valid scenario:{" "}
            <span className="font-mono">
              {worst?.scenario_id ?? "Unavailable"}
            </span>
            {worst?.block_length != null &&
              ` · block length ${worst.block_length}`}
            {worst?.seed != null && ` · seed ${worst.seed}`}
          </p>
          <div className="overflow-x-auto mt-5">
            <table className="w-full text-left text-sm font-mono">
              <thead>
                <tr>
                  {[
                    "Strategy",
                    "Worst valid path",
                    "Return gap (pp)",
                    "Underperformed",
                  ].map((label) => (
                    <th className="p-2 whitespace-nowrap" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(profiles).map(([strategy, profile]) => (
                  <tr key={strategy} className="border-t border-border-subtle">
                    <td className="p-2">{strategyName(strategy)}</td>
                    <td className="p-2">{profile.worst_scenario_id}</td>
                    <td className="p-2">
                      {(profile.worst_relative_return_vs_ew5d * 100).toFixed(2)}{" "}
                      pp
                    </td>
                    <td className="p-2">
                      {profile.underperformed_ew5d_count} /{" "}
                      {profile.evaluated_valid_scenarios ??
                        profile.valid_scenario_count ??
                        "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {labView === "ledger" && (
        <div data-testid="lab-ledger-section" className="space-y-6">
          <section
            data-testid="lab-decision-audit"
            className="ripple-card p-5 sm:p-7"
          >
            <h2 className="text-2xl font-bold">
              Decision audit · {strategyName(selectedStrategy)}
            </h2>
            <p className="text-muted mt-2">
              These historical decision samples demonstrate the audit: decisions
              commit after the completed bar and orders fill at the next
              supported XNYS open.
            </p>
            <div className="mt-4 space-y-2">
              {auditSamples.length ? (
                auditSamples.slice(0, 10).map((item, index) => (
                  <div
                    key={index}
                    className="border-t border-border-subtle pt-3 text-sm"
                  >
                    <span className="font-mono">
                      Decision:{" "}
                      {String(
                        item.decision_session ?? item.session ?? "Unavailable",
                      )}{" "}
                      · {String(item.action ?? "Unavailable")}
                    </span>
                    {item.as_of_utc != null && (
                      <p className="text-muted">
                        Cutoff UTC: {String(item.as_of_utc)}
                      </p>
                    )}
                    {item.reason != null && (
                      <p className="text-muted">
                        Reason: {String(item.reason)}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-muted">
                  No sample decision record is available for this strategy.
                </p>
              )}
            </div>
          </section>
          <section
            data-testid="lab-forward-ledger"
            className="ripple-card p-5 sm:p-7"
          >
            <h2 className="text-2xl font-bold">Forward ledger</h2>
            <p className="text-muted mt-2">
              {bundle.forward_ledger.verification.valid
                ? `Chain consistency verified · ${bundle.forward_ledger.verification.record_count} events`
                : "Chain consistency unverified"}{" "}
              · {committedCount} committed decisions · {finalizedCount}{" "}
              finalized outcomes. These historical records demonstrate the
              workflow; chain consistency does not establish when events
              occurred.
            </p>
            <div className="mt-4 space-y-3">
              {bundle.forward_ledger.records.length ? (
                bundle.forward_ledger.records.map((record) => (
                  <div
                    key={record.sequence_no}
                    className="border-t border-border-subtle pt-3 text-sm"
                  >
                    <p className="font-mono">
                      #{record.sequence_no} · {record.event_type} ·{" "}
                      {record.model_id} · {record.status}
                    </p>
                    <p className="text-muted font-mono break-all">
                      record_hash: {record.record_hash} · prev:{" "}
                      {record.prev_record_hash}
                    </p>
                    {record.proposed_weights && (
                      <p>
                        Proposed weights:{" "}
                        {Object.entries(record.proposed_weights)
                          .map(
                            ([key, value]) =>
                              `${key} ${(value * 100).toFixed(1)}%`,
                          )
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-muted">
                  No forward ledger records are available.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
