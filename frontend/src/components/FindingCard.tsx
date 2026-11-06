"use client";

import React from "react";
import { ComparisonViewData, formatModelName } from "@/lib/schema";

interface FindingCardProps {
  view: ComparisonViewData;
  ticker: string;
  limitations: string[];
  onExploreComparison: () => void;
  onReadMethod: () => void;
}

export function FindingCard({
  view,
  ticker,
  limitations,
  onExploreComparison,
  onReadMethod,
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
            {ticker} · {formatModelName(view.model)} · {view.horizon}-month
            horizon (
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
          Overlapping targets make errors correlated. No significance is
          claimed.{" "}
        </p>

        <p
          data-testid="experiment-scope"
          className="text-[14px] text-muted mt-3"
        >
          Controlled reimplementation, not an execution audit of ML Stock
          Simulator. Both variants exclude the forecast row; the unpurged
          reference retains immature prior labels.
        </p>
        <p className="text-[14px] text-muted mt-3">{secondaryLimitation}</p>

        <p className="text-[12px] text-muted mt-2">Differences use unrounded fold errors.</p>

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
    </div>
  );
}
