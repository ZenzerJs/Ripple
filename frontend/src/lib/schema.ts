/**
 * Strict runtime data contract validator and reconciliation helpers for Ripple Frontend.
 * Every number displayed on screen comes from a validated export and reconciles to displayed precision.
 */

export const VALID_FOLD_STATES = [
  "ok",
  "skipped_insufficient_labels",
  "model_failed",
  "unavailable",
] as const;

export type FoldState = (typeof VALID_FOLD_STATES)[number];
export type VariantType = "original" | "corrected";
export type ScopeType = "common_dates" | "all_folds";
export type RunStatus = "verified" | "draft";

export interface LeakedRowMeta {
  row_date: string;
  label_matured_date: string;
  return_pct: number;
}

export interface AuditFold {
  forecast_date: string;
  horizon_months: number;
  variant: VariantType;
  model: string;
  state: FoldState;
  state_reason?: string | null;
  prediction_pct: number | null;
  actual_pct: number | null;
  train_count: number;
  first_train_date?: string | null;
  last_train_date?: string | null;
  latest_label_available: string | null;
  target_maturity_date?: string | null;
  leaked_rows?: LeakedRowMeta[];
}

export interface AuditSummaryRow {
  horizon_months: number;
  variant: VariantType;
  model: string;
  metric: "mae" | "rmse";
  value: number;
  n_folds: number;
  scope: ScopeType;
}

export interface AuditSource {
  repo_commit: string;
  data_sha256: string;
  ticker: string;
  frequency: string;
  decision_time: string;
  window_start?: string;
  window_end?: string;
}

export interface LeakageAuditRun {
  schema_version: "1.0";
  run_id: string;
  kind: "leakage_audit";
  status: RunStatus;
  source: AuditSource;
  variants: VariantType[];
  models: string[];
  folds: AuditFold[];
  summary: AuditSummaryRow[];
  limitations: string[];
}

export interface RunIndexEntry {
  run_id: string;
  file: string;
  label: string;
  ticker: string;
  status: "verified" | "draft" | "invalid";
  kind: string;
  fixture?: boolean;
  sha256?: string;
}

export interface RunIndexManifest {
  schema_version: string;
  default_run_id: string;
  runs: RunIndexEntry[];
  lab_bundle_file: string;
}

export interface PortfolioMetricRow {
  strategy: string;
  final_equity: number;
  net_return: number;
  cagr: number;
  annualized_volatility: number;
  sharpe: number;
  max_drawdown: number;
  turnover: number;
  total_costs: number;
  rebalance_count: number;
  skipped_decisions: number;
  max_asset_weight: number;
  mean_cash_weight: number;
  mean_weights: Record<string, number>;
}

export interface EquityPoint {
  session: string;
  equity: number;
  drawdown_pct: number;
  turnover: number;
  cost: number;
}

export interface ForwardLedgerRecord {
  sequence_no: number;
  run_id: string;
  event_type: string;
  status: string;
  strategy_id: string;
  model_id: string;
  scheduled_utc: string;
  observation_cutoff_utc: string;
  recorded_utc: string;
  execution_convention: string;
  code_commit_sha: string;
  config_sha256: string;
  dataset_sha256: string;
  prev_record_hash: string;
  record_hash: string;
  proposed_weights: Record<string, number> | null;
  cash_weight: number | null;
  error_reason: string | null;
}

