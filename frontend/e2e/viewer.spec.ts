import { test, expect } from "@playwright/test";

test.describe("Ripple Frontend Viewer E2E", () => {
  test("renders Still water light theme by default, toggles Deep water dark theme, and passes 30-second Overview & Compare reconciliation", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Default theme is Still water (light), SHA-256 badge is verified, and fixtures are hidden by default
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(page.getByTestId("status-badge-verified")).toContainText(
      "Exported · SHA-256 verified"
    );
    await expect(page.getByTestId("run-selector").locator("option")).toHaveCount(2);

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

    // 6. Verify Skipped fold rows are preserved in DataTable as "unavailable" with text reason, and selecting a skipped row in common_dates mode keeps ErrorChart readout synchronized
    await page.getByTestId("table-filter-skipped").click();
    await expect(page.getByTestId("fold-data-table")).toContainText(
      "Skipped: too few matured labels"
    );
    await expect(page.getByTestId("fold-data-table")).toContainText(
      "unavailable"
    );
    await page.getByTestId("table-row-2018-06-29").click();
    await expect(page.getByTestId("chart-active-readout")).toContainText(
      "2018-06-29"
    );
    await expect(page.getByTestId("chart-active-readout")).toContainText(
      "Skipped · Insufficient labels"
    );

    // 7. Verify DataTable numeric sort puts valid numbers first and unavailable rows last
    await page.getByTestId("table-filter-all").click();
    await page.getByTestId("sort-corr-err-btn").click();
    const firstRowText = await page
      .locator('[data-testid^="table-row-"]')
      .first()
      .textContent();
    expect(firstRowText).not.toContain("Skipped · Insufficient labels");

    // 8. Navigate to Fold detail and verify skipped and matured fold inspection
    await page.getByTestId("nav-fold").click();
    await expect(page.getByTestId("screen-fold")).toBeVisible();
    await page.getByTestId("fold-jump-skipped").click();
    await expect(page.getByTestId("fold-non-ok-banner")).toContainText(
      "Skipped: too few matured labels"
    );
  });

  test("handles Draft run exclusion on Overview, Failed & Unavailable fold states, Null-difference run, Invalid provenance block, Unsupported URL recovery, and Phase 3-6 Lab view", async ({
    page,
  }) => {
    // 0. Without ?fixtures=1, a fixture run query param is ignored and only verified public runs appear
    await page.goto("/?run=leakage-audit-gld-draft");
    await expect(page.getByTestId("run-selector").locator("option")).toHaveCount(2);
    await expect(page.getByTestId("run-selector")).toHaveValue(
      "leakage-audit-spy-2016-2026"
    );

    // 1. Tampered URL with unsupported horizon=24 and unknown model (with fixtures=1 enabled) -> verify recovery banner
    await page.goto(
      "/?fixtures=1&tab=compare&run=leakage-audit-spy-2016-2026&horizon=24&model=unknown_model"
    );
    await expect(
      page.getByTestId("unsupported-comparison-banner")
    ).toBeVisible();
    await page.getByTestId("nearest-valid-selection-btn").click();
    await expect(
      page.getByTestId("unsupported-comparison-banner")
    ).toHaveCount(0);

    // 2. Select Null-Difference Control Run (fixture has status=draft, so inspect on Compare)
    await page
      .getByTestId("run-selector")
      .selectOption("leakage-audit-vnq-null-control");
    await expect(page.getByTestId("metric-pair-mae")).toContainText(
      "No change"
    );

    // 3. Select Draft run (GLD) and navigate to Overview -> verify persistent unverified banner AND exclusion from Overview when accessed via URL
    await page.goto("/?fixtures=1&tab=overview&run=leakage-audit-gld-draft");
    await expect(page.getByTestId("draft-run-banner")).toBeVisible();
    await expect(page.getByTestId("status-badge-draft")).toContainText("Draft");
    await expect(
      page.getByTestId("draft-excluded-overview-card")
    ).toBeVisible();
    await page.getByTestId("inspect-draft-in-compare-btn").click();
    await expect(page.getByTestId("screen-compare")).toBeVisible();

    // 4. Inspect Failed and Unavailable folds in FoldPanel on the GLD draft run
    await page.getByTestId("nav-fold").click();
    await page.getByTestId("fold-jump-failed").click();
    await expect(page.getByTestId("fold-state-badge")).toContainText(
      "Failed · Nonconverged"
    );
    await expect(page.getByTestId("fold-non-ok-banner")).toContainText(
      "UI fixture: injected model_failed state"
    );
    await page.getByTestId("fold-jump-unavailable").click();
    await expect(page.getByTestId("fold-state-badge")).toContainText(
      "Unavailable · Missing input"
    );
    await expect(page.getByTestId("fold-non-ok-banner")).toContainText(
      "UI fixture: injected unavailable state"
    );

    // 5. Select Invalid Provenance Fixture -> verify full block and error reasons
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

    // 6. Open Phase 3-6 Portfolio & Stress Lab view
    await page.getByTestId("nav-lab").click();
    await expect(page.getByTestId("phase-lab-view")).toBeVisible();
    await expect(page.getByTestId("lab-portfolio-table")).toContainText(
      "forecast_garch11"
    );
    await expect(page.getByTestId("lab-stress-section")).toContainText(
      "search_b5_s104"
    );
    await expect(page.getByTestId("lab-stress-section")).toContainText(
      "14 / 15"
    );
    await expect(page.getByTestId("lab-forward-ledger")).toContainText(
      "Chain Verified"
    );
  });

  test("narrow mobile screen (375px) renders readable Overview, Compare bottom-sheet FoldPanel, and zero horizontal page overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await expect(page.getByTestId("overview-question-heading")).toBeVisible();
    await expect(page.getByTestId("finding-card")).toBeVisible();
    await expect(page.getByTestId("overview-metrics-strip")).toBeVisible();

    const overflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      );
    });
    expect(overflow).toBe(false);

    // Open Compare and trigger FoldPanel bottom sheet on 375px screen
    await page.getByTestId("cta-explore-comparison").click();
    await page.getByTestId("chart-inspect-fold-btn").click();
    const sheet = page.getByTestId("compare-fold-sheet");
    await expect(sheet).toBeVisible();
    const pos = await sheet.evaluate((el) => getComputedStyle(el).position);
    expect(pos).toBe("fixed");
  });
});
