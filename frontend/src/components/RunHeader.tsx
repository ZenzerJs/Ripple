"use client";

import React from "react";
import { RunIndexEntry, RunStatus } from "@/lib/schema";

export type ScreenTab = "overview" | "compare" | "fold" | "method" | "lab";

interface RunHeaderProps {
  kind: string;
  status: RunStatus | "invalid";
  hashVerified?: boolean;
  showFixtures?: boolean;
  ticker: string;
  frequency: string;
  windowStart?: string;
  windowEnd?: string;
  activeTab: ScreenTab;
  onSelectTab: (tab: ScreenTab) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  runs: RunIndexEntry[];
  selectedRunId: string;
  onSelectRunId: (runId: string) => void;
}

export function RunHeader({
  kind,
  status,
  hashVerified = false,
  showFixtures = false,
  ticker,
  frequency,
  windowStart,
  windowEnd,
  activeTab,
  onSelectTab,
  theme,
  onToggleTheme,
  reducedMotion,
  onToggleReducedMotion,
  runs,
  selectedRunId,
  onSelectRunId,
}: RunHeaderProps) {
  const startYear = windowStart ? windowStart.slice(0, 4) : "2016";
  const endYear = windowEnd ? windowEnd.slice(0, 4) : "2026";
  const kindLabel =
    kind === "leakage_audit" ? "TEMPORAL INTEGRITY" : "PORTFOLIO & STRESS LAB";

  const selectableRuns = runs.filter((r) => showFixtures || !r.fixture);

  const navItems: Array<{ id: ScreenTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "compare", label: "Compare" },
    { id: "fold", label: "Fold detail" },
    { id: "method", label: "Method" },
    { id: "lab", label: "Phase 3–6 Lab" },
  ];

  return (
    <header className="w-full border-b border-border-subtle bg-canvas/95 sticky top-0 z-30 backdrop-blur-sm">
      {/* Top research & provenance strip matching mockup */}
      <div className="w-full border-b border-border-subtle/60 bg-raised/50 py-1.5 px-4 text-center text-[12px] text-muted">
        <span>
          Historical research · verified local export · virtual funds only
        </span>
      </div>

      {/* Persistent unverified banner when viewing a draft run */}
      {status === "draft" && (
        <div
          role="status"
          aria-live="polite"
          data-testid="draft-run-banner"
          className="w-full bg-warn-tint border-b border-warn px-4 py-2.5 text-center text-[14px] font-medium text-text"
        >
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-warn" />
            <strong>Unverified draft run:</strong> This export has status{" "}
            <code className="font-mono text-[12px] px-1.5 py-0.5 rounded bg-surface border border-warn">
              draft
            </code>{" "}
            and has not passed final release sign-off. It is excluded from the Overview summary.
          </span>
        </div>
      )}

      {/* Persistent invalid banner when viewing an invalid run */}
      {status === "invalid" && (
        <div
          role="alert"
          data-testid="invalid-run-banner"
          className="w-full bg-leak-tint border-b border-leak px-4 py-2.5 text-center text-[14px] font-medium text-text"
        >
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-leak" />
            <strong>Invalid export blocked:</strong> Schema or mandatory provenance check failed. Partial rendering is disabled.
          </span>
        </div>
      )}

      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
          {/* Brand Logo: Concentric ripple rings + Ripple */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectTab("overview")}
              className="group inline-flex items-center gap-2.5 cursor-pointer rounded-lg py-1 pr-2 text-left"
              aria-label="Ripple home — return to Overview"
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 32 32"
                fill="none"
                aria-hidden="true"
                className="text-action transition-transform duration-200 group-hover:scale-105"
              >
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeOpacity="0.45"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeOpacity="0.75"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
                <circle cx="16" cy="16" r="2" fill="currentColor" />
              </svg>
              <span className="text-[20px] font-semibold tracking-tight text-text">
                Ripple
              </span>
            </button>
          </div>

          {/* Primary Screen Navigation Tabs */}
          <nav
            aria-label="Primary viewer screens"
            className="flex items-center gap-1 sm:gap-2 overflow-x-auto"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`nav-${item.id}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSelectTab(item.id)}
                  className={`relative min-h-[44px] px-3 py-2 text-[14px] font-medium cursor-pointer transition-colors duration-150 rounded-t-md ${
                    isActive
                      ? "text-text font-semibold"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span
                      data-layout-id="active-nav-indicator"
                      className="absolute bottom-0 left-2 right-2 h-[2.5px] rounded-full bg-action transition-all duration-200"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Run Selector + Theme Toggle (Still water / Deep water) + Motion Toggle */}
          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <label htmlFor="header-run-select" className="sr-only">
              Select exported audit run
            </label>
            <select
              id="header-run-select"
              data-testid="run-selector"
              value={selectedRunId}
              onChange={(e) => onSelectRunId(e.target.value)}
              className="min-h-[44px] max-w-[200px] sm:max-w-xs truncate rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[14px] text-text cursor-pointer"
            >
              {selectableRuns.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              data-testid="theme-toggle"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === "light" ? "Deep water (dark)" : "Still water (light)"} theme`}
              title={`Current theme: ${theme === "light" ? "Still water (light)" : "Deep water (dark)"}`}
              className="ripple-btn ripple-btn-secondary ripple-knob rounded-lg px-3 py-1.5 text-[14px]"
            >
              <span key={theme} className="ripple-icon-swap inline-flex items-center gap-1.5">
                {theme === "light" ? (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                    </svg>
                    <span className="hidden md:inline">Still water</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                    <span className="hidden md:inline">Deep water</span>
                  </>
                )}
              </span>
            </button>

            <button
              type="button"
              data-testid="motion-toggle"
              onClick={onToggleReducedMotion}
              aria-pressed={reducedMotion}
              aria-label="Toggle reduced motion"
              title={reducedMotion ? "Motion reduced" : "Standard motion active"}
              className={`ripple-btn rounded-lg px-2.5 py-1.5 text-[12px] border ${
                reducedMotion
                  ? "bg-raised border-action text-text font-semibold"
                  : "bg-surface border-border-strong text-muted hover:text-text"
              }`}
            >
              {reducedMotion ? "Motion: Off" : "Motion: On"}
            </button>
          </div>
        </div>

        {/* Status line on every screen: run kind, verification status, data window */}
        <div
          data-testid="run-status-line"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle/70 py-2.5 text-[12px] tracking-[0.07em] uppercase text-muted font-mono"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {kindLabel} / {ticker} {frequency.toUpperCase()} / {startYear}–
              {endYear}
            </span>
            <span aria-hidden="true">·</span>
            {status === "verified" && (
              <span
                data-testid="status-badge-verified"
                className="inline-flex items-center gap-1.5 rounded-full bg-ok-tint px-2.5 py-0.5 text-[12px] font-semibold tracking-normal normal-case text-text border border-ok"
              >
                <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
                {hashVerified
                  ? "Exported · SHA-256 verified"
                  : "Exported · Unchecked hash"}
              </span>
            )}
            {status === "draft" && (
              <span
                data-testid="status-badge-draft"
                className="inline-flex items-center gap-1.5 rounded-full bg-warn-tint px-2.5 py-0.5 text-[12px] font-semibold tracking-normal normal-case text-text border border-warn"
              >
                <span className="h-2 w-2 rounded-full bg-warn" aria-hidden="true" />
                Draft
              </span>
            )}
            {status === "invalid" && (
              <span
                data-testid="status-badge-invalid"
                className="inline-flex items-center gap-1.5 rounded-full bg-leak-tint px-2.5 py-0.5 text-[12px] font-semibold tracking-normal normal-case text-text border border-leak"
              >
                <span className="h-2 w-2 rounded-full bg-leak" aria-hidden="true" />
                Invalid
              </span>
            )}
          </div>
          <div className="text-[12px] tracking-normal normal-case text-muted">
            Window: <span className="tabular-nums">{windowStart ?? "2016-01-29"}</span> to{" "}
            <span className="tabular-nums">{windowEnd ?? "2026-10-30"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
