import { test, expect } from "@playwright/test";

test.describe("Ripple Frontend Viewer E2E", () => {
  test("renders Still water light theme by default, toggles Deep water dark theme, and passes 30-second Overview & Compare reconciliation", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Default theme is Still water (light)
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");

    // 2. Overview screen question, templated finding, visible limitation, and temporal boundary
    await expect(page.getByTestId("overview-question-heading")).toContainText(
      "Did fixing look-ahead leakage change the forecast errors?"
    );
    await expect(page.getByTestId("finding-headline")).toContainText(
      "Corrected 6-month MAE"
    );
    await expect(page.getByTestId("finding-limitation")).toContainText(
      "Overlapping targets make errors correlated. No significance is claimed."
    );
    await expect(page.getByTestId("boundary-leaked-segment")).toContainText(
      "6 leaked rows"
    );
    await expect(page.getByTestId("boundary-leak-callout")).toContainText(
      "Future labels were included in the original run"
    );

    // 3. Toggle to Deep water (dark) and verify attribute change
    await page.getByTestId("theme-toggle").click();
    await expect(html).toHaveAttribute("data-theme", "dark");

    // 4. Navigate to Compare screen via primary CTA
    await page.getByTestId("cta-explore-comparison").click();
    await expect(page.getByTestId("screen-compare")).toBeVisible();

    // 5. Verify MetricPair MAE & RMSE and 12-month horizon toggle
    await expect(page.getByTestId("metric-pair-mae")).toContainText(
      "Reconciled"
    );
    await expect(page.getByTestId("metric-pair-rmse")).toContainText(
      "Reconciled"
    );
    await page.getByTestId("horizon-12").click();
    await expect(page.getByTestId("metric-mae-dropped")).toContainText("12");

    // 6. Verify Skipped fold rows are preserved in DataTable as "unavailable" with text reason
    await page.getByTestId("table-filter-skipped").click();
    await expect(page.getByTestId("fold-data-table")).toContainText(
      "Skipped: too few matured labels"
    );
    await expect(page.getByTestId("fold-data-table")).toContainText(
      "unavailable"
    );

    // 7. Navigate to Fold detail and verify skipped and matured fold inspection
    await page.getByTestId("nav-fold").click();
    await expect(page.getByTestId("screen-fold")).toBeVisible();
    await page.getByTestId("fold-jump-skipped").click();
    await expect(page.getByTestId("fold-non-ok-banner")).toContainText(
      "Skipped: too few matured labels"
    );
  });

  test("handles Draft run banner, Null-difference run, Invalid provenance block, and Phase 3-6 Lab view", async ({
    page,
  }) => {
    await page.goto("/?tab=compare");

    // 1. Select Null-Difference Control Run
    await page
      .getByTestId("run-selector")
      .selectOption("leakage-audit-vnq-null-control");
    await page.getByTestId("nav-overview").click();
    await expect(page.getByTestId("finding-headline")).toContainText(
      "was unchanged at"
    );

    // 2. Switch to Compare and select Draft run (GLD) -> verify persistent unverified banner
    await page.getByTestId("nav-compare").click();
    await page
      .getByTestId("run-selector")
      .selectOption("leakage-audit-gld-draft");
    await expect(page.getByTestId("draft-run-banner")).toBeVisible();
    await expect(page.getByTestId("status-badge-draft")).toContainText("Draft");

    // 3. Select Invalid Provenance Fixture -> verify full block and error reasons
    await page
      .getByTestId("run-selector")
      .selectOption("invalid-provenance-fixture");
    await expect(
      page.getByTestId("invalid-export-error-screen")
    ).toBeVisible();
    await expect(page.getByTestId("invalid-export-reasons")).toContainText(
      "source.repo_commit"
    );
    await page.getByTestId("recover-valid-run-btn").click();
    await expect(page.getByTestId("screen-compare")).toBeVisible();

    // 4. Open Phase 3-6 Portfolio & Stress Lab view
    await page.getByTestId("nav-lab").click();
    await expect(page.getByTestId("phase-lab-view")).toBeVisible();
    await expect(page.getByTestId("lab-portfolio-table")).toContainText(
      "forecast_garch11"
    );
    await expect(page.getByTestId("lab-stress-section")).toContainText(
      "search_b5_s104"
    );
    await expect(page.getByTestId("lab-forward-ledger")).toContainText(
      "Chain Verified"
    );
  });

  test("narrow mobile screen (375px) renders readable Overview and Compare without horizontal page overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await expect(page.getByTestId("overview-question-heading")).toBeVisible();
    await expect(page.getByTestId("finding-card")).toBeVisible();

    const overflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      );
    });
    expect(overflow).toBe(false);
  });
});
