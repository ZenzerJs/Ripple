"use client";

import React from "react";
import {
  AuditFold,
  LeakageAuditRun,
  formatFoldStateBadge,
  formatModelName,
} from "@/lib/schema";

interface TemporalBoundaryBarProps {
  foldDate: string;
  firstTrainDate: string;
  targetMaturityDate: string;
  horizonMonths: number;
  leakedCount: number;
  trainCount: number;
  latestLabelAvailable: string | null;
  onInspectFold?: () => void;
}

/**
 * Matches the "Inspect the temporal boundary" card in the Still water & Deep water mockups:
 * Matured training data | Concentric rings around decision date | {N} leaked rows | {h}-month evaluation
 * With callout pill: "Immature prior labels enter the unpurged reference"
 */
export function TemporalBoundaryCard({
  foldDate,
  firstTrainDate,
  targetMaturityDate,
  horizonMonths,
  leakedCount,
  trainCount,
  latestLabelAvailable,
  onInspectFold,
}: TemporalBoundaryBarProps) {
  return (
    <section
      aria-label="Inspect the temporal boundary"
      data-testid="temporal-boundary-card"
      className="ripple-card p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <h3 className="text-[20px] font-bold text-text">
          Inspect the temporal boundary
        </h3>
        {onInspectFold && (
          <button
            type="button"
            data-testid="boundary-open-fold-btn"
            onClick={onInspectFold}
            className="text-[14px] font-medium text-action hover:underline cursor-pointer"
          >
            Open full fold breakdown ({foldDate}) →
          </button>
        )}
      </div>

      {/* Top Date Markers: Start Date | Decision Date (centered over cutoff) | Target Maturity Date */}
      <div className="grid grid-cols-3 items-end text-[12px] sm:text-[14px] font-mono tabular-nums mb-2">
        <div className="text-muted text-left">{firstTrainDate}</div>
        <div className="text-center font-bold text-text">{foldDate}</div>
        <div className="text-muted text-right">{targetMaturityDate}</div>
      </div>

      {/* Segmented Bar + Concentric Decision Point Rings */}
      <div className="relative py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 rounded-xl overflow-hidden border border-border-subtle min-h-[48px] text-[13px] sm:text-[14px] font-medium">
          {/* Segment 1: Matured training data */}
          <div
            style={{ backgroundColor: "var(--matured-bar)" }}
            className="lg:col-span-6 flex items-center justify-center px-3 py-2.5 text-text text-center"
          >
            <span>
              Matured training data ({trainCount} rows ≤{" "}
              <span className="font-mono text-[12px]">
                {latestLabelAvailable ?? "none"}
              </span>
              )
            </span>
          </div>

          {/* Segment 2: Leaked rows (Spec rule: use dark text in light mode on pale tint, keep leak for border and marker) */}
          <div
            data-testid="boundary-leaked-segment"
            style={{ backgroundColor: "var(--leak-tint)" }}
            className="lg:col-span-3 flex items-center justify-center px-3 py-2.5 border-y-2 lg:border-y-0 lg:border-l-2 lg:border-r-2 border-leak text-text font-semibold text-center"
          >
            <span>{leakedCount} leaked rows</span>
          </div>

          {/* Segment 3: Evaluation window */}
          <div
            style={{ backgroundColor: "var(--eval-bar)" }}
            className="lg:col-span-3 flex items-center justify-center px-3 py-2.5 text-text text-center"
          >
            <span>{horizonMonths}-month evaluation</span>
          </div>
        </div>

        {/* Concentric rings radiating from the decision point at 50% width */}
        <div
          aria-hidden="true"
          className="pointer-events-none hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
        >
          <svg width="84" height="84" viewBox="0 0 84 84" fill="none">
            <circle
              cx="42"
              cy="42"
              r="38"
              stroke="var(--ring)"
              strokeWidth="1.25"
              strokeOpacity="0.32"
            />
            <circle
              cx="42"
              cy="42"
              r="26"
              stroke="var(--ring)"
              strokeWidth="1.25"
              strokeOpacity="0.48"
            />
            <circle
              cx="42"
              cy="42"
              r="14"
              fill="var(--surface)"
              stroke="var(--ring)"
              strokeWidth="2"
              strokeOpacity="0.85"
            />
            <circle cx="42" cy="42" r="5.5" fill="var(--action)" />
          </svg>
        </div>
      </div>

      {/* Callout stem & pill matching mockup: "Immature prior labels enter the unpurged reference" */}
      <div className="flex flex-col items-center mt-1">
        <div className="h-3 w-[1.5px] bg-leak" aria-hidden="true" />
        <div
          data-testid="boundary-leak-callout"
          className="rounded-lg border border-leak bg-leak-tint px-4 py-1.5 text-[14px] font-medium text-text text-center"
        >
          Immature prior labels enter the unpurged reference
        </div>
      </div>
    </section>
  );
}