export interface PortfolioReplayBundle {
  schema_version: "1.0";
  run_id: string;
  kind: "portfolio_replay";
  status: "verified" | "unavailable";
  source: {
    repo_commit: string;
    data_sha256: string;
    raw_sha256?: string;
    config_sha256?: string;
    universe: string[];
    execution_convention: string;
    fee_bps: number;
    max_weight: number;
    invalid_policy: string;
    window_start: string;
    window_end: string;
    scheduled_decision_sessions: number;
  };
  portfolio_metrics: PortfolioMetricRow[];
  forecast_metrics: {
    common_decision_sessions: number;
    total_decision_sessions: number;
    models: Record<
      string,
      {
        status_counts: Record<string, number>;
        overall_raw_scored: {
          count: number;
          mae: number;
          rmse: number;
          qlike: number;
          invalid_variance_count: number;
        };
        common_dates_scored: {
          count: number;
          mae: number;
          rmse: number;
          qlike: number;
        };
      }
    >;
  };
  equity_curves: Record<string, EquityPoint[]>;
  decision_audit_samples: Record<string, Array<Record<string, unknown>>>;
  stress_summary: {
    dataset_sha256?: string;
    search_budget?: Record<string, unknown>;
    verdict_counts?: Record<string, number>;
    strategy_failure_profiles?: Record<
      string,
      {
        worst_scenario_id: string;
        worst_relative_return_vs_ew5d: number;
        median_relative_return_vs_ew5d: number;
        underperformed_ew5d_count: number;
        valid_scenario_count: number;
      }
    >;
    worst_valid_scenario?: {
      scenario_id?: string;
      block_length?: number;
      seed?: number;
      path_sha256?: string;
      realism?: {
        verdict?: string;
        reasons?: string[];
      };
      strategies?: Record<
        string,
        {
          net_return: number;
          relative_return_vs_ew5d: number;
          max_drawdown: number;
          annualized_volatility: number;
          sharpe: number;
          turnover: number;
          total_costs: number;
        }
      >;
    };
  };
  forward_ledger: {
    verification: {
      valid: boolean;
      record_count: number;
      run_ids?: string[];
      latest_record_hash?: string;
    };
    records: ForwardLedgerRecord[];
  };
  limitations: string[];
}

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: string[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate a raw JSON object against the Ripple v1.0 leakage_audit data contract.
 * Refuses to render any file missing schema_version, provenance hashes, or valid fold states.
 */
export function validateLeakageAuditRun(
  raw: unknown
): ValidationResult<LeakageAuditRun> {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: ["Export root must be a JSON object."] };
  }

  if (raw.schema_version !== "1.0") {
    errors.push(
      `Unsupported or missing schema_version: expected "1.0", received ${JSON.stringify(raw.schema_version)}.`
    );
  }
  if (raw.kind !== "leakage_audit") {
    errors.push(
      `Invalid run kind: expected "leakage_audit", received ${JSON.stringify(raw.kind)}.`
    );
  }
  if (typeof raw.run_id !== "string" || raw.run_id.trim().length === 0) {
    errors.push("Missing or empty run_id.");
  }
  if (raw.status !== "verified" && raw.status !== "draft") {
    errors.push(
      `Invalid run status: expected "verified" or "draft", received ${JSON.stringify(raw.status)}.`
    );
  }

  // Provenance check (mandatory per spec)
  if (!isRecord(raw.source)) {
    errors.push("Missing required source provenance block.");
  } else {
    const src = raw.source;
    if (
      typeof src.repo_commit !== "string" ||
      src.repo_commit.trim().length < 7
    ) {
      errors.push(
        "Provenance check failed: source.repo_commit is missing or empty."
      );
    }
    if (
      typeof src.data_sha256 !== "string" ||
      src.data_sha256.trim().length < 16
    ) {
      errors.push(
        "Provenance check failed: source.data_sha256 is missing or invalid."
      );
    }
    if (typeof src.ticker !== "string" || src.ticker.trim().length === 0) {
      errors.push("Missing source.ticker identifier.");
    }
    if (
      typeof src.frequency !== "string" ||
      typeof src.decision_time !== "string"
    ) {
      errors.push("Missing source.frequency or source.decision_time.");
    }
  }

  if (!Array.isArray(raw.folds) || raw.folds.length === 0) {
    errors.push("Run export contains zero fold records.");
  } else {
    for (let i = 0; i < raw.folds.length; i++) {
      const f = raw.folds[i];
      if (!isRecord(f)) {
        errors.push(`Fold at index ${i} is not an object.`);
        break;
      }
      if (
        typeof f.forecast_date !== "string" ||
        !DATE_RE.test(f.forecast_date)
      ) {
        errors.push(
          `Fold at index ${i} has invalid forecast_date: ${JSON.stringify(f.forecast_date)}.`
        );
        break;
      }
      if (
        !VALID_FOLD_STATES.includes(f.state as FoldState)
      ) {
        errors.push(
          `Fold at ${f.forecast_date} has unrecognized state ${JSON.stringify(f.state)}.`
        );
        break;
      }
      if (f.variant !== "original" && f.variant !== "corrected") {
        errors.push(
          `Fold at ${f.forecast_date} has invalid variant ${JSON.stringify(f.variant)}.`
        );
        break;
      }
      if (f.state === "ok") {
        if (
          typeof f.prediction_pct !== "number" ||
          !Number.isFinite(f.prediction_pct) ||
          typeof f.actual_pct !== "number" ||
          !Number.isFinite(f.actual_pct)
        ) {
          errors.push(
            `Fold at ${f.forecast_date} (${f.variant}/${f.model}) has state="ok" but non-finite prediction_pct or actual_pct.`
          );
          break;
        }
      }
    }
  }

  if (!Array.isArray(raw.summary) || raw.summary.length === 0) {
    errors.push("Run export contains zero summary metric records.");
  } else {
    for (let i = 0; i < raw.summary.length; i++) {
      const s = raw.summary[i];
      if (!isRecord(s)) {
        errors.push(`Summary row ${i} is not an object.`);
        break;
      }
      if (s.scope !== "common_dates" && s.scope !== "all_folds") {
        errors.push(
          `Summary row ${i} has invalid scope ${JSON.stringify(s.scope)}.`
        );
        break;
      }
      if (
        typeof s.value !== "number" ||
        !Number.isFinite(s.value) ||
        typeof s.n_folds !== "number"
      ) {
        errors.push(`Summary row ${i} has non-numeric value or n_folds.`);
        break;
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: raw as unknown as LeakageAuditRun };
}

export interface AlignedDateRow {
  forecast_date: string;
  horizon_months: number;
  model: string;
  actual_pct: number | null;
  original: AuditFold | null;
  corrected: AuditFold | null;
  original_error_pct: number | null;
  corrected_error_pct: number | null;
  delta_error_pp: number | null;
  is_common_ok: boolean;
}

export interface MetricComparisonPair {
  metric: "mae" | "rmse";
  label: string;
  unit: string;
  originalValue: number | null;
  correctedValue: number | null;
  deltaPp: number | null;
  originalFolds: number;
  correctedFolds: number;
  droppedFoldsCount: number;
  unavailableReason: string | null;
  reconciled: boolean;
}

export interface ComparisonViewData {
  isSupported: boolean;
  unsupportedReason: string | null;
  nearestValidSelection: {
    horizon: number;
    model: string;
    scope: ScopeType;
  } | null;
  horizon: number;
  model: string;
  scope: ScopeType;
  maePair: MetricComparisonPair;
  rmsePair: MetricComparisonPair;
  findingHeadline: string;
  findingSubline: string;
  findingState: "result" | "no_difference" | "fewer_folds" | "unsupported";
  chartSummarySentence: string;
  allDateRows: AlignedDateRow[];
  scopedDateRows: AlignedDateRow[];
  commonDatesCount: number;
  originalTotalOkCount: number;
  correctedTotalOkCount: number;
  droppedDatesCount: number;
}

export function formatModelName(model: string): string {
  switch (model) {
    case "ar1":
    case "arima":
      return "AR(1) Linear";
    case "ridge":
      return "Ridge Regression";
    case "random_forest":
      return "Random Forest";
    default:
      return model;
  }
}

export function formatFoldStateBadge(state: FoldState): {
  label: string;
  tone: "ok" | "warn" | "leak";
} {
  switch (state) {
    case "ok":
      return { label: "OK · Matured", tone: "ok" };
    case "skipped_insufficient_labels":
      return { label: "Skipped · Insufficient labels", tone: "warn" };
    case "model_failed":
      return { label: "Failed · Nonconverged", tone: "leak" };
    case "unavailable":
      return { label: "Unavailable · Missing input", tone: "warn" };
  }
}

/**
 * Build deterministic comparison view, templated finding sentences, and fold-to-summary reconciliation.
 */
export function computeComparisonView(
  run: LeakageAuditRun,
  horizon: number,
  model: string,
  scope: ScopeType
): ComparisonViewData {
  const matchingFolds = run.folds.filter(
    (f) => f.horizon_months === horizon && f.model === model
  );

  // Check if this (horizon, model) combination exists in the run
  if (matchingFolds.length === 0) {
    const firstFold = run.folds[0];
    const nearest = firstFold
      ? {
          horizon: firstFold.horizon_months,
          model: firstFold.model,
          scope: "common_dates" as ScopeType,
        }
      : null;
    const emptyPair = (metric: "mae" | "rmse", label: string): MetricComparisonPair => ({
      metric,
      label,
      unit: "%",
      originalValue: null,
      correctedValue: null,
      deltaPp: null,
      originalFolds: 0,
      correctedFolds: 0,
      droppedFoldsCount: 0,
      unavailableReason: `No exported folds for model "${model}" at ${horizon}-month horizon.`,
      reconciled: true,
    });
    return {
      isSupported: false,
      unsupportedReason: `The combination (${formatModelName(model)}, ${horizon}-month horizon) is not present in run "${run.run_id}".`,
      nearestValidSelection: nearest,
      horizon,
      model,
      scope,
      maePair: emptyPair("mae", "Mean Absolute Error (MAE)"),
      rmsePair: emptyPair("rmse", "Root Mean Squared Error (RMSE)"),
      findingHeadline: "Selected comparison combination is unavailable in this run export",
      findingSubline: "Switch to a supported horizon and model combination.",
      findingState: "unsupported",
      chartSummarySentence: "No chart points available for this selection.",
      allDateRows: [],
      scopedDateRows: [],
      commonDatesCount: 0,
      originalTotalOkCount: 0,
      correctedTotalOkCount: 0,
      droppedDatesCount: 0,
    };
  }

  const byDate = new Map<
    string,
    { original: AuditFold | null; corrected: AuditFold | null }
  >();
  for (const f of matchingFolds) {
    const cur = byDate.get(f.forecast_date) ?? {
      original: null,
      corrected: null,
    };
    if (f.variant === "original") cur.original = f;
    if (f.variant === "corrected") cur.corrected = f;
    byDate.set(f.forecast_date, cur);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  const allDateRows: AlignedDateRow[] = sortedDates.map((d) => {
    const pair = byDate.get(d)!;
    const orig = pair.original;
    const corr = pair.corrected;
    const actual = corr?.actual_pct ?? orig?.actual_pct ?? null;
    const origErr =
      orig &&
      orig.state === "ok" &&
      orig.prediction_pct !== null &&
      orig.actual_pct !== null
        ? Math.abs(orig.prediction_pct - orig.actual_pct)
        : null;
    const corrErr =
      corr &&
      corr.state === "ok" &&
      corr.prediction_pct !== null &&
      corr.actual_pct !== null
        ? Math.abs(corr.prediction_pct - corr.actual_pct)
        : null;
    const delta =
      origErr !== null && corrErr !== null ? corrErr - origErr : null;

    return {
      forecast_date: d,
      horizon_months: horizon,
      model,
      actual_pct: actual,
      original: orig,
      corrected: corr,
      original_error_pct: origErr,
      corrected_error_pct: corrErr,
      delta_error_pp: delta,
      is_common_ok: origErr !== null && corrErr !== null,
    };
  });

  // Note: In common_dates view, we still keep non-ok rows visible in DataTable (spec rule: "A missing fold is never silently dropped; Skipped fold: Row kept, value shown as 'unavailable' with the reason in text")
  const scopedDateRows =
    scope === "common_dates"
      ? allDateRows
      : allDateRows;

  const originalTotalOkCount = allDateRows.filter(
    (r) => r.original_error_pct !== null
  ).length;
  const correctedTotalOkCount = allDateRows.filter(
    (r) => r.corrected_error_pct !== null
  ).length;
  const commonDatesCount = allDateRows.filter((r) => r.is_common_ok).length;
  const droppedDatesCount = Math.max(
    0,
    originalTotalOkCount - correctedTotalOkCount
  );

  const findSummary = (
    metric: "mae" | "rmse",
    variant: VariantType
  ): AuditSummaryRow | undefined =>
    run.summary.find(
      (s) =>
        s.horizon_months === horizon &&
        s.model === model &&
        s.scope === scope &&
        s.metric === metric &&
        s.variant === variant
    );

  const buildPair = (
    metric: "mae" | "rmse",
    label: string
  ): MetricComparisonPair => {
    const origSum = findSummary(metric, "original");
    const corrSum = findSummary(metric, "corrected");
    if (!origSum || !corrSum || origSum.n_folds === 0 || corrSum.n_folds === 0) {
      return {
        metric,
        label,
        unit: "%",
        originalValue: null,
        correctedValue: null,
        deltaPp: null,
        originalFolds: origSum?.n_folds ?? 0,
        correctedFolds: corrSum?.n_folds ?? 0,
        droppedFoldsCount: droppedDatesCount,
        unavailableReason: "Insufficient valid folds to compute summary metric.",
        reconciled: true,
      };
    }

    // Reconcile summary value against per-fold errors to displayed precision (0.01%)
    const eligibleRows =
      scope === "common_dates"
        ? allDateRows.filter((r) => r.is_common_ok)
        : allDateRows;
    const origErrs = eligibleRows
      .map((r) => r.original_error_pct)
      .filter((v): v is number => v !== null);
    const corrErrs = eligibleRows
      .map((r) => r.corrected_error_pct)
      .filter((v): v is number => v !== null);

    const calcMetric = (arr: number[]) => {
      if (arr.length === 0) return 0;
      if (metric === "mae") {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
      }
      return Math.sqrt(arr.reduce((a, b) => a + b * b, 0) / arr.length);
    };

    const calcOrig = calcMetric(origErrs);
    const calcCorr = calcMetric(corrErrs);
    const reconciled =
      Math.abs(calcOrig - origSum.value) < 0.01 &&
      Math.abs(calcCorr - corrSum.value) < 0.01 &&
      origErrs.length === origSum.n_folds &&
      corrErrs.length === corrSum.n_folds;

    return {
      metric,
      label,
      unit: "%",
      originalValue: origSum.value,
      correctedValue: corrSum.value,
      deltaPp: Number((corrSum.value - origSum.value).toFixed(2)),
      originalFolds: origSum.n_folds,
      correctedFolds: corrSum.n_folds,
      droppedFoldsCount: droppedDatesCount,
      unavailableReason: null,
      reconciled,
    };
  };

  const maePair = buildPair("mae", "Mean Absolute Error (MAE)");
  const rmsePair = buildPair("rmse", "Root Mean Squared Error (RMSE)");

  // Templated Finding Sentence (never hand-written, so it cannot drift from the numbers)
  let findingHeadline = "";
  let findingSubline = "";
  let findingState: "result" | "no_difference" | "fewer_folds" | "unsupported" =
    "result";

  if (maePair.originalValue === null || maePair.correctedValue === null) {
    findingHeadline = `Unavailable ${horizon}-month MAE comparison for ${formatModelName(model)}`;
    findingSubline = maePair.unavailableReason ?? "Unavailable";
    findingState = "unsupported";
  } else {
    const origStr = `${maePair.originalValue.toFixed(2)}%`;
    const corrStr = `${maePair.correctedValue.toFixed(2)}%`;
    const rawDiff = maePair.correctedValue - maePair.originalValue;
    const absDiffStr = Math.abs(rawDiff).toFixed(2);

    if (Math.abs(rawDiff) < 0.005) {
      findingHeadline = `Corrected ${horizon}-month MAE was unchanged at ${corrStr} (${ formatModelName(model) })`;
      findingState = "no_difference";
    } else if (rawDiff > 0) {
      findingHeadline = `Corrected ${horizon}-month MAE increased by ${absDiffStr} percentage points`;
      findingState = scope === "all_folds" && droppedDatesCount > 0 ? "fewer_folds" : "result";
    } else {
      findingHeadline = `Corrected ${horizon}-month MAE decreased by ${absDiffStr} percentage points`;
      findingState = scope === "all_folds" && droppedDatesCount > 0 ? "fewer_folds" : "result";
    }

    if (scope === "common_dates") {
      findingSubline = `${origStr} original → ${corrStr} corrected · ${commonDatesCount} common folds (${droppedDatesCount} early folds dropped by fix)`;
    } else {
      findingSubline = `${origStr} original (${maePair.originalFolds} folds) → ${corrStr} corrected (${maePair.correctedFolds} folds · ${droppedDatesCount} fewer valid forecasts)`;
    }
  }

  const chartSummarySentence =
    maePair.originalValue !== null && maePair.correctedValue !== null
      ? `Across ${scope === "common_dates" ? `${commonDatesCount} common forecast dates` : `${allDateRows.length} total fold dates`} for ${run.source.ticker} (${formatModelName(model)}, ${horizon}-month horizon), original MAE is ${maePair.originalValue.toFixed(2)}% and corrected MAE is ${maePair.correctedValue.toFixed(2)}%, with ${droppedDatesCount} early forecast dates skipped in the corrected series due to unmatured training labels.`
      : "No valid forecast error series available for this selection.";

  return {
    isSupported: true,
    unsupportedReason: null,
    nearestValidSelection: null,
    horizon,
    model,
    scope,
    maePair,
    rmsePair,
    findingHeadline,
    findingSubline,
    findingState,
    chartSummarySentence,
    allDateRows,
    scopedDateRows,
    commonDatesCount,
    originalTotalOkCount,
    correctedTotalOkCount,
    droppedDatesCount,
  };
}
