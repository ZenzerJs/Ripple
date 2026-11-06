import { test, expect, type Page } from "@playwright/test";

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

for (const width of [390, 768, 1440, 1920]) {
  for (const theme of ["light", "dark"] as const) {
    test(`overview remains usable at ${width}px in ${theme} theme`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto("/");
      if (theme === "dark") await page.getByTestId("theme-toggle").click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByTestId("screen-overview")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const art = page.locator(`.ripple-field-${theme}`);
      await expect(art).toBeVisible();
      await expect(art).toHaveJSProperty("complete", true);
      expect(await art.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(page.getByTestId("theme-toggle")).toContainText(
        theme === "light" ? "Still Water" : "Deep Water",
      );
      const identity = await page.locator("h1").evaluate((element) => ({
        font: getComputedStyle(element).fontFamily.toLowerCase(),
        canvas: getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim(),
        action: getComputedStyle(document.documentElement).getPropertyValue("--action").trim(),
      }));
      expect(identity.font).toContain("fraunces");
      expect(identity.canvas).toBe(theme === "light" ? "#f6f4ef" : "#0c1417");
      expect(identity.action).toBe(theme === "light" ? "#0b5c73" : "#8fd3e6");
      await expect(
        page.getByRole("heading", {
          name: /follow the forecast[.\s]+find the failure/i,
        }),
      ).toBeVisible();
      await expect(page.getByTestId("cta-explore-portfolio")).toBeVisible();
      await expect(page.getByTestId("cta-explore-labels")).toBeVisible();
      await expect(page.getByTestId("finding-card")).toHaveCount(0);
      await expect(page.getByTestId("fold-data-table")).toHaveCount(0);
      for (const tab of ["overview", "lab", "compare", "method"]) {
        const button = page.getByTestId(`nav-${tab}`);
        await expect(button).toBeVisible();
        expect((await button.innerText()).trim().length).toBeGreaterThan(0);
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      }
      await expectNoPageOverflow(page);
      await page.screenshot({
        path: `test-results/overview-${width}-${theme}.png`,
        animations: "disabled",
        fullPage: true,
      });
    });
  }
}

test("portfolio and label entry points open the relevant research", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("cta-explore-portfolio").click();
  await expect(page.getByTestId("phase-lab-view")).toBeVisible();
  await expect(page.getByTestId("lab-select-policy")).toHaveValue(
    "forecast_random_forest",
  );
  await expect(page.getByTestId("lab-select-baseline")).toHaveValue(
    "forecast_ewma094",
  );
  await expect(page.getByTestId("lab-portfolio-table")).toContainText(
    "GARCH(1,1)",
  );
  await page.getByTestId("lab-view-stress").click();
  await expect(page.getByTestId("lab-stress-summary")).toContainText(
    "search_b5_s104",
  );
  await expect(page.getByTestId("lab-stress-summary")).toContainText("14 / 15");
  await page.getByTestId("lab-view-ledger").click();
  await expect(page.getByTestId("lab-forward-ledger")).toContainText(
    "Chain consistency verified",
  );
  await page.getByTestId("nav-overview").click();
  await page.getByTestId("cta-explore-labels").click();
  await expect(page.getByTestId("screen-compare")).toBeVisible();
  await expect(page.getByTestId("finding-headline")).toContainText(
    "Matured-label 6-month MAE",
  );
  await expect(page.getByTestId("finding-limitation")).toContainText(
    "Overlapping targets make errors correlated",
  );
});

