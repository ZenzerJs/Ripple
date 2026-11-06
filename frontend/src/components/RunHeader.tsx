"use client";

import React from "react";
import { RunIndexEntry, RunStatus } from "@/lib/schema";
import { BrandMark } from "./BrandMark";

export type ScreenTab = "overview" | "compare" | "fold" | "method" | "lab";

interface RunHeaderProps {
  kind: string;
  status: RunStatus | "invalid" | "unavailable";
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
  const labelContext =
    activeTab === "compare" || activeTab === "fold" || activeTab === "method";
  const selectableRuns = runs.filter((run) => showFixtures || !run.fixture);
  const navItems: Array<{ id: ScreenTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "lab", label: "Portfolio lab" },
    { id: "compare", label: "Label study" },
    ...(activeTab === "fold"
      ? [{ id: "fold" as const, label: "Fold detail" }]
      : []),
    { id: "method", label: "Method" },
  ];

  return (
    <header className="research-header">
      <div className="research-sidebar">
        <button
          type="button"
          onClick={() => onSelectTab("overview")}
          className="research-brand"
          aria-label="Ripple home — return to Overview"
        >
          <BrandMark className="h-9 w-9 shrink-0 text-action" />
          <span>
            <span className="research-wordmark">Ripple</span>
            <span className="research-brand-subtitle">Research viewer</span>
          </span>
        </button>
        <nav aria-label="Primary viewer screens" className="research-nav">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-${item.id}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelectTab(item.id)}
                className={`research-nav-item${isActive ? " is-active" : ""}${item.id === "fold" ? " is-child" : ""}`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="research-settings" aria-label="Display settings">
          <button
            type="button"
            data-testid="theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "light" ? "Deep water (dark)" : "Still water (light)"} theme`}
            className="research-setting"
          >
            <span className="theme-swatch" aria-hidden="true" />
            <span>{theme === "light" ? "Still Water" : "Deep Water"}</span>
          </button>
          <button
            type="button"
            data-testid="motion-toggle"
            onClick={onToggleReducedMotion}
            aria-pressed={reducedMotion}
            aria-label="Toggle reduced motion"
            className="research-setting"
          >
            Motion <span>{reducedMotion ? "Off" : "On"}</span>
          </button>
        </div>
      </div>
      {labelContext && (
        <div className="research-context">
          {status === "draft" && (
            <div
              role="status"
              aria-live="polite"
              data-testid="draft-run-banner"
              className="research-alert research-alert-warning"
            >
              <strong>Unverified draft run:</strong> This export has draft
              status and has not passed final release sign-off. It is excluded
              from the Overview summary.
            </div>
          )}
          {status === "invalid" && (
            <div
              role="alert"
              data-testid="invalid-run-banner"
              className="research-alert research-alert-invalid"
            >
              <strong>Invalid export blocked:</strong> Schema or mandatory
              provenance check failed. Partial rendering is disabled.
            </div>
          )}
          <div data-testid="run-status-line" className="research-run-line">
            <div className="research-run-meta">
              <span>
                {kind === "leakage_audit"
                  ? "Label study"
                  : "Portfolio & stress lab"}{" "}
                / {ticker} {frequency.toUpperCase()}
              </span>
              <span
                className={`research-status research-status-${status}`}
                data-testid={`status-badge-${status}`}
              >
                <span aria-hidden="true" className="research-status-dot" />
                {status === "verified"
                  ? hashVerified
                    ? "Export integrity checked"
                    : "Export integrity unchecked"
                  : status === "draft"
                    ? "Draft"
                    : status === "invalid"
                      ? "Invalid"
                      : "Unavailable"}
              </span>
              <span>
                Window: {windowStart ?? "2016-01-29"} to{" "}
                {windowEnd ?? "2026-10-30"}
              </span>
            </div>
            <label className="research-run-select">
              <span className="sr-only">Select exported audit run</span>
              <select
                id="header-run-select"
                data-testid="run-selector"
                value={selectedRunId}
                onChange={(event) => onSelectRunId(event.target.value)}
              >
                {selectableRuns.map((run) => (
                  <option key={run.run_id} value={run.run_id}>
                    {run.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
    </header>
  );
}
