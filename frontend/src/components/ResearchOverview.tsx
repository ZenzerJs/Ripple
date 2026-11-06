"use client";
import React from "react";
import { PortfolioReplayBundle } from "@/lib/schema";

export interface ResearchOverviewProps {
  bundle: PortfolioReplayBundle | null;
  onExplorePortfolio: () => void;
  onExploreLabels: () => void;
}
export function ResearchOverview({
  bundle,
  onExplorePortfolio,
  onExploreLabels,
}: ResearchOverviewProps) {
  const data = bundle?.status === "verified" ? bundle : null;
  const rf = data?.portfolio_metrics.find(
    (row) => row.strategy === "forecast_random_forest",
  );
  const ewma = data?.portfolio_metrics.find(
    (row) => row.strategy === "forecast_ewma094",
  );
  const curves = [
    data?.equity_curves.forecast_random_forest ?? [],
    data?.equity_curves.forecast_ewma094 ?? [],
  ];
  const values = curves.flat().map((point) => point.equity);
  const min = Math.min(...values, 10000),
    max = Math.max(...values, 10000);
  const path = (points: (typeof curves)[number]) =>
    points
      .map(
        (point, i) =>
          `${i ? "L" : "M"} ${(75 + (points.length > 1 ? i / (points.length - 1) : 0) * 500).toFixed(1)} ${(145 - ((point.equity - min) / Math.max(1, max - min)) * 120).toFixed(1)}`,
      )
      .join(" ");
  const money = (value: number) =>
    `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div
      data-testid="screen-overview"
      className="research-overview space-y-12 ripple-enter"
    >
      <section className="overview-hero">
        <div className="overview-hero-copy">
          <p className="text-sm font-mono uppercase tracking-wider text-action">
            Ripple · Research lab
          </p>
          <h1 className="font-display overview-title">
            Follow the forecast.
            <br />
            <em>Find the failure.</em>
          </h1>
          <p className="overview-descriptor">
            A research lab for financial ML under pressure.
          </p>
          <p className="text-muted max-w-prose mt-4">
            Trace a forecast from model output to portfolio decision, then
            inspect where the evidence holds up—and where it does not.
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <button
              type="button"
              data-testid="cta-explore-portfolio"
              onClick={onExplorePortfolio}
              className="overview-primary min-h-[44px] px-5 py-3 rounded-lg font-semibold"
            >
              Explore portfolio research <span aria-hidden="true">↗</span>
            </button>
            <button
              type="button"
              data-testid="cta-explore-labels"
              onClick={onExploreLabels}
              className="overview-secondary min-h-[44px] px-5 py-3 rounded-lg font-semibold"
            >
              Inspect label maturity <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <div className="overview-instrument">
          <div className="ripple-field" aria-hidden="true">
            {/* Decorative vector artwork; the research process is described below. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="ripple-field-light"
              src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/art/ripple-field-light.svg`}
              width="720" height="520" alt=""
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="ripple-field-dark"
              src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/art/ripple-field-dark.svg`}
              width="720" height="520" alt=""
            />
          </div>
          <ol className="research-process" aria-label="Research process">
            {[
              ["Forecast", "Estimate market risk"],
              ["Allocation", "Translate risk into weights"],
              ["Replay", "Apply timing and trading costs"],
              ["Stress", "Inspect relative failures"],
            ].map(([title, detail], index) => (
              <li key={title}>
                <span className="process-step" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="overview-evidence">
        <div>
          <p className="text-sm font-mono uppercase text-action">
            A result worth investigating
          </p>
          <h2 className="font-display text-3xl mt-3">
            {rf && ewma
              ? "A more complex forecast did not translate into a better replay."
              : "Open the research evidence."}
          </h2>
          <p className="text-muted mt-4">
            {rf && ewma ? (
              <>
                In this fixed-policy replay, random forest finished at{" "}
                <strong className="text-text">{money(rf.final_equity)}</strong>{" "}
                versus{" "}
                <strong className="text-text">
                  {money(ewma.final_equity)}
                </strong>{" "}
                for EWMA, with {money(rf.total_costs)} versus{" "}
                {money(ewma.total_costs)} in trading costs.
              </>
            ) : (
              "The replay compares supervised forecasts with simpler volatility baselines after trading costs."
            )}{" "}
            This is an exploratory result for the specified universe, period,
            and policy—not a general ranking of models.
          </p>
          <button
            type="button"
            onClick={onExplorePortfolio}
            className="min-h-[44px] mt-4 font-semibold text-action"
          >
            Explore the comparison →
          </button>
        </div>
        <div className="overview-evidence-chart">
          {rf && ewma && (
            <table
              className="overview-phone-comparison"
              aria-label="Portfolio comparison in US dollars"
            >
              <caption>Portfolio outcomes · USD</caption>
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Final equity</th>
                  <th>Costs</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Random forest</th>
                  <td>{money(rf.final_equity)}</td>
                  <td>{money(rf.total_costs)}</td>
                </tr>
                <tr>
                  <th>EWMA</th>
                  <td>{money(ewma.final_equity)}</td>
                  <td>{money(ewma.total_costs)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {curves.every((curve) => curve.length > 0) ? (
            <>
              <svg
                className="overview-equity-plot"
                viewBox="0 0 600 180"
                role="img"
                aria-label="Net equity paths for random forest and EWMA in the historical replay"
              >
                <g fill="var(--muted)" fontSize="11" fontFamily="var(--font-mono)">
                  <text x="68" y="29" textAnchor="end">
                    ${Math.round(max).toLocaleString()}
                  </text>
                  <text x="68" y="149" textAnchor="end">
                    ${Math.round(min).toLocaleString()}
                  </text>
                  <text x="75" y="171">
                    {curves[0][0].session}
                  </text>
                  <text x="575" y="171" textAnchor="end">
                    {curves[0][curves[0].length - 1].session}
                  </text>
                </g>
                <path
                  d={path(curves[1])}
                  fill="none"
                  stroke="var(--comparison)"
                  strokeWidth="2"
                  strokeDasharray="7 5"
                />
                <path
                  d={path(curves[0])}
                  fill="none"
                  stroke="var(--action)"
                  strokeWidth="2.5"
                />
              </svg>
              <p className="overview-equity-legend text-sm text-muted">
                <span className="text-action">━</span> Random forest &nbsp;{" "}
                <span>┄</span> EWMA · net equity (USD)
              </p>
              <p className="text-sm text-muted">
                Source window: {data?.source.window_start} to{" "}
                {data?.source.window_end}
              </p>
            </>
          ) : (
            <p className="text-muted">
              Equity paths are unavailable until the verified replay bundle is
              loaded.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
