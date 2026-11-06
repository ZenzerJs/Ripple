"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  LeakageAuditRun,
  PortfolioReplayBundle,
  RunIndexManifest,
  ScopeType,
  computeComparisonView,
  formatModelName,
  validateLeakageAuditRun,
} from "@/lib/schema";
import { RunHeader, ScreenTab } from "@/components/RunHeader";
import { FindingCard } from "@/components/FindingCard";
import { Selector } from "@/components/Selector";
import { MetricPair } from "@/components/MetricPair";
import { ErrorChart } from "@/components/ErrorChart";
import { DataTable } from "@/components/DataTable";
import { FoldPanel, TemporalBoundaryCard } from "@/components/FoldPanel";
import { EvidenceDisclosure } from "@/components/EvidenceDisclosure";
import { PhaseLabView } from "@/components/PhaseLabView";

interface RippleViewerProps {
  initialIndex: RunIndexManifest;
  initialRunsByFile: Record<string, unknown>;
  initialHashesByFile?: Record<string, string>;
  initialLabBundle: PortfolioReplayBundle | null;
}

export function RippleViewer({
  initialIndex,
  initialRunsByFile,
  initialHashesByFile = {},
  initialLabBundle,
}: RippleViewerProps) {
  const [activeTab, setActiveTab] = useState<ScreenTab>("overview");
  const [selectedRunId, setSelectedRunId] = useState<string>(
    initialIndex.default_run_id
  );
  const [showFixtures, setShowFixtures] = useState<boolean>(false);
  const [horizon, setHorizon] = useState<number>(6);
  const [model, setModel] = useState<string>("ridge");
  const [scope, setScope] = useState<ScopeType>("common_dates");
  const [viewMode, setViewMode] = useState<"both" | "chart" | "table">("both");
  const [selectedFoldDate, setSelectedFoldDate] = useState<string | null>(
    "2018-09-28"
  );
  const [isCompareFoldOpen, setIsCompareFoldOpen] = useState<boolean>(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  // Hydrate URL query parameters & saved theme/motion on mount
  useEffect(() => {
    try {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      if (currentTheme === "dark" || currentTheme === "light") {
        setTheme(currentTheme);
      }
      const currentMotion =
        document.documentElement.getAttribute("data-reduced-motion") === "true";
      setReducedMotion(currentMotion);

      const params = new URLSearchParams(window.location.search);
      if (params.get("fixtures") === "1" || params.get("fixtures") === "true") {
        setShowFixtures(true);
      }
      const tabParam = params.get("tab") as ScreenTab | null;
      if (
        tabParam &&
        ["overview", "compare", "fold", "method", "lab"].includes(tabParam)
      ) {
        setActiveTab(tabParam);
      }
      const runParam = params.get("run");
      if (
        runParam &&
        initialIndex.runs.some((r) => r.run_id === runParam)
      ) {
        setSelectedRunId(runParam);
      }
      const hRaw = params.get("horizon");
      const hParam = hRaw ? Number(hRaw) : NaN;
      if (Number.isInteger(hParam) && hParam > 0) {
        setHorizon(hParam);
      }
      const mParam = params.get("model");
      if (mParam) {
        setModel(mParam);
      }
      const sParam = params.get("scope") as ScopeType | null;
      if (sParam === "common_dates" || sParam === "all_folds") {
        setScope(sParam);
      }
      const fParam = params.get("fold");
      if (fParam) {
        setSelectedFoldDate(fParam);
      }
    } catch {
      // ignore URL or storage access errors
    }
  }, [initialIndex.runs]);

  // Keep URL query parameters synchronized with state
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("tab", activeTab);
      params.set("run", selectedRunId);
      params.set("horizon", String(horizon));
      params.set("model", model);
      params.set("scope", scope);
      if (selectedFoldDate) {
        params.set("fold", selectedFoldDate);
      }
      const nextUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, "", nextUrl);
    } catch {
      // ignore history errors
    }
  }, [activeTab, selectedRunId, horizon, model, scope, selectedFoldDate]);

  const handleToggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("ripple-theme", next);
    } catch {
      // ignore storage errors
    }
  };

  const handleToggleReducedMotion = () => {
    const next = !reducedMotion;
    setReducedMotion(next);
    if (next) {
      document.documentElement.setAttribute("data-reduced-motion", "true");
    } else {
      document.documentElement.removeAttribute("data-reduced-motion");
    }
    try {
      localStorage.setItem("ripple-reduced-motion", String(next));
    } catch {
      // ignore storage errors
    }
  };

  // Spec rule: "`status` gates the UI. `draft` runs render with a persistent 'unverified' banner. Only `verified` runs can be linked from the overview."
  const handleSelectTab = (nextTab: ScreenTab) => {
    if (nextTab === "overview") {
      const currentEntry = initialIndex.runs.find(
        (r) => r.run_id === selectedRunId
      );
      if (currentEntry && currentEntry.status !== "verified") {
        setSelectedRunId(initialIndex.default_run_id);
      }
    }
    setActiveTab(nextTab);
  };

  const selectedEntry =
    initialIndex.runs.find((r) => r.run_id === selectedRunId) ??
    initialIndex.runs[0];
  const rawRunPayload = initialRunsByFile[selectedEntry.file];
  const hashVerified = Boolean(
    selectedEntry.sha256 &&
      initialHashesByFile[selectedEntry.file] &&
      selectedEntry.sha256 === initialHashesByFile[selectedEntry.file]
  );
  const validation = useMemo(
    () => validateLeakageAuditRun(rawRunPayload),
    [rawRunPayload]
  );

  // If schema or provenance check fails: plain message naming what failed; no partial render
  if (!validation.ok) {
    return (
      <div className="min-h-screen flex flex-col bg-canvas text-text">
        <RunHeader
          kind="leakage_audit"
          status="invalid"
          hashVerified={hashVerified}
          showFixtures={showFixtures}
          ticker={selectedEntry.ticker}
          frequency="monthly"
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          reducedMotion={reducedMotion}
          onToggleReducedMotion={handleToggleReducedMotion}
          runs={initialIndex.runs}
          selectedRunId={selectedRunId}
          onSelectRunId={setSelectedRunId}
        />

        <main className="mx-auto w-full max-w-container flex-1 px-4 sm:px-6 lg:px-8 py-12">
          <section
            role="alert"
            data-testid="invalid-export-error-screen"
            className="ripple-card border-leak p-8 max-w-prose mx-auto"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-leak-tint border border-leak px-3 py-1 text-[12px] font-semibold text-text mb-4">
              <span className="h-2 w-2 rounded-full bg-leak" />
              Export Validation Failed · Render Blocked
            </div>
            <h1 className="font-display text-[28px] font-medium text-text mb-3">
              Run export failed schema or provenance verification
            </h1>
            <p className="text-[16px] text-muted mb-5">
              File{" "}
              <code className="font-mono text-[14px] text-text">
                {selectedEntry.file}
              </code>{" "}
              could not be validated against the Ripple{" "}
              <code className="font-mono text-[14px] text-text">v1.0</code>{" "}
              contract. Partial rendering is disabled so unverified numbers
              never appear on screen.
            </p>
            <ul
              data-testid="invalid-export-reasons"
              className="list-disc pl-5 space-y-2 text-[14px] font-mono text-text bg-raised/70 rounded-xl p-4 border border-leak mb-6"
            >
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
            <button
              type="button"
              data-testid="recover-valid-run-btn"
              onClick={() => setSelectedRunId(initialIndex.default_run_id)}
              className="ripple-btn ripple-btn-primary rounded-lg px-5 py-2.5 text-[14px]"
            >
              Return to verified default run ({initialIndex.default_run_id})
            </button>
          </section>
        </main>
      </div>
    );
  }

  const run: LeakageAuditRun = validation.data;
  const view = computeComparisonView(run, horizon, model, scope);

  const effectiveFoldDate =
    selectedFoldDate &&
    view.allDateRows.some((r) => r.forecast_date === selectedFoldDate)
      ? selectedFoldDate
      : view.allDateRows.find((r) => r.forecast_date.startsWith("2018-09"))
          ?.forecast_date ??
        view.allDateRows[Math.floor(view.allDateRows.length / 2)]
          ?.forecast_date ??
        view.allDateRows[0]?.forecast_date ??
        "2018-09-28";

  const activeBoundaryRow =
    view.allDateRows.find((r) => r.forecast_date === effectiveFoldDate) ??
    view.allDateRows[0];

  return (
    <div className="min-h-screen w-full overflow-x-hidden flex flex-col bg-canvas text-text">
      <RunHeader
        kind={run.kind}
        status={run.status}
        hashVerified={hashVerified}
        showFixtures={showFixtures}
        ticker={run.source.ticker}
        frequency={run.source.frequency}
        windowStart={run.source.window_start}
        windowEnd={run.source.window_end}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={handleToggleReducedMotion}
        runs={initialIndex.runs}
        selectedRunId={selectedRunId}
        onSelectRunId={setSelectedRunId}
      />

      <main className="mx-auto w-full max-w-container flex-1 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
        {/* Unsupported comparison state handler (spec line 152) */}
        {!view.isSupported && activeTab !== "lab" && (
          <section
            role="status"
            data-testid="unsupported-comparison-banner"
            className="ripple-card border-warn p-6 sm:p-8"
          >
            <h2 className="text-[20px] font-bold text-text mb-2">
              Selected comparison combination is unavailable
            </h2>
            <p className="text-[16px] text-muted mb-4">
              {view.unsupportedReason}
            </p>
            {view.nearestValidSelection && (
              <button
                type="button"
                data-testid="nearest-valid-selection-btn"
                onClick={() => {
                  setHorizon(view.nearestValidSelection!.horizon);
                  setModel(view.nearestValidSelection!.model);
                  setScope(view.nearestValidSelection!.scope);
                }}
                className="ripple-btn ripple-btn-primary rounded-lg px-4 py-2 text-[14px]"
              >
                Switch to nearest valid selection (
                {formatModelName(view.nearestValidSelection.model)},{" "}
                {view.nearestValidSelection.horizon} months)
              </button>
            )}
          </section>
        )}

        {/* SCREEN 1: OVERVIEW (Draft runs excluded per spec line 148) */}
        {activeTab === "overview" && run.status === "draft" && (
          <section
            role="status"
            data-testid="draft-excluded-overview-card"
            className="ripple-card border-warn p-6 sm:p-8 max-w-prose mx-auto space-y-4 ripple-enter"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-warn-tint border border-warn px-3 py-1 text-[12px] font-semibold text-text">
              <span className="h-2 w-2 rounded-full bg-warn" />
              Draft Run · Excluded from Overview
            </div>
            <h1 className="font-display text-[28px] font-medium text-text">
              Unverified draft runs are excluded from the Overview summary
            </h1>
            <p className="text-[16px] text-muted">
              Run <code className="font-mono text-[14px] text-text">{run.run_id}</code> has
              status <code className="font-mono text-[14px] text-text">draft</code>. Per the
              Ripple viewer data contract, only <code className="font-mono text-[14px] text-text">verified</code>{" "}
              runs appear on the Overview screen. You can inspect this draft run&apos;s
              fold-level diagnostics on the Compare screen or return to a verified run.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                data-testid="inspect-draft-in-compare-btn"
                onClick={() => setActiveTab("compare")}
                className="ripple-btn ripple-btn-primary rounded-lg px-4 py-2 text-[14px]"
              >
                Inspect draft run in Compare →
              </button>
              <button
                type="button"
                data-testid="switch-verified-from-draft-btn"
                onClick={() => setSelectedRunId(initialIndex.default_run_id)}
                className="ripple-btn ripple-btn-secondary rounded-lg px-4 py-2 text-[14px]"
              >
                Switch to verified default run ({initialIndex.default_run_id})
              </button>
            </div>
          </section>
        )}

        {activeTab === "overview" && run.status === "verified" && view.isSupported && (
          <div data-testid="screen-overview" className="space-y-10 ripple-enter">
            {/* Hero Section with Concentric Ripple Rings Motif */}
            <section className="relative overflow-hidden rounded-2xl py-4 sm:py-6">
              <div
                aria-hidden="true"
                style={{ background: "var(--hero-glow)" }}
                className="pointer-events-none absolute inset-0"
              />
              {/* Concentric rings decorative motif (10-15% opacity in both themes per spec) */}
              <svg
                aria-hidden="true"
                viewBox="0 0 420 420"
                fill="none"
                className="pointer-events-none absolute -right-16 -top-20 w-[340px] sm:w-[420px] h-auto opacity-[0.14]"
              >
                <circle
                  cx="210"
                  cy="210"
                  r="195"
                  stroke="var(--ring)"
                  strokeWidth="1.5"
                />
                <circle
                  cx="210"
                  cy="210"
                  r="145"
                  stroke="var(--ring)"
                  strokeWidth="1.5"
                />
                <circle
                  cx="210"
                  cy="210"
                  r="95"
                  stroke="var(--ring)"
                  strokeWidth="1.5"
                />
                <circle
                  cx="210"
                  cy="210"
                  r="45"
                  stroke="var(--ring)"
                  strokeWidth="1.5"
                />
              </svg>

              <div className="relative z-10 max-w-prose">
                <h1
                  data-testid="overview-question-heading"
                  className="font-display text-[28px] sm:text-[40px] font-normal tracking-tight text-text leading-[1.15] mb-3"
                >
                  Did fixing look-ahead leakage change the forecast errors?
                </h1>
                <p className="text-[16px] sm:text-[20px] text-muted max-w-prose">
                  Comparing return forecasts before and after enforcing strict
                  temporal cutoffs.
                </p>

                {/* Verified runs linked from Overview (Spec line 94: Only verified runs can be linked from the overview) */}
                <div
                  data-testid="overview-verified-run-links"
                  className="mt-4 flex flex-wrap items-center gap-2 text-[12px]"
                >
                  <span className="font-mono uppercase tracking-wider text-muted">
                    Verified runs:
                  </span>
                  {initialIndex.runs
                    .filter((r) => r.status === "verified")
                    .map((r) => {
                      const active = r.run_id === selectedRunId;
                      return (
                        <button
                          key={r.run_id}
                          type="button"
                          data-testid={`overview-link-${r.run_id}`}
                          aria-pressed={active}
                          onClick={() => setSelectedRunId(r.run_id)}
                          className={`rounded-full px-3 py-1 font-mono transition-colors cursor-pointer border ${
                            active
                              ? "bg-action text-action-fg border-action font-semibold"
                              : "bg-surface text-text border-border-strong hover:bg-raised"
                          }`}
                        >
                          {r.ticker} ({r.run_id.includes("null") ? "null-control" : "verified"})
                        </button>
                      );
                    })}
                </div>
              </div>
            </section>

            {/* Primary Finding Card + Contribution Card */}
            <FindingCard
              view={view}
              ticker={run.source.ticker}
              limitations={run.limitations}
              onExploreComparison={() => setActiveTab("compare")}
              onReadMethod={() => setActiveTab("method")}
              onOpenPhaseLab={() => setActiveTab("lab")}
            />

            {/* Overview Chart Preview Card matching mockup */}
            <ErrorChart
              rows={view.scopedDateRows}
              maePair={view.maePair}
              selectedDate={effectiveFoldDate}
              onSelectDate={(dt) => setSelectedFoldDate(dt)}
              onInspectFoldDetail={(dt) => {
                setSelectedFoldDate(dt);
                setActiveTab("fold");
              }}
              onSwitchToTable={() => {
                setViewMode("table");
                setActiveTab("compare");
              }}
              chartSummarySentence={view.chartSummarySentence}
              ticker={run.source.ticker}
              horizon={horizon}
              model={model}
              scope={scope}
              windowStart={run.source.window_start}
              windowEnd={run.source.window_end}
              compact
            />

            {/* Inspect the Temporal Boundary Card matching mockup */}
            {activeBoundaryRow && (
              <TemporalBoundaryCard
                foldDate={activeBoundaryRow.forecast_date}
                firstTrainDate={
                  activeBoundaryRow.corrected?.first_train_date ??
                  activeBoundaryRow.original?.first_train_date ??
                  "2016-07-29"
                }
                targetMaturityDate={
                  activeBoundaryRow.corrected?.target_maturity_date ??
                  activeBoundaryRow.original?.target_maturity_date ??
                  activeBoundaryRow.forecast_date
                }
                horizonMonths={horizon}
                leakedCount={
                  activeBoundaryRow.original?.leaked_rows?.length ?? horizon
                }
                trainCount={activeBoundaryRow.corrected?.train_count ?? 0}
                latestLabelAvailable={
                  activeBoundaryRow.corrected?.latest_label_available ?? null
                }
                onInspectFold={() => setActiveTab("fold")}
              />
            )}

            {/* Reachable Methodology & Provenance Disclosure on Overview */}
            <EvidenceDisclosure
              runId={run.run_id}
              schemaVersion={run.schema_version}
              status={run.status}
              source={run.source}
              limitations={run.limitations}
            />
          </div>
        )}

        {/* SCREEN 2: COMPARE */}
        {activeTab === "compare" && (
          <div data-testid="screen-compare" className="space-y-8 ripple-enter">
            <div>
              <h1 className="font-display text-[28px] sm:text-[36px] font-normal text-text leading-tight">
                Compare original vs corrected forecast errors
              </h1>
              <p className="text-[16px] text-muted mt-1 max-w-prose">
                Did the numbers move, by how much, and on what sample? Select
                any point or table row to inspect the exact training window and
                leaked labels at that forecast date.
              </p>
            </div>

            <Selector
              horizon={horizon}
              onChangeHorizon={setHorizon}
              model={model}
              availableModels={run.models}
              onChangeModel={setModel}
              scope={scope}
              onChangeScope={setScope}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              droppedCount={view.droppedDatesCount}
            />

            {view.isSupported && (
              <>
                {/* Metric Row: MAE and RMSE side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <MetricPair pair={view.maePair} scope={scope} />
                  <MetricPair pair={view.rmsePair} scope={scope} />
                </div>

                {/* Split layout beside chart on wide screens, bottom sheet on narrow screens (Spec lines 225 & 239) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div
                    className={
                      isCompareFoldOpen
                        ? "lg:col-span-7 space-y-6"
                        : "lg:col-span-12 space-y-6"
                    }
                  >
                    {viewMode !== "table" && (
                      <ErrorChart
                        rows={view.scopedDateRows}
                        maePair={view.maePair}
                        selectedDate={effectiveFoldDate}
                        onSelectDate={(dt) => {
                          setSelectedFoldDate(dt);
                          setIsCompareFoldOpen(true);
                        }}
                        onInspectFoldDetail={(dt) => {
                          setSelectedFoldDate(dt);
                          setIsCompareFoldOpen(true);
                        }}
                        onSwitchToTable={() => setViewMode("table")}
                        chartSummarySentence={view.chartSummarySentence}
                        ticker={run.source.ticker}
                        horizon={horizon}
                        model={model}
                        scope={scope}
                        windowStart={run.source.window_start}
                        windowEnd={run.source.window_end}
                      />
                    )}

                    <DataTable
                      rows={view.scopedDateRows}
                      selectedDate={effectiveFoldDate}
                      onSelectDate={(dt) => {
                        setSelectedFoldDate(dt);
                        setIsCompareFoldOpen(true);
                      }}
                      horizon={horizon}
                      model={model}
                    />
                  </div>

                  {isCompareFoldOpen && (
                    <>
                      <div
                        aria-hidden="true"
                        onClick={() => setIsCompareFoldOpen(false)}
                        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] lg:hidden"
                      />
                      <div
                        data-testid="compare-fold-sheet"
                        className="fixed inset-x-0 bottom-0 z-40 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t-2 border-action bg-surface p-2 shadow-2xl lg:static lg:z-auto lg:col-span-5 lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
                      >
                        <div
                          aria-hidden="true"
                          className="mx-auto my-1.5 h-1.5 w-12 rounded-full bg-border-strong/50 lg:hidden"
                        />
                        <FoldPanel
                          run={run}
                          selectedDate={effectiveFoldDate}
                          horizon={horizon}
                          selectedModel={model}
                          onSelectDate={setSelectedFoldDate}
                          onClose={() => setIsCompareFoldOpen(false)}
                        />
                      </div>
                    </>
                  )}
                </div>

                <EvidenceDisclosure
                  runId={run.run_id}
                  schemaVersion={run.schema_version}
                  status={run.status}
                  source={run.source}
                  limitations={run.limitations}
                />
              </>
            )}
          </div>
        )}

        {/* SCREEN 3: FOLD DETAIL */}
        {activeTab === "fold" && view.isSupported && (
          <div data-testid="screen-fold" className="space-y-8 ripple-enter">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-[28px] sm:text-[36px] font-normal text-text leading-tight">
                  Fold temporal boundary &amp; training window audit
                </h1>
                <p className="text-[16px] text-muted mt-1 max-w-prose">
                  Showing what the model was allowed to know at one forecast
                  date, and which rows leaked future labels in the original run.
                </p>
              </div>
              <button
                type="button"
                data-testid="back-to-compare-btn"
                onClick={() => setActiveTab("compare")}
                className="ripple-btn ripple-btn-secondary rounded-lg px-4 py-2 text-[14px]"
              >
                ← Back to Compare ({formatModelName(model)}, {horizon}m)
              </button>
            </div>

            <FoldPanel
              run={run}
              selectedDate={effectiveFoldDate}
              horizon={horizon}
              selectedModel={model}
              onSelectDate={setSelectedFoldDate}
            />

            <EvidenceDisclosure
              runId={run.run_id}
              schemaVersion={run.schema_version}
              status={run.status}
              source={run.source}
              limitations={run.limitations}
            />
          </div>
        )}

        {/* SCREEN 4: METHOD */}
        {activeTab === "method" && (
          <div data-testid="screen-method" className="space-y-8 ripple-enter">
            <div>
              <h1 className="font-display text-[28px] sm:text-[36px] font-normal text-text leading-tight">
                Methodology, data contract &amp; verification protocol
              </h1>
              <p className="text-[16px] text-muted mt-1 max-w-prose">
                Every number on screen comes directly from a validated static
                JSON export with SHA-256 dataset and commit provenance.
              </p>
            </div>

            <EvidenceDisclosure
              runId={run.run_id}
              schemaVersion={run.schema_version}
              status={run.status}
              source={run.source}
              limitations={run.limitations}
              defaultExpanded
            />

            <section className="ripple-card p-6 sm:p-8 space-y-4">
              <h2 className="text-[20px] font-bold text-text">
                Point-in-time information rules enforced at decision cutoff T
              </h2>
              <ul className="list-disc pl-5 space-y-2.5 text-[15px] text-text max-w-prose">
                <li>
                  <strong>Observation availability:</strong> Every input bar must
                  satisfy <code className="font-mono text-[13px]">available_at &lt;= T</code>.
                </li>
                <li>
                  <strong>Supervised label maturity:</strong> Every training row
                  must have its forward target fully realized on or before{" "}
                  <code className="font-mono text-[13px]">T</code> (
                  <code className="font-mono text-[13px]">
                    latest_label_available &lt;= forecast_date
                  </code>
                  ). In a {horizon}-month forecast, the most recent {horizon}{" "}
                  months of feature observations have targets that depend on
                  prices after <code className="font-mono text-[13px]">T</code>{" "}
                  and are excluded from training.
                </li>
                <li>
                  <strong>No silent fold dropping:</strong> Early dates with
                  fewer than 24 matured training rows record{" "}
                  <code className="font-mono text-[13px]">
                    state = &quot;skipped_insufficient_labels&quot;
                  </code>{" "}
                  and remain visible in the table as{" "}
                  <code className="font-mono text-[13px]">unavailable</code>{" "}
                  with the reason in text.
                </li>
                <li>
                  <strong>No statistical significance or trading claims:</strong>{" "}
                  Overlapping multi-period targets induce serial correlation in
                  forecast errors. The viewer reports direction and magnitude of
                  changes without winner badges or real-money performance claims.
                </li>
              </ul>
            </section>
          </div>
        )}

        {/* SCREEN 5: RIPPLE PHASES 3-6 PORTFOLIO & STRESS LAB */}
        {activeTab === "lab" && <PhaseLabView bundle={initialLabBundle} />}
      </main>

      <footer className="mt-16 border-t border-border-subtle py-6 px-4 sm:px-6 lg:px-8 text-[12px] text-muted">
        <div className="mx-auto max-w-container flex flex-wrap items-center justify-between gap-4">
          <span>
            Historical research · virtual research only · no investment advice
            or live trading
          </span>
          <span className="font-mono">
            Schema v{run.schema_version} · {run.run_id} · Commit{" "}
            {run.source.repo_commit.slice(0, 8)}
          </span>
        </div>
      </footer>
    </div>
  );
}