test("comparison reconciles metrics and preserves skipped fold details", async ({
  page,
}) => {
  await page.goto("/?tab=compare");
  await expect(page.getByTestId("status-badge-verified")).toContainText(
    "Export integrity checked",
  );
  await expect(page.getByTestId("run-selector").locator("option")).toHaveCount(
    2,
  );
  await expect(page.getByTestId("metric-pair-mae")).toContainText("Reconciled");
  await expect(page.getByTestId("metric-pair-rmse")).toContainText(
    "Reconciled",
  );
  await page.getByTestId("horizon-12").click();
  await expect(page.getByTestId("metric-mae-dropped")).toContainText("11");
  await page.getByTestId("table-filter-skipped").click();
  await expect(page.getByTestId("fold-data-table")).toContainText(
    "Skipped: too few matured labels",
  );
  await expect(page.getByTestId("fold-data-table")).toContainText(
    "unavailable",
  );
  await page.getByTestId("table-row-2018-06-29").click();
  await expect(page.getByTestId("chart-active-readout")).toContainText(
    "2018-06-29",
  );
  await expect(page.getByTestId("chart-active-readout")).toContainText(
    "Skipped · Insufficient labels",
  );
  await page.keyboard.press("Escape");
  await page.getByTestId("table-filter-all").click();
  await page.getByTestId("sort-corr-err-btn").click();
  await expect(
    page.locator('[data-testid^="table-row-"]').first(),
  ).not.toContainText("Skipped · Insufficient labels");
  await page.goto("/?tab=fold&horizon=12");
  await page.getByTestId("fold-jump-skipped").click();
  await expect(page.getByTestId("fold-non-ok-banner")).toContainText(
    "Skipped: too few matured labels",
  );
});

test("fixtures stay gated and invalid, draft, and null states remain explicit", async ({
  page,
}) => {
  await page.goto("/?tab=compare&run=leakage-audit-gld-draft");
  await expect(page.getByTestId("run-selector").locator("option")).toHaveCount(
    2,
  );
  await expect(page.getByTestId("run-selector")).toHaveValue(
    "leakage-audit-spy-2016-2026",
  );
  await page.goto(
    "/?fixtures=1&tab=compare&run=leakage-audit-spy-2016-2026&horizon=24&model=unknown_model",
  );
  await expect(page.getByTestId("unsupported-comparison-banner")).toBeVisible();
  await page.getByTestId("nearest-valid-selection-btn").click();
  await expect(page.getByTestId("unsupported-comparison-banner")).toHaveCount(
    0,
  );
  await page
    .getByTestId("run-selector")
    .selectOption("leakage-audit-vnq-null-control");
  await expect(page.getByTestId("metric-pair-mae")).toContainText("No change");
  await page.goto("/?fixtures=1&tab=overview&run=leakage-audit-gld-draft");
  await expect(page.getByTestId("screen-overview")).toBeVisible();
  await expect(page.getByTestId("finding-card")).toHaveCount(0);
  await page.goto("/?fixtures=1&tab=fold&run=leakage-audit-gld-draft");
  await expect(page.getByTestId("draft-run-banner")).toBeVisible();
  await page.getByTestId("fold-jump-failed").click();
  await expect(page.getByTestId("fold-state-badge")).toContainText(
    "Failed · Nonconverged",
  );
  await expect(page.getByTestId("fold-non-ok-banner")).toContainText(
    "UI fixture: injected model_failed state",
  );
  await page.getByTestId("fold-jump-unavailable").click();
  await expect(page.getByTestId("fold-state-badge")).toContainText(
    "Unavailable · Missing input",
  );
  await expect(page.getByTestId("fold-non-ok-banner")).toContainText(
    "UI fixture: injected unavailable state",
  );
  await page
    .getByTestId("run-selector")
    .selectOption("invalid-provenance-fixture");
  await expect(page.getByTestId("invalid-export-error-screen")).toBeVisible();
  await expect(page.getByTestId("invalid-export-reasons")).toContainText(
    "source.repo_commit",
  );
  await page.getByTestId("nav-overview").click();
  await expect(page.getByTestId("screen-overview")).toBeVisible();
  await page.getByTestId("nav-lab").click();
  await expect(page.getByTestId("phase-lab-view")).toBeVisible();
  await page.getByTestId("nav-compare").click();
  await expect(page.getByTestId("invalid-export-error-screen")).toBeVisible();
  await page.getByTestId("recover-valid-run-btn").click();
  await expect(page.getByTestId("screen-compare")).toBeVisible();
});

