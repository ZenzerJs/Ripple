"use client";

import React, { useId, useRef, useState } from "react";
import {
  AlignedDateRow,
  MetricComparisonPair,
  ScopeType,
  formatFoldStateBadge,
  formatModelName,
} from "@/lib/schema";

interface ErrorChartProps {
  rows: AlignedDateRow[];
  maePair: MetricComparisonPair;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onInspectFoldDetail?: (date: string) => void;
  onSwitchToTable?: () => void;
  chartSummarySentence: string;
  ticker: string;
  horizon: number;
  model: string;
  scope: ScopeType;
  windowStart?: string;
  windowEnd?: string;
  compact?: boolean;
}

export function ErrorChart({
  rows,
  maePair,
  selectedDate,
  onSelectDate,
  onInspectFoldDetail,
  onSwitchToTable,
  chartSummarySentence,
  ticker,
  horizon,
  model,
  scope,
  windowStart,
  windowEnd,
  compact = false,
}: ErrorChartProps) {
  const gradId = useId().replace(/:/g, "");
  const pointRefs = useRef<Array<SVGGElement | null>>([]);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const plotRows =
    scope === "common_dates" ? rows.filter((r) => r.is_common_ok) : rows;

  if (plotRows.length === 0) {
    return (
      <section
        aria-label="Forecast error chart (empty)"
        data-testid="error-chart-empty"
        className="ripple-card p-6 sm:p-8"
      >
        <h3 className="text-[20px] font-bold text-text mb-2">
          Forecast error across {scope === "common_dates" ? "common dates" : "all folds"}
        </h3>
        <p className="text-[16px] text-muted">
          No valid forecast error points available for this selection.
        </p>
      </section>
    );
  }

  const allErrValues: number[] = [];
  for (const r of plotRows) {
    if (r.original_error_pct !== null) allErrValues.push(r.original_error_pct);
    if (r.corrected_error_pct !== null) allErrValues.push(r.corrected_error_pct);
  }
  const rawMax = allErrValues.length > 0 ? Math.max(...allErrValues) : 10;
  // Start Y-axis strictly at 0% per spec rule: "Charts start y-axes at zero for error magnitudes, show units on the axis, and use light gridlines."
  const yMax = Math.max(8, Math.ceil(rawMax / 5) * 5);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * yMax));

  const svgWidth = 860;
  const svgHeight = compact ? 250 : 300;
  const padLeft = 48;
  const padRight = 152; // Room for direct series labels at right edge matching mockup
  const padTop = 20;
  const padBottom = 34;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const getX = (i: number) =>
    plotRows.length <= 1
      ? padLeft + plotW / 2
      : padLeft + (i / (plotRows.length - 1)) * plotW;
  const getY = (val: number) =>
    padTop + plotH - Math.min(1, Math.max(0, val / yMax)) * plotH;

  // Build SVG paths that break cleanly (M) across null/failed/unavailable folds
  const origPoints: Array<{ x: number; y: number; idx: number; row: AlignedDateRow }> = [];
  const corrPoints: Array<{ x: number; y: number; idx: number; row: AlignedDateRow }> = [];

  plotRows.forEach((r, idx) => {
    const x = getX(idx);
    if (r.original_error_pct !== null) {
      origPoints.push({ x, y: getY(r.original_error_pct), idx, row: r });
    }
    if (r.corrected_error_pct !== null) {
      corrPoints.push({ x, y: getY(r.corrected_error_pct), idx, row: r });
    }
  });

  const toSegmentedPath = (
    pts: Array<{ x: number; y: number; idx: number }>
  ) => {
    if (pts.length === 0) return "";
    return pts
      .map((p, i) => {
        const isContiguous = i > 0 && p.idx === pts[i - 1].idx + 1;
        return `${isContiguous ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join(" ");
  };

  const origPath = toSegmentedPath(origPoints);
  const corrPath = toSegmentedPath(corrPoints);
  // Build area path only across contiguous segments
  const buildAreaPath = (pts: Array<{ x: number; y: number; idx: number }>) => {
    if (pts.length < 2) return "";
    const segments: Array<Array<{ x: number; y: number }>> = [];
    for (const p of pts) {
      const curSeg = segments[segments.length - 1];
      if (!curSeg || p.idx !== (curSeg[curSeg.length - 1] as { idx?: number }).idx! + 1) {
        segments.push([p]);
      } else {
        curSeg.push(p);
      }
    }
    return segments
      .filter((seg) => seg.length >= 2)
      .map((seg) => {
        const line = seg
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ");
        return `${line} L ${seg[seg.length - 1].x.toFixed(1)} ${(
          padTop + plotH
        ).toFixed(1)} L ${seg[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;
      })
      .join(" ");
  };
  const corrAreaPath = buildAreaPath(corrPoints);

  // Shaded early-fold skipped region when scope === "all_folds"
  let skippedSpanEndIdx = -1;
  if (scope === "all_folds") {
    for (let i = 0; i < plotRows.length; i++) {
      if (plotRows[i].corrected?.state === "skipped_insufficient_labels") {
        skippedSpanEndIdx = i;
      } else {
        break;
      }
    }
  }

  const lastOrig = origPoints[origPoints.length - 1];
  const lastCorr = corrPoints[corrPoints.length - 1];

  // Prevent direct right-edge pills from overlapping vertically
  let corrLabelY = lastCorr ? lastCorr.y : padTop + 40;
  let origLabelY = lastOrig ? lastOrig.y : padTop + 80;
  if (Math.abs(corrLabelY - origLabelY) < 28) {
    if (corrLabelY <= origLabelY) {
      corrLabelY = Math.max(padTop + 12, origLabelY - 15);
      origLabelY = Math.min(padTop + plotH - 12, corrLabelY + 28);
    } else {
      origLabelY = Math.max(padTop + 12, corrLabelY - 15);
      corrLabelY = Math.min(padTop + plotH - 12, origLabelY + 28);
    }
  }

  const activeDate =
    hoveredDate ??
    selectedDate ??
    plotRows[Math.floor(plotRows.length / 2)]?.forecast_date ??
    plotRows[0].forecast_date;
  const plotActiveIdx = plotRows.findIndex(
    (r) => r.forecast_date === activeDate
  );
  // Keep readout synchronized even if user selected an early skipped fold from DataTable while in common_dates mode
  const activeRow =
    (plotActiveIdx >= 0 ? plotRows[plotActiveIdx] : null) ??
    rows.find((r) => r.forecast_date === activeDate) ??
    plotRows[0];
  const activeX = plotActiveIdx >= 0 ? getX(plotActiveIdx) : padLeft;

  const handlePointKeyDown = (
    e: React.KeyboardEvent<SVGGElement>,
    idx: number
  ) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(plotRows.length - 1, idx + 1);
      onSelectDate(plotRows[next].forecast_date);
      pointRefs.current[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(0, idx - 1);
      onSelectDate(plotRows[prev].forecast_date);
      pointRefs.current[prev]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      onSelectDate(plotRows[0].forecast_date);
      pointRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = plotRows.length - 1;
      onSelectDate(plotRows[last].forecast_date);
      pointRefs.current[last]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const dt = plotRows[idx].forecast_date;
      onSelectDate(dt);
      if (onInspectFoldDetail) onInspectFoldDetail(dt);
    }
  };

  // X-axis year ticks
  const yearTickIndices: number[] = [];
  const seenYears = new Set<string>();
  plotRows.forEach((r, idx) => {
    const yr = r.forecast_date.slice(0, 4);
    if (!seenYears.has(yr) && (idx === 0 || Number(yr) % 2 === 0 || idx === plotRows.length - 1)) {
      seenYears.add(yr);
      yearTickIndices.push(idx);
    }
  });

  const corrBadge = activeRow.corrected
    ? formatFoldStateBadge(activeRow.corrected.state)
    : { label: "Unavailable", tone: "warn" as const };

  return (
    <figure
      aria-label="Forecast error comparison chart"
      data-testid="error-chart"
      className="ripple-card p-6 sm:p-8 m-0"
    >
      {/* Top header & legend matching mockup */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <div>
          <h3 className="text-[20px] font-bold text-text">
            Forecast error across{" "}
            {scope === "common_dates" ? "common dates" : "all folds"}
          </h3>
          <p className="text-[12px] text-muted mt-0.5">
            Absolute error (%) · {ticker} · {formatModelName(model)} ·{" "}
            {horizon}-month horizon
          </p>
        </div>

        {/* Legend with both colour and line-style dash encoding */}
        <div
          aria-label="Series legend"
          className="flex flex-wrap items-center gap-5 text-[14px]"
        >
          <span className="inline-flex items-center gap-2 font-medium text-text">
            <span
              className="inline-block w-6 h-[3px] rounded-full bg-action"
              aria-hidden="true"
            />
            <span>
              Corrected{" "}
              <strong className="font-mono tabular-nums">
                {maePair.correctedValue !== null
                  ? `${maePair.correctedValue.toFixed(2)}%`
                  : "n/a"}
              </strong>
            </span>
          </span>
          <span className="inline-flex items-center gap-2 font-medium text-muted">
            <span
              className="inline-block w-6 border-b-2 border-dashed border-comparison"
              aria-hidden="true"
            />
            <span>
              Original{" "}
              <strong className="font-mono tabular-nums text-text">
                {maePair.originalValue !== null
                  ? `${maePair.originalValue.toFixed(2)}%`
                  : "n/a"}
              </strong>
            </span>
          </span>
          {onSwitchToTable && (
            <button
              type="button"
              data-testid="chart-switch-to-table"
              onClick={onSwitchToTable}
              className="ripple-btn ripple-btn-secondary rounded-md px-2.5 py-1 text-[12px] min-h-[34px]"
            >
              View table alternative
            </button>
          )}
        </div>
      </div>

      {/* Screen-reader live summary generated from the same data */}
      <p className="sr-only" aria-live="polite" data-testid="chart-sr-summary">
        {chartSummarySentence}
      </p>

      {/* SVG Chart */}
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="group"
          aria-label={chartSummarySentence}
          className="w-full h-auto select-none block"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--action)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--action)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Shaded pre-maturity skipped region in all_folds mode */}
          {skippedSpanEndIdx >= 0 && (
            <g data-testid="chart-skipped-region">
              <rect
                x={padLeft}
                y={padTop}
                width={Math.max(8, getX(skippedSpanEndIdx) - padLeft + 6)}
                height={plotH}
                fill="var(--warn-tint)"
                opacity="0.7"
              />
              <text
                x={padLeft + 6}
                y={padTop + 14}
                fontSize="11"
                fill="var(--warn)"
                className="font-mono"
              >
                {skippedSpanEndIdx + 1} early folds skipped in corrected (&lt;24 matured labels)
              </text>
            </g>
          )}

          {/* Horizontal gridlines + Y-axis labels starting at 0% */}
          {yTicks.map((t) => {
            const y = getY(t);
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="var(--muted)"
                  className="font-mono tabular-nums"
                >
                  {t}%
                </text>
              </g>
            );
          })}

          {/* Left Y-axis spine */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={padLeft}
            y2={padTop + plotH}
            stroke="var(--border-strong)"
            strokeOpacity="0.45"
            strokeWidth="1"
          />

          {/* X-axis year labels */}
          {yearTickIndices.map((idx) => {
            const x = getX(idx);
            const yr = plotRows[idx].forecast_date.slice(0, 4);
            return (
              <text
                key={yr}
                x={x}
                y={padTop + plotH + 22}
                textAnchor="middle"
                fontSize="12"
                fill="var(--muted)"
                className="font-mono tabular-nums"
              >
                {yr}
              </text>
            );
          })}

          {/* Animated chart paths inside clip reveal */}
          <g className="ripple-chart-reveal">
            {corrAreaPath && (
              <path d={corrAreaPath} fill={`url(#${gradId})`} />
            )}

            {/* Original series: dashed comparison colour */}
            {origPath && (
              <path
                d={origPath}
                fill="none"
                stroke="var(--comparison)"
                strokeWidth="2"
                strokeDasharray="6 5"
                data-testid="series-path-original"
              />
            )}

            {/* Corrected series: solid action colour */}
            {corrPath && (
              <path
                d={corrPath}
                fill="none"
                stroke="var(--action)"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                data-testid="series-path-corrected"
              />
            )}
          </g>

          {/* Active fold vertical playhead & concentric ripple rings */}
          {plotActiveIdx >= 0 && (
            <g aria-hidden="true">
              <line
                x1={activeX}
                y1={padTop}
                x2={activeX}
                y2={padTop + plotH}
                stroke="var(--action)"
                strokeWidth="1"
                strokeDasharray="3 3"
                strokeOpacity="0.65"
              />
              {activeRow.corrected_error_pct !== null && (
                <>
                  <circle
                    cx={activeX}
                    cy={getY(activeRow.corrected_error_pct)}
                    r="13"
                    fill="none"
                    stroke="var(--ring)"
                    strokeWidth="1.25"
                    strokeOpacity="0.35"
                  />
                  <circle
                    cx={activeX}
                    cy={getY(activeRow.corrected_error_pct)}
                    r="8"
                    fill="none"
                    stroke="var(--ring)"
                    strokeWidth="1.5"
                    strokeOpacity="0.55"
                  />
                </>
              )}
            </g>
          )}

          {/* Direct right-edge series labels matching mockup */}
          {lastCorr && (
            <g transform={`translate(${padLeft + plotW + 10}, ${corrLabelY - 12})`}>
              <rect
                x="0"
                y="0"
                width="134"
                height="24"
                rx="6"
                fill="var(--action)"
              />
              <text
                x="67"
                y="16"
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill="var(--action-fg)"
                className="font-mono tabular-nums"
              >
                Corrected {maePair.correctedValue?.toFixed(2)}%
              </text>
            </g>
          )}

          {lastOrig && (
            <g transform={`translate(${padLeft + plotW + 10}, ${origLabelY - 12})`}>
              <rect
                x="0"
                y="0"
                width="134"
                height="24"
                rx="6"
                fill="var(--raised)"
                stroke="var(--border-strong)"
                strokeWidth="1"
              />
              <text
                x="67"
                y="16"
                textAnchor="middle"
                fontSize="12"
                fontWeight="500"
                fill="var(--text)"
                className="font-mono tabular-nums"
              >
                Original {maePair.originalValue?.toFixed(2)}%
              </text>
            </g>
          )}

          {/* Keyboard-focusable and clickable fold points */}
          {plotRows.map((r, idx) => {
            const x = getX(idx);
            const yCorr =
              r.corrected_error_pct !== null
                ? getY(r.corrected_error_pct)
                : r.original_error_pct !== null
                ? getY(r.original_error_pct)
                : padTop + plotH;
            const yOrig =
              r.original_error_pct !== null
                ? getY(r.original_error_pct)
                : yCorr;
            const isSelected = r.forecast_date === activeRow.forecast_date;
            const stateText = r.corrected?.state ?? "unavailable";

            return (
              <g
                key={r.forecast_date}
                ref={(el) => {
                  pointRefs.current[idx] = el;
                }}
                role="button"
                tabIndex={0}
                data-testid={`chart-point-${r.forecast_date}`}
                aria-label={`Fold ${r.forecast_date}: Corrected error ${
                  r.corrected_error_pct !== null
                    ? `${r.corrected_error_pct.toFixed(2)}%`
                    : "unavailable"
                }, Original error ${
                  r.original_error_pct !== null
                    ? `${r.original_error_pct.toFixed(2)}%`
                    : "unavailable"
                }, state ${stateText}. Press Enter to inspect fold.`}
                onClick={() => {
                  onSelectDate(r.forecast_date);
                  if (onInspectFoldDetail) onInspectFoldDetail(r.forecast_date);
                }}
                onMouseEnter={() => setHoveredDate(r.forecast_date)}
                onMouseLeave={() => setHoveredDate(null)}
                onFocus={() => onSelectDate(r.forecast_date)}
                onKeyDown={(e) => handlePointKeyDown(e, idx)}
                className="cursor-pointer"
              >
                {/* Invisible 16px hit column for comfortable touch/click */}
                <rect
                  x={x - 7}
                  y={padTop}
                  width="14"
                  height={plotH}
                  fill="transparent"
                />
                {r.original_error_pct !== null && (
                  <circle
                    cx={x}
                    cy={yOrig}
                    r={isSelected ? 4.5 : 2.5}
                    fill="var(--surface)"
                    stroke="var(--comparison)"
                    strokeWidth="2"
                  />
                )}
                {r.corrected_error_pct !== null ? (
                  <circle
                    cx={x}
                    cy={yCorr}
                    r={isSelected ? 5.5 : 3}
                    fill="var(--action)"
                    stroke="var(--surface)"
                    strokeWidth="1.75"
                  />
                ) : (
                  <circle
                    cx={x}
                    cy={padTop + plotH - 4}
                    r={isSelected ? 5 : 3.5}
                    fill={
                      r.corrected?.state === "model_failed"
                        ? "var(--leak)"
                        : "var(--warn)"
                    }
                    stroke="var(--surface)"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected / Hovered Point Readout Bar */}
      <div
        data-testid="chart-active-readout"
        className="mt-3 rounded-xl bg-raised/70 border border-border-subtle px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[14px]"
      >
        <div className="flex flex-wrap items-center gap-4">
          <span>
            Date:{" "}
            <strong className="font-mono tabular-nums text-text">
              {activeRow.forecast_date}
            </strong>
          </span>
          <span>
            Original error:{" "}
            <strong className="font-mono tabular-nums text-text">
              {activeRow.original_error_pct !== null
                ? `${activeRow.original_error_pct.toFixed(2)}%`
                : "unavailable"}
            </strong>
          </span>
          <span>
            Corrected error:{" "}
            <strong className="font-mono tabular-nums text-action">
              {activeRow.corrected_error_pct !== null
                ? `${activeRow.corrected_error_pct.toFixed(2)}%`
                : "unavailable"}
            </strong>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium border ${
              corrBadge.tone === "ok"
                ? "bg-ok-tint border-ok text-text"
                : corrBadge.tone === "leak"
                ? "bg-leak-tint border-leak text-text"
                : "bg-warn-tint border-warn text-text"
            }`}
          >
            {corrBadge.label}
          </span>
        </div>

        {onInspectFoldDetail && (
          <button
            type="button"
            data-testid="chart-inspect-fold-btn"
            onClick={() => onInspectFoldDetail(activeRow.forecast_date)}
            className="text-[14px] font-semibold text-action hover:underline cursor-pointer"
          >
            Inspect fold detail ({activeRow.forecast_date}) →
          </button>
        )}
      </div>

      {/* Plain-language note under the chart naming dataset window, baseline variant, and serial correlation limitation */}
      <figcaption
        data-testid="chart-plain-note"
        className="mt-4 text-[14px] text-muted max-w-prose"
      >
        Dataset window:{" "}
        <span className="font-mono tabular-nums">
          {windowStart ?? "2016-01-29"} to {windowEnd ?? "2026-10-30"}
        </span>{" "}
        ({ticker} monthly). Baseline comparator is the{" "}
        <strong className="text-text">original</strong> (unlagged) pipeline.
        Overlapping {horizon}-month return targets make forecast errors serially
        correlated, so the effective independent sample is smaller than the{" "}
        <span className="tabular-nums">{plotRows.length}</span> fold count and no
        statistical significance or winner is declared. Use Left/Right arrow keys
        on any point to step across forecast dates.
      </figcaption>
    </figure>
  );
}
