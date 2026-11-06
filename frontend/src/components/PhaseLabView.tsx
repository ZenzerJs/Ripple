"use client";

import React, { useState } from "react";
import { PortfolioReplayBundle } from "@/lib/schema";

interface PhaseLabViewProps {
  bundle: PortfolioReplayBundle | null;
}

export function PhaseLabView({ bundle }: PhaseLabViewProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<string>(
    "forecast_garch11"
  );
  const [comparatorStrategy, setComparatorStrategy] =
    useState<string>("equal_weight_5d");

  if (!bundle || bundle.status !== "verified") {
    return (
      <section
        data-testid="phase-lab-unavailable"
        className="ripple-card p-8 text-center"
      >
        <h2 className="text-[20px] font-bold text-text mb-2">
          Phase 3–6 Portfolio &amp; Stress Laboratory
        </h2>
        <p className="text-[16px] text-muted">
          Portfolio replay bundle is currently unavailable. Run{" "}
          <code className="font-mono text-[14px]">
            uv run ripple export-viewer
          </code>{" "}
          to export artifacts.
        </p>
      </section>
    );
  }

  const activeCurve = bundle.equity_curves[selectedStrategy] ?? [];
  const compCurve = bundle.equity_curves[comparatorStrategy] ?? [];
  const allEquities = [
    ...activeCurve.map((p) => p.equity),
    ...compCurve.map((p) => p.equity),
    10000,
  ];
  const minEq = Math.floor(Math.min(...allEquities) / 1000) * 1000;
  const maxEq = Math.ceil(Math.max(...allEquities) / 2000) * 2000;

  const svgW = 860;
  const svgH = 260;
  const padL = 62;
  const padR = 148;
  const padT = 20;
  const padB = 32;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const getX = (i: number, len: number) =>
    len <= 1 ? padL : padL + (i / (len - 1)) * plotW;
  const getY = (val: number) =>
    padT + plotH - ((val - minEq) / Math.max(1, maxEq - minEq)) * plotH;

  const buildPath = (pts: typeof activeCurve) =>
    pts
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${getX(i, pts.length).toFixed(1)} ${getY(
            p.equity
          ).toFixed(1)}`
      )
      .join(" ");

  const activePath = buildPath(activeCurve);
  const compPath = buildPath(compCurve);

  const modelKeys = Object.keys(bundle.forecast_metrics?.models ?? {});
  const worstStress = bundle.stress_summary?.worst_valid_scenario;
  const failureProfiles =
    bundle.stress_summary?.strategy_failure_profiles ?? {};
  const auditSamples =
    bundle.decision_audit_samples?.[selectedStrategy] ?? [];

  return (
    <div data-testid="phase-lab-view" className="space-y-10 ripple-enter">
      {/* Hero Question for Phase 3-6 Laboratory */}
      <section className="relative overflow-hidden rounded-2xl border border-border-subtle p-6 sm:p-10 bg-surface">
        <div
          aria-hidden="true"
          style={{ background: "var(--hero-glow)" }}
          className="pointer-events-none absolute inset-0"
        />
        <div className="relative z-10 max-w-prose">
          <div className="text-[12px] font-mono uppercase tracking-[0.08em] text-action font-semibold mb-2">
            PHASES 3–6 · 4-ETF VARIANCE FORECASTS, FIXED-POLICY REPLAY, STRESS &amp; FORWARD LEDGER
          </div>
          <h1 className="font-display text-[28px] sm:text-[36px] font-medium tracking-tight text-text leading-tight mb-3">
            Do five-session volatility forecasts improve portfolio decisions
            after identical trading costs?
          </h1>
          <p className="text-[16px] text-muted">
            Universe:{" "}
            <strong className="font-mono text-text">
              {bundle.source.universe.join(", ")}
            </strong>{" "}
            · Window:{" "}
            <span className="font-mono tabular-nums text-text">
              {bundle.source.window_start} to {bundle.source.window_end}
            </span>{" "}
            ({bundle.source.scheduled_decision_sessions} scheduled 5-session
            decisions) · Execution:{" "}
            <code className="font-mono text-[13px] text-text">
              {bundle.source.execution_convention}
            </code>{" "}
            at {bundle.source.fee_bps.toFixed(1)} bps per-side cost and{" "}
            {(bundle.source.max_weight * 100).toFixed(0)}% weight cap.
          </p>
        </div>
      </section>

      {/* Primary Finding Card for Phase 4B */}
      <section className="ripple-card p-6 sm:p-8">
        <div className="text-[14px] font-semibold text-action mb-2">
          Phase 4B Empirical Finding (2019–2026 · 389 scheduled rebalances)
        </div>
        <h2 className="text-[22px] sm:text-[26px] font-bold text-text mb-2">
          Inverse-volatility policies lower annualized volatility by ~260 bps
          (8.97% vs 11.63%) and raise Sharpe (1.01 vs 0.88), while supervised ML
          does not beat GARCH(1,1) or EWMA(0.94) after fees
        </h2>
        <p className="text-[16px] text-muted max-w-prose mb-4">
          <code className="font-mono text-[14px] text-text">
            forecast_garch11
          </code>{" "}
          ($19,531.43, Sharpe 1.01) and{" "}
          <code className="font-mono text-[14px] text-text">
            forecast_ewma094
          </code>{" "}
          ($19,516.36, Sharpe 1.00, lowest turnover 17.43 / $120.07 fees) lead
          forecast-driven strategies.{" "}
          <code className="font-mono text-[14px] text-text">
            forecast_random_forest
          </code>{" "}
          incurs 3.4× the turnover of EWMA ($402.32 in transaction costs), and{" "}
          <code className="font-mono text-[14px] text-text">
            forecast_ridge_extended
          </code>{" "}
          emits 39 negative variance forecasts across 33 decision sessions,
          triggering predeclared{" "}
          <code className="font-mono text-[14px] text-text">skip_retain</code>{" "}
          holds rather than silent clipping.
        </p>
        <p className="text-[14px] text-muted border-t border-border-subtle pt-3">
          Limitation: {bundle.limitations[0]}
        </p>
      </section>

      {/* Interactive Equity Curve Comparison Chart */}
      <section
        aria-label="Portfolio equity replay comparison"
        data-testid="lab-equity-chart"
        className="ripple-card p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-[20px] font-bold text-text">
              Net portfolio equity across 389 five-session decisions ($10,000
              initial virtual cash)
            </h3>
            <p className="text-[13px] text-muted">
              Select any forecast policy and baseline comparator. All strategies
              use identical next-open fills and 5.0 bps costs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[14px]">
            <label className="flex items-center gap-1.5">
              <span className="text-muted text-[12px] uppercase font-semibold">
                Policy (solid):
              </span>
              <select
                data-testid="lab-select-policy"
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
                className="min-h-[38px] rounded-lg border border-action bg-surface px-2.5 py-1 font-mono text-[13px] text-text cursor-pointer"
              >
                {Object.keys(bundle.equity_curves).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5">
              <span className="text-muted text-[12px] uppercase font-semibold">
                Baseline (dashed):
              </span>
              <select
                data-testid="lab-select-baseline"
                value={comparatorStrategy}
                onChange={(e) => setComparatorStrategy(e.target.value)}
                className="min-h-[38px] rounded-lg border border-border-strong bg-surface px-2.5 py-1 font-mono text-[13px] text-text cursor-pointer"
              >
                {Object.keys(bundle.equity_curves).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full h-auto select-none"
            role="img"
            aria-label={`Equity curve comparing ${selectedStrategy} against ${comparatorStrategy}`}
          >
            {[0, 0.5, 1].map((t) => {
              const v = Math.round(minEq + t * (maxEq - minEq));
              const y = getY(v);
              return (
                <g key={t}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={padL + plotW}
                    y2={y}
                    stroke="var(--border-subtle)"
                    strokeWidth="1"
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="12"
                    fill="var(--muted)"
                    className="font-mono tabular-nums"
                  >
                    ${v.toLocaleString()}
                  </text>
                </g>
              );
            })}

            {compPath && (
              <path
                d={compPath}
                fill="none"
                stroke="var(--comparison)"
                strokeWidth="2"
                strokeDasharray="6 5"
              />
            )}
            {activePath && (
              <path
                d={activePath}
                fill="none"
                stroke="var(--action)"
                strokeWidth="2.75"
              />
            )}

            {activeCurve.length > 0 && (
              <g
                transform={`translate(${padL + plotW + 8}, ${
                  getY(activeCurve[activeCurve.length - 1].equity) - 11
                })`}
              >
                <rect
                  x="0"
                  y="0"
                  width="136"
                  height="22"
                  rx="5"
                  fill="var(--action)"
                />
                <text
                  x="68"
                  y="15"
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--action-fg)"
                  className="font-mono tabular-nums"
                >
                  ${activeCurve[activeCurve.length - 1].equity.toLocaleString()}
                </text>
              </g>
            )}
          </svg>
        </div>
      </section>

      {/* Phase 4B Full Strategy Portfolio Utility Table */}
      <section
        aria-label="Phase 4B portfolio utility table"
        data-testid="lab-portfolio-table"
        className="ripple-card p-6 sm:p-8"
      >
        <h3 className="text-[20px] font-bold text-text mb-1">
          Phase 4B: Fixed-policy portfolio utility comparison (2019-02-13 to
          2026-11-04)
        </h3>
        <p className="text-[14px] text-muted mb-4">
          Every model maps positive daily variance forecasts{" "}
          <code className="font-mono text-[12px]">v_i</code> to{" "}
          <code className="font-mono text-[12px]">1 / sqrt(v_i)</code> capped at
          40.0%. Unconstrained models emitting negative variance forecasts trigger{" "}
          <code className="font-mono text-[12px]">skip_retain</code> and preserve
          prior holdings.
        </p>

        <div className="overflow-x-auto rounded-xl border border-border-subtle">
          <table className="w-full text-left text-[13px] font-mono">
            <thead className="bg-raised border-b border-border-subtle text-[11px] uppercase text-muted">
              <tr>
                <th className="py-2.5 px-3 font-sans">Strategy</th>
                <th className="py-2.5 px-3 text-right">Final Equity</th>
                <th className="py-2.5 px-3 text-right">Net Return</th>
                <th className="py-2.5 px-3 text-right">CAGR</th>
                <th className="py-2.5 px-3 text-right">Ann. Vol</th>
                <th className="py-2.5 px-3 text-right">Sharpe</th>
                <th className="py-2.5 px-3 text-right">Max DD</th>
                <th className="py-2.5 px-3 text-right">Turnover</th>
                <th className="py-2.5 px-3 text-right">Costs</th>
                <th className="py-2.5 px-3 text-right">Rebalances</th>
                <th className="py-2.5 px-3 text-right">Skipped</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {bundle.portfolio_metrics.map((row) => {
                const isSelected = row.strategy === selectedStrategy;
                return (
                  <tr
                    key={row.strategy}
                    onClick={() =>
                      bundle.equity_curves[row.strategy] &&
                      setSelectedStrategy(row.strategy)
                    }
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "bg-raised font-semibold" : "hover:bg-raised/50"
                    }`}
                  >
                    <td className="py-2.5 px-3 text-text">{row.strategy}</td>
                    <td className="py-2.5 px-3 text-right text-text">
                      ${row.final_equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-text">
                      {(row.net_return * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-text">
                      {(row.cagr * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-text">
                      {(row.annualized_volatility * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-text">
                      {row.sharpe.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-text">
                      {(row.max_drawdown * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted">
                      {row.turnover.toFixed(2)}×
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted">
                      ${row.total_costs.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-text">
                      {row.rebalance_count}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {row.skipped_decisions > 0 ? (
                        <span className="rounded-full bg-warn-tint border border-warn px-2 py-0.5 text-[11px] font-semibold text-text">
                          {row.skipped_decisions} skipped
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Phase 4A Five-Session Variance Forecast Accuracy + Decision Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section
          aria-label="Phase 4A forecast accuracy"
          data-testid="lab-forecast-table"
          className="ripple-card p-6 lg:col-span-7"
        >
          <h3 className="text-[18px] font-bold text-text mb-1">
            Phase 4A: Four-ETF 5-session variance forecast accuracy
          </h3>
          <p className="text-[13px] text-muted mb-4">
            Units: daily squared log-return variance proxy across{" "}
            <code className="font-mono text-[12px]">SPY, IEF, GLD, VNQ</code> (
            {bundle.forecast_metrics.common_decision_sessions} common decision
            sessions).
          </p>
          <div className="overflow-x-auto rounded-xl border border-border-subtle">
            <table className="w-full text-left text-[12px] font-mono">
              <thead className="bg-raised border-b border-border-subtle uppercase text-muted">
                <tr>
                  <th className="py-2 px-3">Model</th>
                  <th className="py-2 px-3 text-right">OK</th>
                  <th className="py-2 px-3 text-right">Invalid (≤0)</th>
                  <th className="py-2 px-3 text-right">Common MAE</th>
                  <th className="py-2 px-3 text-right">Common QLIKE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {modelKeys.map((m) => {
                  const info = bundle.forecast_metrics.models[m];
                  const invCount = info.status_counts?.invalid ?? 0;
                  return (
                    <tr key={m}>
                      <td className="py-2 px-3 font-semibold text-text">{m}</td>
                      <td className="py-2 px-3 text-right text-text">
                        {info.status_counts?.ok ?? 0}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {invCount > 0 ? (
                          <span className="rounded bg-leak-tint border border-leak px-1.5 py-0.5 text-text font-semibold">
                            {invCount} invalid
                          </span>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-text">
                        {info.common_dates_scored.mae.toFixed(8)}
                      </td>
                      <td className="py-2 px-3 text-right text-text">
                        {info.common_dates_scored.qlike.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Decision & Execution Timestamp Audit Sample */}
        <section
          aria-label="Decision timestamp audit"
          data-testid="lab-decision-audit"
          className="ripple-card p-6 lg:col-span-5"
        >
          <h3 className="text-[18px] font-bold text-text mb-1">
            Decision vs Execution Audit ({selectedStrategy})
          </h3>
          <p className="text-[13px] text-muted mb-4">
            Decisions commit after the completed bar; orders fill at the next
            supported <code className="font-mono text-[12px]">XNYS</code> open.
          </p>
          <div className="max-h-[270px] overflow-auto rounded-xl border border-border-subtle divide-y divide-border-subtle text-[12px] font-mono">
            {auditSamples.slice(0, 10).map((item, idx) => {
              const session = String(
                item.decision_session ?? item.session ?? idx
              );
              const action = String(item.action ?? "rebalance");
              const reason = item.reason ? String(item.reason) : null;
              return (
                <div key={`${session}-${idx}`} className="p-3 bg-surface">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text">
                      Decision: {session}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] border ${
                        action === "skip_retain"
                          ? "bg-warn-tint border-warn text-text font-semibold"
                          : "bg-ok-tint border-ok text-text"
                      }`}
                    >
                      {action}
                    </span>
                  </div>
                  {Boolean(item.as_of_utc) && (
                    <div className="text-muted text-[11px] mt-1">
                      Cutoff UTC: {String(item.as_of_utc)}
                    </div>
                  )}
                  {reason && (
                    <div className="text-leak text-[11px] mt-1 font-sans">
                      Reason: {reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Phase 5 Stress Explorer & Phase 6 Forward Decision Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section
          aria-label="Phase 5 stress fuzzer results"
          data-testid="lab-stress-section"
          className="ripple-card p-6 lg:col-span-6"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-[18px] font-bold text-text">
              Phase 5: Constrained block-bootstrap stress search
            </h3>
            <span className="rounded-full bg-ok-tint border border-ok px-2.5 py-0.5 text-[12px] font-mono text-text">
              15 valid · 3 borderline · 0 rejected
            </span>
          </div>
          <p className="text-[13px] text-muted mb-4">
            Worst screened relative failure scenario:{" "}
            <code className="font-mono text-text font-semibold">
              {worstStress?.scenario_id ?? "search_b5_s104"}
            </code>{" "}
            (block length {worstStress?.block_length ?? 5}, seed{" "}
            {worstStress?.seed ?? 104}). Failure case within this scenario
            family, never a prediction of market returns.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border-subtle">
            <table className="w-full text-left text-[12px] font-mono">
              <thead className="bg-raised border-b border-border-subtle uppercase text-muted">
                <tr>
                  <th className="py-2 px-3">Strategy</th>
                  <th className="py-2 px-3">Worst Valid Path</th>
                  <th className="py-2 px-3 text-right">Worst vs EW-5d</th>
                  <th className="py-2 px-3 text-right">Underperformed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {Object.entries(failureProfiles).map(([strat, prof]) => (
                  <tr key={strat}>
                    <td className="py-2 px-3 text-text font-semibold">
                      {strat}
                    </td>
                    <td className="py-2 px-3 text-muted">
                      {prof.worst_scenario_id}
                    </td>
                    <td className="py-2 px-3 text-right text-text">
                      {(prof.worst_relative_return_vs_ew5d * 100).toFixed(2)}%
                    </td>
                    <td className="py-2 px-3 text-right text-muted">
                      {prof.underperformed_ew5d_count} /{" "}
                      {prof.valid_scenario_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-label="Phase 6 prospective forward ledger"
          data-testid="lab-forward-ledger"
          className="ripple-card p-6 lg:col-span-6"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-[18px] font-bold text-text">
              Phase 6: Prospective hash-chained forward ledger
            </h3>
            <span className="rounded-full bg-ok-tint border border-ok px-2.5 py-0.5 text-[12px] font-mono text-text">
              {bundle.forward_ledger.verification.valid
                ? `Chain Verified (${bundle.forward_ledger.verification.record_count} events)`
                : "Unverified"}
            </span>
          </div>
          <p className="text-[13px] text-muted mb-4">
            Append-only JSONL ledger enforcing{" "}
            <code className="font-mono text-[12px]">
              run_scheduled → data_snapshot_ready → prediction_generated →
              decision_committed
            </code>{" "}
            before any realized outcome is appended.
          </p>
          <div className="max-h-[240px] overflow-auto rounded-xl border border-border-subtle divide-y divide-border-subtle text-[12px] font-mono">
            {bundle.forward_ledger.records.map((rec) => (
              <div key={rec.sequence_no} className="p-3 bg-surface">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text">
                    #{rec.sequence_no} · {rec.event_type} ({rec.model_id})
                  </span>
                  <span className="text-ok font-semibold">{rec.status}</span>
                </div>
                <div className="text-[11px] text-muted mt-1 break-all">
                  record_hash: {rec.record_hash.slice(0, 28)}… (prev:{" "}
                  {rec.prev_record_hash.slice(0, 12)}…)
                </div>
                {rec.proposed_weights && (
                  <div className="text-[11px] text-text mt-1">
                    Proposed weights:{" "}
                    {Object.entries(rec.proposed_weights)
                      .map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