test("browser history restores navigation and replaced portfolio selections", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("nav-lab").click();
  await page.getByTestId("lab-select-policy").selectOption("forecast_garch11");
  await page.getByTestId("lab-select-baseline").selectOption("equal_weight_5d");
  await page.getByTestId("lab-view-stress").click();
  await expect(page).toHaveURL(/strategy=forecast_garch11/);
  await expect(page).toHaveURL(/comparator=equal_weight_5d/);
  await expect(page).toHaveURL(/labView=stress/);
  await page.getByTestId("nav-compare").click();
  await page.goBack();
  await expect(page.getByTestId("lab-stress-summary")).toBeVisible();
  await page.getByTestId("lab-view-portfolio").click();
  await expect(page.getByTestId("lab-select-policy")).toHaveValue(
    "forecast_garch11",
  );
  await expect(page.getByTestId("lab-select-baseline")).toHaveValue(
    "equal_weight_5d",
  );
  await page.goForward();
  await expect(page.getByTestId("screen-compare")).toBeVisible();
  await page.goBack();
  await page.goBack();
  await expect(page.getByTestId("screen-overview")).toBeVisible();
});

test("phone compare is table-first and inspector closes with Escape and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?tab=compare");
  const table = page.getByTestId("fold-data-table");
  await expect(table).toBeVisible();
  const chart = page.getByTestId("error-chart");
  if (await chart.isVisible()) {
    expect((await table.boundingBox())!.y).toBeLessThan(
      (await chart.boundingBox())!.y,
    );
  }
  const trigger = page.getByTestId("inspect-selected-fold");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByTestId("compare-fold-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("role", "dialog");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await expectNoPageOverflow(page);
});

test("narrow, landscape, reduced-motion and enlarged text remain navigable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const size of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
    { width: 720, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
    // Approximate text enlargement with a reflow viewport; this is not native browser zoom.
    await page.addStyleTag({
      content: "p, button, select { font-size: 200% !important; line-height: 1.5 !important; }",
    });
    await expect(page.getByTestId("cta-explore-portfolio")).toBeVisible();
    const brand = await page.getByRole("button", { name: /Ripple home/ }).boundingBox();
    const settings = await page.getByRole("button", { name: /Switch to .* theme/ }).boundingBox();
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(settings!.x);
    const nav = await page.getByRole("navigation", { name: "Primary viewer screens" }).boundingBox();
    expect(nav!.y).toBeGreaterThanOrEqual(settings!.y + settings!.height);
    await expectNoPageOverflow(page);
    await page.getByTestId("nav-compare").click();
    await expect(page.getByTestId("screen-compare")).toBeVisible();
    await expectNoPageOverflow(page);
    await page.screenshot({
      path: `test-results/compare-${size.width}-reduced-large-text.png`,
      animations: "disabled",
      fullPage: true,
    });
  }
});

test("wide research workspaces use the available space", async ({ page }) => {
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?tab=lab");
    await expect(page.getByTestId("lab-portfolio-table")).toBeVisible();
    if (width === 1920)
      expect((await page.locator("main").boundingBox())!.width).toBeGreaterThan(
        1120,
      );
    await expectNoPageOverflow(page);
    await page.screenshot({
      path: `test-results/lab-${width}.png`,
      animations: "disabled",
      fullPage: true,
    });
  }
  await page.goto("/?tab=compare");
  await expect(page.getByTestId("compare-fold-sheet")).toBeVisible();
  await page.screenshot({
    path: "test-results/compare-1920-inspector.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?tab=fold");
  await expect(page.getByTestId("screen-fold")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: "test-results/fold-375.png",
    animations: "disabled",
    fullPage: true,
  });
});
