"use client";

import React, { useState } from "react";
import { AlignedDateRow, formatFoldStateBadge } from "@/lib/schema";

interface DataTableProps {
  rows: AlignedDateRow[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  horizon: number;
  model: string;
}

type SortKey = "date" | "orig_err" | "corr_err" | "delta";

export function DataTable({
  rows,
  selectedDate,
  onSelectDate,
  horizon,
  model,
}: DataTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [filterState, setFilterState] = useState<"all" | "skipped">("all");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "date");
    }
  };

  const filteredRows =
    filterState === "skipped"
      ? rows.filter((r) => r.corrected?.state !== "ok")
      : rows;

  const sortedRows = [...filteredRows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "date") {
      cmp = a.forecast_date.localeCompare(b.forecast_date);
    } else if (sortKey === "orig_err") {
      cmp = (a.original_error_pct ?? -1) - (b.original_error_pct ?? -1);
    } else if (sortKey === "corr_err") {
      cmp = (a.corrected_error_pct ?? -1) - (b.corrected_error_pct ?? -1);
    } else {
      cmp = (a.delta_error_pp ?? -999) - (b.delta_error_pp ?? -999);
    }
    return sortAsc ? cmp : -cmp;
  });

  const nonOkCount = rows.filter((r) => r.corrected?.state !== "ok").length;

  return (
    <section
      aria-label="Per-fold forecast error data table"
      data-testid="data-table-section"
      className="ripple-card p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-[20px] font-bold text-text">
            Per-date forecast fold table
          </h3>
          <p className="text-[14px] text-muted mt-0.5">
            Every fold date is preserved. Skipped, failed, or unavailable folds
            display <code className="font-mono text-[12px]">unavailable</code>{" "}
            with the explicit reason in text ({nonOkCount} non-OK folds in this
            series).
          </p>
        </div>

        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            data-testid="table-filter-all"
            aria-pressed={filterState === "all"}
            onClick={() => setFilterState("all")}
            className={`ripple-btn rounded-lg px-3 py-1.5 text-[12px] min-h-[38px] border ${
              filterState === "all"
                ? "bg-action text-action-fg border-action font-semibold"
                : "bg-surface text-text border-border-strong hover:bg-raised"
            }`}
          >
            All folds ({rows.length})
          </button>
          <button
            type="button"
            data-testid="table-filter-skipped"
            aria-pressed={filterState === "skipped"}
            onClick={() => setFilterState("skipped")}
            className={`ripple-btn rounded-lg px-3 py-1.5 text-[12px] min-h-[38px] border ${
              filterState === "skipped"
                ? "bg-action text-action-fg border-action font-semibold"
                : "bg-surface text-text border-border-strong hover:bg-raised"
            }`}
          >
            Skipped / non-OK ({nonOkCount})
          </button>
        </div>
      </div>

      {/* Scrollable table container for narrow screens */}
      <div className="max-h-[460px] overflow-auto rounded-xl border border-border-subtle">
        <table
          data-testid="fold-data-table"
          className="w-full border-collapse text-left text-[14px]"
        >
          <thead className="sticky top-0 z-10 bg-raised border-b border-border-subtle text-[12px] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="py-3 px-4">
                <button
                  type="button"
                  onClick={() => handleSort("date")}
                  className="inline-flex items-center gap-1 font-semibold text-text cursor-pointer hover:underline"
                >
                  Forecast Date{" "}
                  {sortKey === "date" ? (sortAsc ? "↑" : "↓") : ""}
                </button>
              </th>
              <th scope="col" className="py-3 px-4 text-right">
                Actual ({horizon}m %)
              </th>
              <th scope="col" className="py-3 px-4 text-right">
                Original Pred (%)
              </th>
              <th scope="col" className="py-3 px-4 text-right">
                Corrected Pred (%)
              </th>
              <th scope="col" className="py-3 px-4 text-right">
                <button
                  type="button"
                  onClick={() => handleSort("orig_err")}
                  className="inline-flex items-center gap-1 font-semibold text-text cursor-pointer hover:underline"
                >
                  Orig Error (%){" "}
                  {sortKey === "orig_err" ? (sortAsc ? "↑" : "↓") : ""}
                </button>
              </th>
              <th scope="col" className="py-3 px-4 text-right">
                <button
                  type="button"
                  onClick={() => handleSort("corr_err")}
                  className="inline-flex items-center gap-1 font-semibold text-text cursor-pointer hover:underline"
                >
                  Corr Error (%){" "}
                  {sortKey === "corr_err" ? (sortAsc ? "↑" : "↓") : ""}
                </button>
              </th>
              <th scope="col" className="py-3 px-4 text-right">
                <button
                  type="button"
                  onClick={() => handleSort("delta")}
                  className="inline-flex items-center gap-1 font-semibold text-text cursor-pointer hover:underline"
                >
                  Diff (pp) {sortKey === "delta" ? (sortAsc ? "↑" : "↓") : ""}
                </button>
              </th>
              <th scope="col" className="py-3 px-4">
                Fold State &amp; Reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/70 font-mono text-[14px]">
            {sortedRows.map((r, idx) => {
              const isSelected = r.forecast_date === selectedDate;
              const corrState = r.corrected?.state ?? "unavailable";
              const badge = formatFoldStateBadge(corrState);
              const reasonText =
                r.corrected?.state_reason ??
                (corrState === "skipped_insufficient_labels"
                  ? "Skipped: too few matured labels"
                  : null);

              return (
                <tr
                  key={`${r.forecast_date}-${model}-${horizon}`}
                  tabIndex={0}
                  role="button"
                  aria-selected={isSelected}
                  data-testid={`table-row-${r.forecast_date}`}
                  style={
                    {
                      "--stagger-idx": Math.min(idx, 10),
                    } as React.CSSProperties
                  }
                  onClick={() => onSelectDate(r.forecast_date)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectDate(r.forecast_date);
                    }
                  }}
                  className={`ripple-stagger-row cursor-pointer transition-colors duration-150 ${
                    isSelected
                      ? "bg-raised font-semibold"
                      : "hover:bg-raised/60"
                  }`}
                >
                  <td className="py-3 px-4 whitespace-nowrap text-text">
                    <span className="inline-flex items-center gap-2">
                      {isSelected && (
                        <span
                          className="h-2 w-2 rounded-full bg-action"
                          aria-hidden="true"
                        />
                      )}
                      {r.forecast_date}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap text-text">
                    {r.actual_pct !== null ? `${r.actual_pct.toFixed(2)}%` : "unavailable"}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap text-muted">
                    {r.original?.state === "ok" &&
                    r.original.prediction_pct !== null
                      ? `${r.original.prediction_pct.toFixed(2)}%`
                      : "unavailable"}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap text-text">
                    {r.corrected?.state === "ok" &&
                    r.corrected.prediction_pct !== null
                      ? `${r.corrected.prediction_pct.toFixed(2)}%`
                      : "unavailable"}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap text-muted">
                    {r.original_error_pct !== null
                      ? `${r.original_error_pct.toFixed(2)}%`
                      : "unavailable"}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap text-text">
                    {r.corrected_error_pct !== null
                      ? `${r.corrected_error_pct.toFixed(2)}%`
                      : "unavailable"}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap text-text">
                    {r.delta_error_pp !== null
                      ? `${
                          r.delta_error_pp > 0 ? "+" : ""
                        }${r.delta_error_pp.toFixed(2)} pp`
                      : "unavailable"}
                  </td>
                  <td className="py-3 px-4 font-sans text-[12px]">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium border ${
                          badge.tone === "ok"
                            ? "bg-ok-tint border-ok text-text"
                            : badge.tone === "leak"
                            ? "bg-leak-tint border-leak text-text"
                            : "bg-warn-tint border-warn text-text"
                        }`}
                      >
                        {badge.label}
                      </span>
                      {reasonText && (
                        <span className="text-[12px] text-muted">
                          {reasonText}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
