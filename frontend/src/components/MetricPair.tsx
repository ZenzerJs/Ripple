"use client";

import React from "react";
import { MetricComparisonPair, ScopeType } from "@/lib/schema";

interface MetricPairProps {
  pair: MetricComparisonPair;
  scope: ScopeType;
}

export function MetricPair({ pair, scope }: MetricPairProps) {
  const isAvailable =
    pair.originalValue !== null &&
    pair.correctedValue !== null &&
    pair.deltaPp !== null;

  return (
    <div
      data-testid={`metric-pair-${pair.metric}`}
      className="ripple-card p-6 flex flex-col justify-between"
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-[16px] font-semibold text-text">{pair.label}</h3>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-mono border ${
            pair.reconciled
              ? "bg-ok-tint border-ok text-text"
              : "bg-warn-tint border-warn text-text"
          }`}
        >
          {pair.reconciled ? "Reconciled" : "Check precision"}
        </span>
      </div>

      {!isAvailable ? (
        <div
          data-testid={`metric-unavailable-${pair.metric}`}
          className="rounded-lg border border-warn bg-warn-tint p-4 text-[14px] text-text"
        >
          <p className="font-semibold">unavailable</p>
          <p className="text-muted text-[14px] mt-1">
            {pair.unavailableReason ??
              "Metric unavailable for the selected combination."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 items-baseline mb-4">
            <div>
              <div className="text-[12px] uppercase tracking-wider text-muted mb-1 flex items-center gap-1.5">
                <span
                  className="inline-block w-3 border-b-2 border-dashed border-comparison"
                  aria-hidden="true"
                />
                Original
              </div>
              <div
                data-testid={`metric-${pair.metric}-original`}
                className="text-[24px] sm:text-[28px] font-bold font-mono tabular-nums text-text"
              >
                {pair.originalValue!.toFixed(2)}
                <span className="text-[16px] font-normal text-muted ml-0.5">
                  {pair.unit}
                </span>
              </div>
              <div className="text-[12px] font-mono text-muted tabular-nums">
                {pair.originalFolds} folds
              </div>
            </div>

            <div>
              <div className="text-[12px] uppercase tracking-wider text-action font-semibold mb-1 flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-0.5 bg-action"
                  aria-hidden="true"
                />
                Corrected
              </div>
              <div
                data-testid={`metric-${pair.metric}-corrected`}
                className="text-[24px] sm:text-[28px] font-bold font-mono tabular-nums text-text"
              >
                {pair.correctedValue!.toFixed(2)}
                <span className="text-[16px] font-normal text-muted ml-0.5">
                  {pair.unit}
                </span>
              </div>
              <div className="text-[12px] font-mono text-muted tabular-nums">
                {pair.correctedFolds} folds
              </div>
            </div>

            <div>
              <div className="text-[12px] uppercase tracking-wider text-muted mb-1">
                Difference
              </div>
              <div
                data-testid={`metric-${pair.metric}-delta`}
                className="text-[20px] sm:text-[24px] font-semibold font-mono tabular-nums text-text"
              >
                {pair.deltaPp! > 0
                  ? `+${pair.deltaPp!.toFixed(2)}`
                  : pair.deltaPp!.toFixed(2)}
                <span className="text-[14px] font-normal text-muted ml-1">
                  pp
                </span>
              </div>
              <div className="text-[12px] text-muted">
                {Math.abs(pair.deltaPp!) < 0.005
                  ? "No change"
                  : pair.deltaPp! > 0
                  ? "Errors rose"
                  : "Errors fell"}
              </div>
            </div>
          </div>

          <div className="border-t border-border-subtle pt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] font-mono text-muted">
            <span>
              Scope:{" "}
              <strong className="text-text">
                {scope === "common_dates" ? "common_dates" : "all_folds"}
              </strong>
            </span>
            <span data-testid={`metric-${pair.metric}-dropped`}>
              Dates dropped by fix:{" "}
              <strong className="text-text tabular-nums">
                {pair.droppedFoldsCount}
              </strong>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
