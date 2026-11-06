import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import type { RunIndexManifest } from "../../src/lib/schema";
import {
  parseViewerLocation,
  serializeViewerLocation,
} from "../../src/lib/viewer-location";

const index: RunIndexManifest = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../public/runs/index.json"),
    "utf8",
  ),
);

describe("viewer URL state", () => {
  it("defaults to the portfolio-led overview and gates fixture runs", () => {
    const location = parseViewerLocation("?run=leakage-audit-gld-draft", index);
    expect(location).toMatchObject({
      tab: "overview",
      run: index.default_run_id,
      showFixtures: false,
      horizon: 6,
      model: "ridge",
      scope: "common_dates",
      fold: null,
      strategy: "forecast_random_forest",
      comparator: "forecast_ewma094",
      labView: "portfolio",
    });
    expect(
      parseViewerLocation("?fixtures=1&run=leakage-audit-gld-draft", index),
    ).toMatchObject({
      run: "leakage-audit-gld-draft",
      showFixtures: true,
    });
  });

  it("retains legacy label links and unsupported comparisons for recovery", () => {
    expect(
      parseViewerLocation(
        "?tab=compare&horizon=24&model=unknown_model&scope=all_folds&fold=2018-06-29",
        index,
      ),
    ).toMatchObject({
      tab: "compare",
      horizon: 24,
      model: "unknown_model",
      scope: "all_folds",
      fold: "2018-06-29",
    });
    expect(
      parseViewerLocation(
        "?tab=unknown&horizon=-1&scope=invalid&labView=invalid",
        index,
      ),
    ).toMatchObject({
      tab: "overview",
      horizon: 6,
      scope: "common_dates",
      labView: "portfolio",
    });
  });

  it("round-trips all viewer selections and preserves unrelated parameters", () => {
    const original = parseViewerLocation(
      "?fixtures=true&run=leakage-audit-gld-draft&tab=lab&strategy=forecast_garch11&comparator=equal_weight_5d&labView=stress&fold=2018-06-29",
      index,
    );
    const search = serializeViewerLocation(
      original,
      "?campaign=research&fold=old",
    );
    expect(new URLSearchParams(search).get("campaign")).toBe("research");
    expect(parseViewerLocation(search, index)).toEqual(original);
    const cleared = serializeViewerLocation(
      {
        ...original,
        showFixtures: false,
        fold: null,
        run: index.default_run_id,
      },
      search,
    );
    expect(new URLSearchParams(cleared).has("fixtures")).toBe(false);
    expect(new URLSearchParams(cleared).has("fold")).toBe(false);
    expect(new URLSearchParams(cleared).get("campaign")).toBe("research");
  });
});
