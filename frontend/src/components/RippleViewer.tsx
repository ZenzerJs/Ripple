"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PortfolioReplayBundle,
  RunIndexManifest,
  computeComparisonView,
  formatModelName,
  validateLeakageAuditRun,
  verifyRunFileHash,
} from "@/lib/schema";
import {
  ViewerLocation,
  ViewerTab,
  parseViewerLocation,
  serializeViewerLocation,
} from "@/lib/viewer-location";
import { RunHeader } from "@/components/RunHeader";
import { Selector } from "@/components/Selector";
import { MetricPair } from "@/components/MetricPair";
import { ErrorChart } from "@/components/ErrorChart";
import { DataTable } from "@/components/DataTable";
import { FoldPanel, TemporalBoundaryCard } from "@/components/FoldPanel";
import { EvidenceDisclosure } from "@/components/EvidenceDisclosure";
import { PhaseLabView } from "@/components/PhaseLabView";
import { ResearchOverview } from "@/components/ResearchOverview";
import { ResearchInspector } from "@/components/ResearchInspector";

interface RippleViewerProps {
  initialIndex: RunIndexManifest;
  initialRunsByFile: Record<string, unknown>;
  initialHashesByFile?: Record<string, string>;
  initialLabBundle: PortfolioReplayBundle | null;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function RippleViewer({
  initialIndex,
  initialRunsByFile,
  initialHashesByFile = {},
  initialLabBundle,
}: RippleViewerProps) {
  const [location, setLocation] = useState<ViewerLocation>(() =>
    parseViewerLocation("", initialIndex),
  );
  const locationRef = useRef(location);
  const mainRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [viewMode, setViewMode] = useState<"both" | "chart" | "table">("both");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 1600px)");
  const phone = useMediaQuery("(max-width: 767px)");
  const {
    tab: activeTab,
    run: selectedRunId,
    horizon,
    model,
    scope,
    fold: selectedFoldDate,
  } = location;

