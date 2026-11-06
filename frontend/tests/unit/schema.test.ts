import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  computeComparisonView,
  validateLeakageAuditRun,
} from "../../src/lib/schema";

const runsDir = path.resolve(__dirname, "../../public/runs");

describe("Ripple Frontend Data Contract & Reconciliation", () => {
  it("validates SPY leakage audit export and reconciles every summary metric to fold errors", () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(runsDir, "leakage-audit-spy-2016-2026.json"),
        "utf-8"
      )
    );
    const res = validateLeakageAuditRun(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const run = res.data;
    expect(run.status).toBe("verified");
    expect(run.source.ticker).toBe("SPY");
    expect(run.source.data_sha256.length).toBeGreaterThanOrEqual(64);
    expect(run.source.repo_commit.length).toBeGreaterThanOrEqual(7);

    for (const h of [6, 12]) {
      for (const m of ["arima", "ridge", "random_forest"]) {
        for (const scope of ["common_dates", "all_folds"] as const) {
          const view = computeComparisonView(run, h, m, scope);
          expect(view.isSupported).toBe(true);
          expect(view.maePair.reconciled).toBe(true);
          expect(view.rmsePair.reconciled).toBe(true);
          expect(view.maePair.originalValue).not.toBeNull();
          expect(view.maePair.correctedValue).not.toBeNull();
          expect(view.droppedDatesCount).toBeGreaterThan(0);
          // Skipped folds must be retained in allDateRows
          const skippedRows = view.allDateRows.filter(
            (r) => r.corrected?.state === "skipped_insufficient_labels"
          );
          expect(skippedRows.length).toBe(view.droppedDatesCount);
        }
      }
    }
  });

  it("renders neutral finding sentence when original and corrected errors match (no difference state)", () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(runsDir, "leakage-audit-vnq-null-control.json"),
        "utf-8"
      )
    );
    const res = validateLeakageAuditRun(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const view = computeComparisonView(res.data, 6, "ridge", "common_dates");
    expect(view.findingState).toBe("no_difference");
    expect(view.findingHeadline).toContain("was unchanged at");
    expect(view.maePair.deltaPp).toBe(0);
  });

  it("validates draft run and preserves skipped, model_failed, and unavailable fold states", () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(runsDir, "leakage-audit-gld-draft.json"),
        "utf-8"
      )
    );
    const res = validateLeakageAuditRun(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.status).toBe("draft");
    const corrStates = new Set(
      res.data.folds
        .filter((f) => f.variant === "corrected" && f.model === "ridge")
        .map((f) => f.state)
    );
    expect(corrStates.has("ok")).toBe(true);
    expect(corrStates.has("skipped_insufficient_labels")).toBe(true);
    expect(corrStates.has("model_failed")).toBe(true);
    expect(corrStates.has("unavailable")).toBe(true);
  });

  it("rejects invalid provenance export with explicit error messages and no partial data", () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(runsDir, "invalid-provenance.json"), "utf-8")
    );
    const res = validateLeakageAuditRun(raw);
    expect(res.ok).toBe(false);
    if (res.ok) return;

    expect(
      res.errors.some((e) => e.includes("source.repo_commit"))
    ).toBe(true);
    expect(
      res.errors.some((e) => e.includes("source.data_sha256"))
    ).toBe(true);
  });

  it("handles unsupported comparison selection and offers nearest valid selection", () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(runsDir, "leakage-audit-spy-2016-2026.json"),
        "utf-8"
      )
    );
    const res = validateLeakageAuditRun(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const view = computeComparisonView(res.data, 24, "ridge", "common_dates");
    expect(view.isSupported).toBe(false);
    expect(view.unsupportedReason).toContain("24-month horizon");
    expect(view.nearestValidSelection).not.toBeNull();
  });
});
