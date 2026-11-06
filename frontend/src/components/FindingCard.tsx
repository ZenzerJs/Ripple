"use client";

import React from "react";
import { ComparisonViewData, formatModelName } from "@/lib/schema";

interface FindingCardProps {
  view: ComparisonViewData;
  ticker: string;
  limitations: string[];
  onExploreComparison: () => void;
  onReadMethod: () => void;
  onOpenPhaseLab: () => void;
}

export function FindingCard({
  view,
  ticker,
  limitations,
  onExploreComparison,
  onReadMethod,
  onOpenPhaseLab,
}: FindingCardProps) {
  const secondaryLimitation =
    limitations[1] ??
    "Adjusted historical closes can be retrospectively revised and are not a true institutional point-in-time vintage.";

  return (
    <div className="space-y-6">
      {/* Primary Finding Card matching mockup */}
      <section
        aria-labelledby="primary-finding-eyebrow"
        data-testid="finding-card"
        className="ripple-card p-6 sm:p-8 lg:p-10"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span
            id="primary-finding-eyebrow"
            className="text-[14px] font-semibold text-action"
          >
            Primary finding
          </span>
          <span className="text-[12px] font-mono text-muted">
            {ticker} · {formatModelName(view.model)} · {view.horizon}-month horizon (
            {view.scope === "common_dates" ? "common dates" : "all folds"})
          </span>
        </div>

        {/* Live region that updates when the selector changes */}
        <div aria-live="polite" aria-atomic="true">
          <h2
            data-testid="finding-headline"
            className="text-[24px] sm:text-[28px] font-bold tracking-tight text-text leading-snug mb-2 tabular-nums"
          >
            {view.findingHeadline}
          </h2>
          <p
            data-testid="finding-subline"
            className="text-[18px] sm:text-[20px] text-muted tabular-nums mb-6"
          >
            {view.findingSubline}
          </p>
        </div>

        {/* Primary and Secondary Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <button
            type="button"
            data-testid="cta-explore-comparison"
            onClick={onExploreComparison}
            className="ripple-btn ripple-btn-primary rounded-lg px-5 py-2.5 text-[16px]"
          >
            Explore the comparison
          </button>
          <button
            type="button"
            data-testid="cta-read-method"
            onClick={onReadMethod}
            className="ripple-btn ripple-btn-secondary rounded-lg px-5 py-2.5 text-[16px]"
          >
            Read the method
          </button>
        </div>

        {/* Limitation line directly under the finding, never behind a click */}
        <p
          data-testid="finding-limitation"
          className="text-[14px] text-muted max-w-prose border-t border-border-subtle/70 pt-4"
        >
          Overlapping targets make errors correlated. No significance is claimed.{" "}
          <span className="text-muted/90">{secondaryLimitation}</span>
        </p>

        {/* Compact MAE & RMSE summary strip so Overview follows: question -> finding -> limitation -> metrics -> chart */}
        {view.maePair.originalValue !== null &&
          view.maePair.correctedValue !== null &&
          view.rmsePair.originalValue !== null &&
          view.rmsePair.correctedValue !== null && (
            <div
              data-testid="overview-metrics-strip"
              className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-border-subtle/60 text-[13px] font-mono tabular-nums"
            >
              <div className="rounded-lg bg-raised/50 border border-border-subtle px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="font-sans font-medium text-muted">
                  {view.horizon}m MAE ({view.maePair.correctedFolds} folds)
                </span>
                <span className="text-text font-semibold">
                  {view.maePair.originalValue.toFixed(2)}% →{" "}
                  <span className="text-action">
                    {view.maePair.correctedValue.toFixed(2)}%
                  </span>{" "}
                  (
                  {view.maePair.deltaPp! > 0
                    ? `+${view.maePair.deltaPp!.toFixed(2)}`
                    : view.maePair.deltaPp!.toFixed(2)}{" "}
                  pp)
                </span>
              </div>
              <div className="rounded-lg bg-raised/50 border border-border-subtle px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="font-sans font-medium text-muted">
                  {view.horizon}m RMSE ({view.rmsePair.correctedFolds} folds)
                </span>
                <span className="text-text font-semibold">
                  {view.rmsePair.originalValue.toFixed(2)}% →{" "}
                  <span className="text-action">
                    {view.rmsePair.correctedValue.toFixed(2)}%
                  </span>{" "}
                  (
                  {view.rmsePair.deltaPp! > 0
                    ? `+${view.rmsePair.deltaPp!.toFixed(2)}`
                    : view.rmsePair.deltaPp!.toFixed(2)}{" "}
                  pp)
                </span>
              </div>
            </div>
          )}
      </section>

      {/* Contribution Card: what was built and what was corrected, in three short lines */}
      <section
        aria-label="Engineering contribution summary"
        data-testid="contribution-card"
        className="ripple-card p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="text-[16px] font-semibold text-text">
            What was built and what was corrected
          </h3>
          <button
            type="button"
            data-testid="cta-open-phase-lab"
            onClick={onOpenPhaseLab}
            className="text-[14px] font-medium text-action hover:underline cursor-pointer"
          >
            Inspect Phases 3–6 Volatility &amp; Portfolio Replay Lab →
          </button>
        </div>
        <ul className="space-y-2.5 text-[16px] text-text max-w-prose list-disc pl-5">
          <li>
            <strong>Temporal cutoff enforcement:</strong> Training rows at forecast date{" "}
            <code className="font-mono text-[14px]">T</code> now require{" "}
            <code className="font-mono text-[14px]">
              latest_label_available &lt;= T
            </code>
            , removing the{" "}
            <span className="tabular-nums font-medium">
              {view.horizon} unmatured rows
            </span>{" "}
            that leaked future realization prices into the original fit.
          </li>
          <li>
            <strong>Train-only preprocessing &amp; explicit fold states:</strong> Feature
            scalers fit strictly inside each fold&apos;s matured window, and early dates with
            fewer than 24 matured labels emit{" "}
            <code className="font-mono text-[14px]">
              skipped_insufficient_labels
            </code>{" "}
            instead of silently dropping or backfilling.
          </li>
          <li>
            <strong>Fixed-policy portfolio &amp; stress laboratory (Phases 3–6):</strong>{" "}
            Extends point-in-time discipline to four-ETF 5-session variance forecasts (
            <code className="font-mono text-[14px]">SPY, IEF, GLD, VNQ</code>),{" "}
            next-open execution with 5.0 bps costs, synchronized block-bootstrap stress
            screening, and a hash-chained forward decision ledger.
          </li>
        </ul>
      </section>
    </div>
  );
}