  useEffect(() => {
    const restore = () => {
      const next = parseViewerLocation(window.location.search, initialIndex);
      locationRef.current = next;
      setLocation(next);
      setInspectorOpen(false);
    };
    restore();
    setTheme(
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light",
    );
    setReducedMotion(
      document.documentElement.getAttribute("data-reduced-motion") === "true",
    );
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [initialIndex]);

  const updateLocation = useCallback(
    (
      patch: Partial<ViewerLocation>,
      history: "push" | "replace" = "replace",
    ) => {
      const next = { ...locationRef.current, ...patch };
      locationRef.current = next;
      const url =
        window.location.pathname +
        serializeViewerLocation(next, window.location.search) +
        window.location.hash;
      if (
        url !==
        window.location.pathname + window.location.search + window.location.hash
      ) {
        window.history[history === "push" ? "pushState" : "replaceState"](
          null,
          "",
          url,
        );
      }
      setLocation(next);
    },
    [],
  );

  const navigate = (tab: ViewerTab) => {
    updateLocation({ tab }, "push");
    setInspectorOpen(false);
    requestAnimationFrame(() => mainRef.current?.focus());
  };
  const openFold = (date: string) => {
    updateLocation({ fold: date });
    setInspectorOpen(true);
  };
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("ripple-theme", next);
    } catch {
      /* optional persistence */
    }
  };
  const toggleMotion = () => {
    const next = !reducedMotion;
    setReducedMotion(next);
    document.documentElement.setAttribute("data-reduced-motion", String(next));
    try {
      localStorage.setItem("ripple-reduced-motion", String(next));
    } catch {
      /* optional persistence */
    }
  };

  const selectedEntry =
    initialIndex.runs.find((r) => r.run_id === selectedRunId) ??
    initialIndex.runs[0];
  const validation = useMemo(
    () => validateLeakageAuditRun(initialRunsByFile[selectedEntry.file]),
    [initialRunsByFile, selectedEntry.file],
  );
  const hashVerified = verifyRunFileHash(selectedEntry, initialHashesByFile);
  const run = validation.ok ? validation.data : null;
  const view = run ? computeComparisonView(run, horizon, model, scope) : null;
  const labelScreen = ["compare", "fold", "method"].includes(activeTab);
  const errors = validation.ok ? [] : [...validation.errors];
  if (initialHashesByFile[selectedEntry.file] && !hashVerified)
    errors.push(
      "Export integrity check failed: file does not match index SHA-256.",
    );
  const effectiveFoldDate =
    selectedFoldDate &&
    view?.allDateRows.some((r) => r.forecast_date === selectedFoldDate)
      ? selectedFoldDate
      : (view?.allDateRows.find((r) => r.is_common_ok)?.forecast_date ??
        view?.allDateRows[0]?.forecast_date ??
        "");
  const boundary = view?.allDateRows.find(
    (r) => r.forecast_date === effectiveFoldDate,
  );

  const evidence = run && (
    <EvidenceDisclosure
      runId={run.run_id}
      schemaVersion={run.schema_version}
      status={run.status}
      source={run.source}
      limitations={run.limitations}
    />
  );
  const boundaryVisual = boundary && (
    <TemporalBoundaryCard
      foldDate={boundary.forecast_date}
      firstTrainDate={
        boundary.corrected?.first_train_date ??
        boundary.original?.first_train_date ??
        boundary.forecast_date
      }
      targetMaturityDate={
        boundary.corrected?.target_maturity_date ?? boundary.forecast_date
      }
      horizonMonths={horizon}
      leakedCount={boundary.original?.leaked_rows?.length ?? 0}
      trainCount={boundary.corrected?.train_count ?? 0}
      latestLabelAvailable={boundary.corrected?.latest_label_available ?? null}
    />
  );
  const chart = view && run && viewMode !== "table" && (
    <ErrorChart
      rows={view.scopedDateRows}
      maePair={view.maePair}
      selectedDate={effectiveFoldDate}
      onSelectDate={openFold}
      onInspectFoldDetail={openFold}
      onSwitchToTable={() => setViewMode("table")}
      chartSummarySentence={view.chartSummarySentence}
      ticker={run.source.ticker}
      horizon={horizon}
      model={model}
      scope={scope}
      windowStart={run.source.window_start}
      windowEnd={run.source.window_end}
    />
  );
  const table = view && (
    <DataTable
      rows={view.scopedDateRows}
      selectedDate={effectiveFoldDate}
      onSelectDate={openFold}
      horizon={horizon}
      model={model}
    />
  );

  return (
    <div className="research-shell min-h-screen bg-canvas text-text">
      <a href="#research-content" className="research-skip-link">
        Skip to research
      </a>
      <RunHeader
        kind={labelScreen ? "leakage_audit" : "portfolio_replay"}
        status={
          labelScreen
            ? errors.length
              ? "invalid"
              : (run?.status ?? "invalid")
            : initialLabBundle?.status === "verified"
              ? "verified"
              : "draft"
        }
        hashVerified={labelScreen && hashVerified}
        showFixtures={location.showFixtures}
        ticker={labelScreen ? selectedEntry.ticker : "4 ETFs"}
        frequency={labelScreen ? "monthly" : "5 sessions"}
        windowStart={
          labelScreen
            ? run?.source.window_start
            : initialLabBundle?.source.window_start
        }
        windowEnd={
          labelScreen
            ? run?.source.window_end
            : initialLabBundle?.source.window_end
        }
        activeTab={activeTab}
        onSelectTab={navigate}
        theme={theme}
        onToggleTheme={toggleTheme}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={toggleMotion}
        runs={initialIndex.runs}
        selectedRunId={selectedRunId}
        onSelectRunId={(run) => updateLocation({ run, fold: null })}
      />

      <main
        id="research-content"
        ref={mainRef}
        tabIndex={-1}
        className="research-main focus:outline-none"
      >
        {activeTab === "overview" && (
          <ResearchOverview
            bundle={initialLabBundle}
            onExplorePortfolio={() => navigate("lab")}
            onExploreLabels={() => navigate("compare")}
          />
        )}
        {activeTab === "lab" && (
          <PhaseLabView
            bundle={initialLabBundle}
            selectedStrategy={location.strategy}
            comparatorStrategy={location.comparator}
            labView={location.labView}
            onSelectStrategy={(strategy) => updateLocation({ strategy })}
            onSelectComparator={(comparator) => updateLocation({ comparator })}
            onSelectLabView={(labView) => updateLocation({ labView })}
          />
        )}

        {labelScreen && errors.length > 0 && (
          <section
            role="alert"
            data-testid="invalid-export-error-screen"
            className="instrument-panel p-6 border-leak"
          >
            <p className="instrument-eyebrow text-leak">
              Label study · render blocked
            </p>
            <h1 className="page-heading">Export checks failed</h1>
            <p className="max-w-prose text-muted my-4">
              This study cannot display partial numbers. Check its required
              metadata and file integrity.
            </p>
            <ul
              data-testid="invalid-export-reasons"
              className="list-disc pl-5 break-words text-sm space-y-2"
            >
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            <button
              type="button"
              data-testid="recover-valid-run-btn"
              onClick={() =>
                updateLocation({ run: initialIndex.default_run_id })
              }
              className="ripple-btn ripple-btn-primary px-4 rounded-lg mt-6"
            >
              Return to default study
            </button>
          </section>
        )}

        {labelScreen && run && view && errors.length === 0 && (
          <>
            {activeTab === "compare" && (
              <div data-testid="screen-compare" className="space-y-8">
                <header className="study-heading">
                  <p className="instrument-eyebrow">
                    Label maturity · controlled experiment
                  </p>
                  <h1 className="page-heading">
                    What was the model allowed to know?
                  </h1>
                  <p className="text-muted max-w-prose mt-3">
                    Compare immature prior labels with labels available at
                    decision time. This reimplementation is separate from the
                    portfolio study and does not execute ML Stock Simulator.
                  </p>
                </header>
                <Selector
                  horizon={horizon}
                  onChangeHorizon={(horizon) =>
                    updateLocation({ horizon, fold: null })
                  }
                  model={model}
                  availableModels={run.models}
                  onChangeModel={(model) => updateLocation({ model })}
                  scope={scope}
                  onChangeScope={(scope) => updateLocation({ scope })}
                  viewMode={viewMode}
                  onChangeViewMode={setViewMode}
                  droppedCount={view.droppedDatesCount}
                />
                {view.isSupported && (
                  <>
                    <section className="finding-summary border-l-2 border-action pl-5 space-y-2">
                      <h2
                        data-testid="finding-headline"
                        className="text-xl sm:text-2xl font-semibold"
                      >
                        {view.findingHeadline}
                      </h2>
                      <p data-testid="finding-subline" className="text-muted">
                        {view.findingSubline}
                      </p>
                      <p
                        data-testid="finding-limitation"
                        className="text-sm text-muted"
                      >
                        Overlapping targets make errors correlated. No
                        significance is claimed.
                      </p>
                      <p
                        data-testid="experiment-scope"
                        className="text-sm text-muted"
                      >
                        Controlled reimplementation, not an execution audit.
                        Differences use unrounded fold errors.
                      </p>
                    </section>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <MetricPair pair={view.maePair} scope={scope} />
                      <MetricPair pair={view.rmsePair} scope={scope} />
                    </div>
                    <div className="workspace-grid">
                      <div className="min-w-0 space-y-6">
                        {phone ? (
                          <>
                            {table}
                            {chart}
                          </>
                        ) : (
                          <>
                            {chart}
                            {table}
                          </>
                        )}
                        {!wide && (
                          <button
                            type="button"
                            data-testid="inspect-selected-fold"
                            onClick={() => setInspectorOpen(true)}
                            className="ripple-btn ripple-btn-secondary px-4 rounded-lg"
                          >
                            Inspect selected decision boundary
                          </button>
                        )}
                      </div>
                      {(wide || inspectorOpen) && (
                        <ResearchInspector
                          overlay={!wide}
                          onClose={() => setInspectorOpen(false)}
                        >
                          <p className="text-sm text-muted mb-4">
                            {effectiveFoldDate} · {formatModelName(model)}
                          </p>
                          <button
                            type="button"
                            onClick={() => navigate("fold")}
                            className="ripple-btn ripple-btn-secondary rounded-lg px-3 mb-4"
                          >
                            Open full fold evidence →
                          </button>
                          <dl className="inspector-facts space-y-5 text-sm">
                            <div>
                              <dt className="text-muted">Matured-label fit</dt>
                              <dd className="mt-1 font-semibold">
                                {boundary?.corrected?.state === "ok"
                                  ? "Scored forecast"
                                  : "Outcome unavailable or skipped"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">
                                Training rows available
                              </dt>
                              <dd className="mt-1 font-mono">
                                {boundary?.corrected?.train_count ??
                                  "Unavailable"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">
                                Latest matured label
                              </dt>
                              <dd className="mt-1 font-mono">
                                {boundary?.corrected?.latest_label_available ??
                                  "Unavailable"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">
                                Immature prior rows in reference
                              </dt>
                              <dd className="mt-1 font-mono">
                                {boundary?.original?.leaked_rows?.length ??
                                  "Unavailable"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">
                                Evaluation target matures
                              </dt>
                              <dd className="mt-1 font-mono">
                                {boundary?.corrected?.target_maturity_date ??
                                  "Unavailable"}
                              </dd>
                            </div>
                          </dl>
                          <p className="text-sm text-muted mt-6 border-t border-border-subtle pt-5">
                            Both variants exclude the forecast row. Only the
                            matured-label fit also excludes prior rows whose
                            outcomes were unavailable at this decision date.
                          </p>
                        </ResearchInspector>
                      )}
                    </div>
                    {evidence}
                  </>
                )}
              </div>
            )}

            {!view.isSupported && activeTab !== "method" && (
              <section
                role="status"
                data-testid="unsupported-comparison-banner"
                className="instrument-panel p-6 mt-6"
              >
                <h2 className="text-xl font-semibold">
                  Selected comparison is unavailable
                </h2>
                <p className="text-muted mt-3 mb-5">{view.unsupportedReason}</p>
                {view.nearestValidSelection && (
                  <button
                    type="button"
                    data-testid="nearest-valid-selection-btn"
                    className="ripple-btn ripple-btn-primary px-4 rounded-lg"
                    onClick={() =>
                      updateLocation({
                        ...view.nearestValidSelection!,
                        fold: null,
                      })
                    }
                  >
                    Switch to nearest available comparison
                  </button>
                )}
              </section>
            )}

            {activeTab === "fold" && view.isSupported && (
              <div data-testid="screen-fold" className="space-y-8">
                <header className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="instrument-eyebrow">
                      Label study · fold inspection
                    </p>
                    <h1 className="page-heading">Draw the boundary.</h1>
                    <p className="text-muted max-w-prose mt-3">
                      One decision date. The training information available
                      then, and the prior labels that crossed the cutoff.
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="back-to-compare-btn"
                    onClick={() => navigate("compare")}
                    className="ripple-btn ripple-btn-secondary px-4 rounded-lg"
                  >
                    ← Back to label study
                  </button>
                </header>
                {boundaryVisual}
                <div className="workspace-grid">
                  <div className="min-w-0">
                    <FoldPanel
                      run={run}
                      selectedDate={effectiveFoldDate}
                      horizon={horizon}
                      selectedModel={model}
                      onSelectDate={(fold) => updateLocation({ fold })}
                    />
                  </div>
                  <aside className="workspace-inspector">
                    <p className="instrument-eyebrow">Reading the evidence</p>
                    <h2 className="text-xl font-semibold mt-3">
                      A date is a constraint.
                    </h2>
                    <p className="text-muted mt-3 leading-relaxed">
                      The unpurged reference excludes the forecast row itself.
                      For a {horizon}-month target, it can still retain{" "}
                      {horizon - 1} prior rows whose outcomes are not yet known.
                      The matured-label fit excludes those rows.
                    </p>
                    <p className="text-sm text-muted mt-4">
                      Skipped and failed folds stay visible. They are not zero
                      errors.
                    </p>
                  </aside>
                </div>
                {evidence}
              </div>
            )}

            {activeTab === "method" && (
              <div data-testid="screen-method" className="space-y-8">
                <header>
                  <p className="instrument-eyebrow">
                    Method · limits · provenance
                  </p>
                  <h1 className="page-heading">
                    Evidence, with its boundaries.
                  </h1>
                  <p className="text-muted max-w-prose mt-3">
                    File integrity, temporal rules, and research validity answer
                    different questions. Ripple keeps them separate.
                  </p>
                </header>
                <div className="workspace-grid">
                  <div className="min-w-0 space-y-8">
                    <section
                      id="method-timing"
                      className="space-y-4 scroll-mt-8"
                    >
                      <h2 className="text-2xl font-semibold">
                        Information available at decision time
                      </h2>
                      <p className="max-w-prose text-muted">
                        Historical session availability is a simulation
                        assumption. Adjusted prices can be revised
                        retrospectively and are not archived point-in-time data
                        vintages.
                      </p>
                      <ul className="list-disc pl-5 space-y-3 max-w-prose">
                        <li>
                          Inputs must be available at or before the decision
                          cutoff.
                        </li>
                        <li>
                          Every supervised training target must have fully
                          matured by that cutoff.
                        </li>
                        <li>
                          Preprocessing learns only from the selected training
                          rows.
                        </li>
                        <li>
                          With fewer than 24 mature monthly labels, record a
                          skipped fold with a reason.
                        </li>
                      </ul>
                    </section>
                    <section
                      id="method-comparison"
                      className="space-y-4 scroll-mt-8"
                    >
                      <h2 className="text-2xl font-semibold">
                        Compare decisions under the same rules
                      </h2>
                      <p className="max-w-prose text-muted">
                        The portfolio study applies one capped
                        inverse-volatility policy, next-session adjusted-open
                        execution, and identical fees. The monthly label
                        experiment uses its own models and targets; it is not a
                        rerun of the predecessor simulator.
                      </p>
                      <p className="max-w-prose text-muted">
                        Historical findings are exploratory. Overlapping monthly
                        targets induce correlated errors; no statistical
                        significance or investment recommendation is inferred
                        from a smaller MAE.
                      </p>
                    </section>
                    <section
                      id="method-integrity"
                      className="space-y-4 scroll-mt-8"
                    >
                      <h2 className="text-2xl font-semibold">
                        Integrity is not independent proof
                      </h2>
                      <p className="max-w-prose text-muted">
                        The index hash checks exported file content. The forward
                        ledger checks chain consistency and event order. Neither
                        independently proves data provenance, wall-clock
                        timestamps, or uninterrupted operation.
                      </p>
                    </section>
                  </div>
                  <aside className="workspace-inspector space-y-5">
                    <p className="instrument-eyebrow">On this page</p>
                    <nav
                      aria-label="Method sections"
                      className="flex flex-col gap-3"
                    >
                      <a
                        className="text-action underline underline-offset-4"
                        href="#method-timing"
                      >
                        Information cutoff
                      </a>
                      <a
                        className="text-action underline underline-offset-4"
                        href="#method-comparison"
                      >
                        Controlled comparisons
                      </a>
                      <a
                        className="text-action underline underline-offset-4"
                        href="#method-integrity"
                      >
                        Integrity and limits
                      </a>
                    </nav>
                    <button
                      type="button"
                      onClick={() => navigate("lab")}
                      className="ripple-btn ripple-btn-secondary px-3 rounded-lg"
                    >
                      Explore portfolio evidence →
                    </button>
                  </aside>
                </div>
                {run && (
                  <EvidenceDisclosure
                    runId={run.run_id}
                    schemaVersion={run.schema_version}
                    status={run.status}
                    source={run.source}
                    limitations={run.limitations}
                    defaultExpanded
                  />
                )}
              </div>
            )}
          </>
        )}
        <footer className="research-footer mt-16 border-t border-border-subtle pt-6 pb-4 flex flex-wrap justify-between gap-3 text-xs text-muted">
          <span>Ripple · Financial ML under pressure</span>
          <span>
            Historical research · virtual portfolios · no live execution
          </span>
        </footer>
      </main>
    </div>
  );
}