interface FoldPanelProps {
  run: LeakageAuditRun;
  selectedDate: string;
  horizon: number;
  selectedModel: string;
  onSelectDate: (date: string) => void;
  onClose?: () => void;
}

export function FoldPanel({
  run,
  selectedDate,
  horizon,
  selectedModel,
  onSelectDate,
  onClose,
}: FoldPanelProps) {
  const horizonFolds = run.folds.filter((f) => f.horizon_months === horizon);
  const allDates = Array.from(
    new Set(horizonFolds.map((f) => f.forecast_date)),
  ).sort();

  const currentIdx = Math.max(0, allDates.indexOf(selectedDate));
  const activeDate = allDates[currentIdx] ?? allDates[0] ?? selectedDate;

  const dateFolds = horizonFolds.filter((f) => f.forecast_date === activeDate);
  const origPrimary: AuditFold | undefined =
    dateFolds.find(
      (f) => f.variant === "original" && f.model === selectedModel,
    ) ?? dateFolds.find((f) => f.variant === "original");
  const corrPrimary: AuditFold | undefined =
    dateFolds.find(
      (f) => f.variant === "corrected" && f.model === selectedModel,
    ) ?? dateFolds.find((f) => f.variant === "corrected");

  // Find a skipped fold date and a failed/unavailable fold date for instant 1-click verification
  const firstSkippedDate =
    horizonFolds.find(
      (f) =>
        f.variant === "corrected" &&
        f.model === selectedModel &&
        f.state === "skipped_insufficient_labels",
    )?.forecast_date ?? allDates[0];
  const firstFailedDate =
    horizonFolds.find(
      (f) =>
        f.variant === "corrected" &&
        f.model === selectedModel &&
        f.state === "model_failed",
    )?.forecast_date ??
    horizonFolds.find(
      (f) => f.variant === "corrected" && f.state === "model_failed",
    )?.forecast_date;
  const firstUnavailableDate = horizonFolds.find(
    (f) =>
      f.variant === "corrected" &&
      f.model === selectedModel &&
      f.state === "unavailable",
  )?.forecast_date;
  const representativeOkDate =
    allDates.find((d) => d.startsWith("2018-09") || d.startsWith("2020-03")) ??
    allDates[Math.min(allDates.length - 1, 10)];

  const corrState = corrPrimary?.state ?? "unavailable";
  const badge = formatFoldStateBadge(corrState);
  const leakedRows = origPrimary?.leaked_rows ?? [];

  return (
    <aside
      aria-label={`Fold detail for ${activeDate}`}
      data-testid="fold-panel"
      className="ripple-card p-6 sm:p-8 space-y-6"
    >
      {/* Top Bar: Title, State Badge, and Optional Close Button */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[20px] font-bold text-text">
              Fold detail ·{" "}
              <span className="font-mono tabular-nums">{activeDate}</span>
            </h2>
            <span
              data-testid="fold-state-badge"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[12px] font-semibold border ${
                badge.tone === "ok"
                  ? "bg-ok-tint border-ok text-text"
                  : badge.tone === "leak"
                    ? "bg-leak-tint border-leak text-text"
                    : "bg-warn-tint border-warn text-text"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  badge.tone === "ok"
                    ? "bg-ok"
                    : badge.tone === "leak"
                      ? "bg-leak"
                      : "bg-warn"
                }`}
                aria-hidden="true"
              />
              {badge.label}
            </span>
          </div>
          {/* Forecast date and decision-time rule in one line */}
          <p
            data-testid="fold-decision-rule"
            className="text-[14px] text-muted mt-1"
          >
            Forecast date:{" "}
            <strong className="font-mono text-text">{activeDate}</strong> ·
            Decision-time rule:{" "}
            <strong className="text-text">{run.source.decision_time}</strong>{" "}
            (labels must mature on or before {activeDate}).
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            data-testid="fold-panel-close"
            onClick={onClose}
            aria-label="Close fold detail panel"
            className="ripple-btn ripple-btn-secondary rounded-lg px-3 py-1.5 text-[14px] min-h-[44px]"
          >
            Close
          </button>
        )}
      </div>

      {/* Fold Navigation Controls + Quick State Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-raised/60 rounded-xl p-3 border border-border-subtle">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            type="button"
            data-testid="fold-prev-btn"
            disabled={currentIdx <= 0}
            onClick={() =>
              currentIdx > 0 && onSelectDate(allDates[currentIdx - 1])
            }
            className="ripple-btn ripple-btn-secondary rounded-lg px-3 py-1 text-[13px] min-h-[44px] disabled:opacity-40"
          >
            ← Prev fold
          </button>
          <label htmlFor="fold-date-select" className="sr-only">
            Select fold date
          </label>
          <select
            id="fold-date-select"
            data-testid="fold-date-select"
            value={activeDate}
            onChange={(e) => onSelectDate(e.target.value)}
            className="min-h-[44px] rounded-lg border border-border-strong bg-surface px-2.5 py-1 text-[13px] font-mono text-text cursor-pointer"
          >
            {allDates.map((d) => {
              const f = horizonFolds.find(
                (x) =>
                  x.forecast_date === d &&
                  x.variant === "corrected" &&
                  x.model === selectedModel,
              );
              const tag =
                f?.state === "ok"
                  ? "OK"
                  : f?.state === "skipped_insufficient_labels"
                    ? "Skipped"
                    : f?.state === "model_failed"
                      ? "Failed"
                      : "Unavailable";
              return (
                <option key={d} value={d}>
                  {d} ({tag})
                </option>
              );
            })}
          </select>
          <button
            type="button"
            data-testid="fold-next-btn"
            disabled={currentIdx >= allDates.length - 1}
            onClick={() =>
              currentIdx < allDates.length - 1 &&
              onSelectDate(allDates[currentIdx + 1])
            }
            className="ripple-btn ripple-btn-secondary rounded-lg px-3 py-1 text-[13px] min-h-[44px] disabled:opacity-40"
          >
            Next fold →
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {firstSkippedDate && (
            <button
              type="button"
              data-testid="fold-jump-skipped"
              onClick={() => onSelectDate(firstSkippedDate)}
              className="ripple-btn rounded-lg px-2.5 py-1 text-[12px] min-h-[44px] border border-warn bg-warn-tint text-text font-medium"
            >
              Inspect Skipped Fold ({firstSkippedDate})
            </button>
          )}
          {firstFailedDate && (
            <button
              type="button"
              data-testid="fold-jump-failed"
              onClick={() => onSelectDate(firstFailedDate)}
              className="ripple-btn rounded-lg px-2.5 py-1 text-[12px] min-h-[44px] border border-leak bg-leak-tint text-text font-medium"
            >
              Inspect Failed Fold ({firstFailedDate})
            </button>
          )}
          {firstUnavailableDate && (
            <button
              type="button"
              data-testid="fold-jump-unavailable"
              onClick={() => onSelectDate(firstUnavailableDate)}
              className="ripple-btn rounded-lg px-2.5 py-1 text-[12px] min-h-[44px] border border-warn bg-warn-tint text-text font-medium"
            >
              Inspect Unavailable Fold ({firstUnavailableDate})
            </button>
          )}
          {representativeOkDate && (
            <button
              type="button"
              data-testid="fold-jump-ok"
              onClick={() => onSelectDate(representativeOkDate)}
              className="ripple-btn rounded-lg px-2.5 py-1 text-[12px] min-h-[44px] border border-ok bg-ok-tint text-text font-medium"
            >
              Inspect Matured Fold ({representativeOkDate})
            </button>
          )}
        </div>
      </div>

      {/* Explicit State Reason Banner when fold is skipped/failed/unavailable */}
      {corrPrimary && corrPrimary.state !== "ok" && (
        <div
          role="status"
          data-testid="fold-non-ok-banner"
          className={`rounded-xl border p-4 text-[14px] text-text ${
            corrPrimary.state === "model_failed"
              ? "border-leak bg-leak-tint"
              : "border-warn bg-warn-tint"
          }`}
        >
          <p className="font-semibold">
            {corrPrimary.state_reason ??
              `Fold unavailable (${corrPrimary.state})`}
          </p>
          {corrPrimary.state === "skipped_insufficient_labels" && (
            <p className="text-muted mt-1">
              At forecast date <span className="font-mono">{activeDate}</span>,
              only{" "}
              <strong className="font-mono text-text">
                {corrPrimary.train_count}
              </strong>{" "}
              training rows had matured {horizon}-month labels (minimum 24
              required). The corrected pipeline refuses to emit a forecast
              rather than training on unmatured future returns.
            </p>
          )}
          {corrPrimary.state === "model_failed" && (
            <p className="text-muted mt-1">
              Contract rule for{" "}
              <code className="font-mono text-[12px]">model_failed</code>: when
              a model solver fails on the{" "}
              <strong className="font-mono text-text">
                {corrPrimary.train_count}
              </strong>{" "}
              matured training rows at{" "}
              <span className="font-mono">{activeDate}</span>, the fold is
              recorded explicitly as{" "}
              <code className="font-mono text-[12px]">unavailable</code> rather
              than silently substituting another model&apos;s forecast.
            </p>
          )}
          {corrPrimary.state === "unavailable" && (
            <p className="text-muted mt-1">
              Contract rule for{" "}
              <code className="font-mono text-[12px]">unavailable</code>: when
              required feature observations are absent at the{" "}
              <span className="font-mono">{activeDate}</span> decision cutoff,
              the fold is preserved as{" "}
              <code className="font-mono text-[12px]">unavailable</code> rather
              than forward-filling missing inputs.
            </p>
          )}
        </div>
      )}

      {/* Visual Temporal Boundary Bar */}
      <TemporalBoundaryCard
        foldDate={activeDate}
        firstTrainDate={
          corrPrimary?.first_train_date ??
          origPrimary?.first_train_date ??
          "2016-07-29"
        }
        targetMaturityDate={
          corrPrimary?.target_maturity_date ??
          origPrimary?.target_maturity_date ??
          activeDate
        }
        horizonMonths={horizon}
        leakedCount={leakedRows.length}
        trainCount={corrPrimary?.train_count ?? 0}
        latestLabelAvailable={corrPrimary?.latest_label_available ?? null}
      />

      {/* Training Window Comparison: Unpurged reference vs Matured-label */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          data-testid="fold-window-corrected"
          className="rounded-xl border border-border-subtle bg-raised/40 p-4"
        >
          <div className="text-[12px] font-semibold uppercase tracking-wider text-action mb-2">
            Matured-label training window (Point-in-time)
          </div>
          <dl className="space-y-1.5 text-[14px] font-mono">
            <div className="flex justify-between">
              <dt className="text-muted font-sans">First training row:</dt>
              <dd className="text-text">
                {corrPrimary?.first_train_date ?? "none"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted font-sans">Last training row:</dt>
              <dd className="text-text">
                {corrPrimary?.last_train_date ?? "none"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted font-sans">Matured row count:</dt>
              <dd className="text-text font-bold">
                {corrPrimary?.train_count ?? 0} rows
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted font-sans">Latest label matured:</dt>
              <dd className="text-ok font-semibold">
                {corrPrimary?.latest_label_available ?? "none"} (≤ {activeDate})
              </dd>
            </div>
          </dl>
        </div>

        <div
          data-testid="fold-window-original"
          className="rounded-xl border border-leak bg-leak-tint/40 p-4"
        >
          <div className="text-[12px] font-semibold uppercase tracking-wider text-leak mb-2">
            Unpurged reference training window (Contains look-ahead leak)
          </div>
          <dl className="space-y-1.5 text-[14px] font-mono">
            <div className="flex justify-between">
              <dt className="text-muted font-sans">First training row:</dt>
              <dd className="text-text">
                {origPrimary?.first_train_date ?? "none"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted font-sans">Last training row:</dt>
              <dd className="text-text">
                {origPrimary?.last_train_date ?? "none"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted font-sans">Total row count:</dt>
              <dd className="text-text font-bold">
                {origPrimary?.train_count ?? 0} rows ({leakedRows.length}{" "}
                unmatured)
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted font-sans">Latest label used:</dt>
              <dd className="text-leak font-semibold">
                {origPrimary?.latest_label_available ?? "none"} (&gt;{" "}
                {activeDate})
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Leaked Rows Evidence Table (shown rather than described) */}
      <div data-testid="fold-leaked-rows-box">
        <h3 className="text-[16px] font-semibold text-text mb-1">
          Unmatured training rows included in the original variant (
          {leakedRows.length} leaked rows)
        </h3>
        <p className="text-[14px] text-muted mb-3">
          Each row below was included in the original training fit on{" "}
          <span className="font-mono text-text">{activeDate}</span> even though
          its {horizon}-month forward return label did not mature until after{" "}
          <span className="font-mono text-text">{activeDate}</span>.
        </p>

        {leakedRows.length === 0 ? (
          <p className="text-[14px] text-muted italic">
            No leaked rows recorded for this fold.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-leak">
            <table className="w-full text-left text-[13px] font-mono">
              <thead className="bg-raised border-b border-leak text-[12px] uppercase text-muted">
                <tr>
                  <th scope="col" className="py-2.5 px-3">
                    Training Row Date
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Label Maturity Date (&gt; {activeDate})
                  </th>
                  <th scope="col" className="py-2.5 px-3 text-right">
                    Future Realized Return ({horizon}m %)
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Audit Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {leakedRows.map((lr) => (
                  <tr
                    key={lr.row_date}
                    data-testid={`leaked-row-${lr.row_date}`}
                    style={{ backgroundColor: "var(--leak-tint)" }}
                    className="border-l-4 border-leak text-text"
                  >
                    <td className="py-2 px-3 font-semibold text-text">
                      {lr.row_date}
                    </td>
                    <td className="py-2 px-3 text-text">
                      {lr.label_matured_date}
                    </td>
                    <td className="py-2 px-3 text-right text-text">
                      {lr.return_pct > 0
                        ? `+${lr.return_pct.toFixed(2)}%`
                        : `${lr.return_pct.toFixed(2)}%`}
                    </td>
                    <td className="py-2 px-3 font-sans text-[12px] font-semibold text-text">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full bg-leak"
                          aria-hidden="true"
                        />
                        Leaked future label · Excluded in corrected
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Model Predictions, Actual Outcomes, and Errors at this Fold */}
      <div>
        <h3 className="text-[16px] font-semibold text-text mb-2">
          Predictions, actual outcomes, and errors by model ({horizon}-month %
          return)
        </h3>
        <div className="overflow-x-auto rounded-xl border border-border-subtle">
          <table
            data-testid="fold-models-table"
            className="w-full text-left text-[13px] font-mono"
          >
            <thead className="bg-raised border-b border-border-subtle text-[12px] uppercase text-muted">
              <tr>
                <th scope="col" className="py-2.5 px-3 font-sans">
                  Model
                </th>
                <th scope="col" className="py-2.5 px-3 font-sans">
                  Variant
                </th>
                <th scope="col" className="py-2.5 px-3 text-right">
                  Prediction (%)
                </th>
                <th scope="col" className="py-2.5 px-3 text-right">
                  Actual (%)
                </th>
                <th scope="col" className="py-2.5 px-3 text-right">
                  Abs Error (pp)
                </th>
                <th scope="col" className="py-2.5 px-3 font-sans">
                  State
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {run.models.map((m) => {
                const origF = dateFolds.find(
                  (f) => f.model === m && f.variant === "original",
                );
                const corrF = dateFolds.find(
                  (f) => f.model === m && f.variant === "corrected",
                );
                return [origF, corrF].map((f, vIdx) => {
                  if (!f) return null;
                  const err =
                    f.state === "ok" &&
                    f.prediction_pct !== null &&
                    f.actual_pct !== null
                      ? Math.abs(f.prediction_pct - f.actual_pct)
                      : null;
                  const b = formatFoldStateBadge(f.state);
                  return (
                    <tr
                      key={`${m}-${f.variant}-${vIdx}`}
                      className={
                        f.variant === "corrected"
                          ? "bg-surface font-medium"
                          : "bg-raised/30 text-muted"
                      }
                    >
                      <td className="py-2.5 px-3 font-sans text-text">
                        {formatModelName(m)}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <span
                          className={
                            f.variant === "corrected"
                              ? "text-action font-semibold"
                              : "text-muted"
                          }
                        >
                          {f.variant}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-text">
                        {f.state === "ok" && f.prediction_pct !== null
                          ? `${f.prediction_pct.toFixed(2)}%`
                          : "unavailable"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-text">
                        {f.actual_pct !== null
                          ? `${f.actual_pct.toFixed(2)}%`
                          : "unavailable"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-text">
                        {err !== null ? `${err.toFixed(2)} pp` : "unavailable"}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[12px]">
                        <span>{b.label}</span>
                        {f.state_reason && (
                          <span className="block text-[11px] text-muted">
                            {f.state_reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>
    </aside>
  );
}
