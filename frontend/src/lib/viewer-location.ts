import type { RunIndexManifest, ScopeType } from "./schema";

export type ViewerTab = "overview" | "lab" | "compare" | "fold" | "method";
export type LabView = "portfolio" | "stress" | "ledger";
export interface ViewerLocation {
  tab: ViewerTab;
  run: string;
  horizon: number;
  model: string;
  scope: ScopeType;
  fold: string | null;
  strategy: string;
  comparator: string;
  labView: LabView;
  showFixtures: boolean;
}

export function parseViewerLocation(
  search: string,
  index: RunIndexManifest,
): ViewerLocation {
  const params = new URLSearchParams(search);
  const showFixtures = ["1", "true"].includes(params.get("fixtures") ?? "");
  const requestedRun = params.get("run");
  const run =
    index.runs.find(
      (entry) =>
        entry.run_id === requestedRun && (showFixtures || !entry.fixture),
    )?.run_id ?? index.default_run_id;
  const tab = params.get("tab") ?? "overview";
  const horizon = Number(params.get("horizon") ?? 6);
  const labView = params.get("labView") ?? "portfolio";
  return {
    tab: ["overview", "lab", "compare", "fold", "method"].includes(tab)
      ? (tab as ViewerTab)
      : "overview",
    run,
    horizon: Number.isInteger(horizon) && horizon > 0 ? horizon : 6,
    model: params.get("model") || "ridge",
    scope: params.get("scope") === "all_folds" ? "all_folds" : "common_dates",
    fold: params.get("fold"),
    strategy: params.get("strategy") || "forecast_random_forest",
    comparator: params.get("comparator") || "forecast_ewma094",
    labView: ["portfolio", "stress", "ledger"].includes(labView)
      ? (labView as LabView)
      : "portfolio",
    showFixtures,
  };
}

export function serializeViewerLocation(
  location: ViewerLocation,
  search = "",
): string {
  const params = new URLSearchParams(search);
  for (const key of [
    "tab",
    "run",
    "horizon",
    "model",
    "scope",
    "strategy",
    "comparator",
    "labView",
  ] as const) {
    params.set(key, String(location[key]));
  }
  if (location.fold) params.set("fold", location.fold);
  else params.delete("fold");
  if (location.showFixtures) params.set("fixtures", "1");
  else params.delete("fixtures");
  return `?${params.toString()}`;
}
