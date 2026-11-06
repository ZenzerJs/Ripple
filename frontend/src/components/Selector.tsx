"use client";

import React from "react";
import { ScopeType, formatModelName } from "@/lib/schema";

interface SelectorProps {
  horizon: number;
  onChangeHorizon: (h: number) => void;
  model: string;
  availableModels: string[];
  onChangeModel: (m: string) => void;
  scope: ScopeType;
  onChangeScope: (s: ScopeType) => void;
  viewMode: "both" | "chart" | "table";
  onChangeViewMode: (v: "both" | "chart" | "table") => void;
  droppedCount: number;
}

export function Selector({
  horizon,
  onChangeHorizon,
  model,
  availableModels,
  onChangeModel,
  scope,
  onChangeScope,
  viewMode,
  onChangeViewMode,
  droppedCount,
}: SelectorProps) {
  return (
    <section
      aria-label="Comparison controls"
      data-testid="comparison-selector"
      className="ripple-card p-4 sm:p-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
        {/* Horizon toggle (6m, 12m, plus disabled 24m with explicit reason per spec) */}
        <div className="lg:col-span-4">
          <span className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">
            Forecast horizon
          </span>
          <div
            role="group"
            aria-label="Forecast horizon selector"
            className="inline-flex flex-wrap gap-1.5"
          >
            {[6, 12].map((h) => {
              const active = horizon === h;
              return (
                <button
                  key={h}
                  type="button"
                  data-testid={`horizon-${h}`}
                  aria-pressed={active}
                  onClick={() => onChangeHorizon(h)}
                  className={`ripple-btn rounded-lg px-3.5 py-2 text-[14px] border ${
                    active
                      ? "bg-action text-action-fg border-action font-semibold"
                      : "bg-surface text-text border-border-strong hover:bg-raised"
                  }`}
                >
                  {h} months
                </button>
              );
            })}
            <button
              type="button"
              disabled
              data-testid="horizon-24-disabled"
              aria-disabled="true"
              title="Unavailable: 24-month horizon leaves fewer than 24 matured training folds in the 2016–2026 window"
              className="min-h-[44px] rounded-lg px-3 py-2 text-[12px] border border-border-subtle bg-raised/50 text-muted cursor-not-allowed opacity-75"
            >
              24m (Unavailable: sample too short)
            </button>
          </div>
        </div>

        {/* Model toggle */}
        <div className="lg:col-span-4">
          <span className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">
            Model family
          </span>
          <div
            role="group"
            aria-label="Model selector"
            className="inline-flex flex-wrap gap-1.5"
          >
            {availableModels.map((m) => {
              const active = model === m;
              return (
                <button
                  key={m}
                  type="button"
                  data-testid={`model-${m}`}
                  aria-pressed={active}
                  onClick={() => onChangeModel(m)}
                  className={`ripple-btn rounded-lg px-3.5 py-2 text-[14px] border ${
                    active
                      ? "bg-action text-action-fg border-action font-semibold"
                      : "bg-surface text-text border-border-strong hover:bg-raised"
                  }`}
                >
                  {formatModelName(m)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scope toggle: common_dates vs all_folds */}
        <div className="lg:col-span-4">
          <span className="block text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">
            Evaluation scope ({droppedCount} dates dropped by fix)
          </span>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Evaluation scope selector"
              className="inline-flex gap-1.5"
            >
              <button
                type="button"
                data-testid="scope-common_dates"
                aria-pressed={scope === "common_dates"}
                onClick={() => onChangeScope("common_dates")}
                className={`ripple-btn rounded-lg px-3 py-2 text-[14px] border ${
                  scope === "common_dates"
                    ? "bg-action text-action-fg border-action font-semibold"
                    : "bg-surface text-text border-border-strong hover:bg-raised"
                }`}
              >
                Common dates
              </button>
              <button
                type="button"
                data-testid="scope-all_folds"
                aria-pressed={scope === "all_folds"}
                onClick={() => onChangeScope("all_folds")}
                className={`ripple-btn rounded-lg px-3 py-2 text-[14px] border ${
                  scope === "all_folds"
                    ? "bg-action text-action-fg border-action font-semibold"
                    : "bg-surface text-text border-border-strong hover:bg-raised"
                }`}
              >
                All folds
              </button>
            </div>

            <div
              role="group"
              aria-label="Display mode"
              className="inline-flex gap-1"
            >
              {(["both", "table"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-testid={`viewmode-${mode}`}
                  aria-pressed={viewMode === mode}
                  onClick={() => onChangeViewMode(mode)}
                  className={`ripple-btn rounded-lg px-2.5 py-1.5 text-[12px] border ${
                    viewMode === mode
                      ? "bg-raised text-text border-action font-semibold"
                      : "bg-surface text-muted border-border-subtle hover:text-text"
                  }`}
                >
                  {mode === "both" ? "Chart + Table" : "Table only"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
