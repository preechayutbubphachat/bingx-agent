// dashboard/lib/trend/shadowEvidenceCoverageTracker.ts
// D5.3 - Evidence Coverage Tracker (read-only analytics).
//
// Safety contract:
// - Pure helper. Input is the D5.2-d ShadowOutcomeQualityGate only.
// - No candles, raw records, resolver calls, I/O, runtime writes, env, or network.
// - activationAllowed is always false and reviewOnly is always true.

import type { ShadowOutcomeQualityGate } from "./shadowOutcomeQualityGate.ts";

export type ShadowEvidenceCoverageStatus = "NO_DATA" | "NOT_READY" | "READY";
export type ShadowEvidenceCoverageRequirementId =
  | "context_ready_setups"
  | "context_ready_resolved"
  | "range_subset"
  | "entry_touch"
  | "price_context_diversity"
  | "dynamic_grid_diversity"
  | "unknown_context_dilution";
export type ShadowEvidenceCoverageUnit = "samples" | "buckets" | "context_ready_samples";
export type ShadowEvidenceCoverageMilestone =
  | "CONTEXT_READY_SETUPS"
  | "CONTEXT_READY_RESOLVED"
  | "RANGE_SUBSET"
  | "ENTRY_TOUCH"
  | "PRICE_CONTEXT_DIVERSITY"
  | "DYNAMIC_GRID_DIVERSITY"
  | "UNKNOWN_CONTEXT_DILUTION";

export interface ShadowEvidenceCoverageRequirement {
  id: ShadowEvidenceCoverageRequirementId;
  met: boolean;
  current: number;
  target: number;
  remaining: number;
  unit: ShadowEvidenceCoverageUnit;
  note: string;
}

export interface ShadowEvidenceCoverageTracker {
  schemaVersion: 1;
  source: "SHADOW_EVIDENCE_COVERAGE_V1";
  status: ShadowEvidenceCoverageStatus;
  activationAllowed: false;
  reviewOnly: true;
  coverageScore: number;
  requirementsMet: number;
  requirementsTotal: number;
  requirements: ShadowEvidenceCoverageRequirement[];
  nextEvidenceMilestone: {
    id: ShadowEvidenceCoverageMilestone;
    remaining: number;
    unit: ShadowEvidenceCoverageUnit;
    description: string;
  } | null;
  notes: string[];
}

const SOURCE = "SHADOW_EVIDENCE_COVERAGE_V1" as const;
const DIVERSITY_TARGET = 2;
const REQUIREMENT_TOTAL = 7;

const MILESTONE_PRIORITY: ShadowEvidenceCoverageRequirementId[] = [
  "price_context_diversity",
  "dynamic_grid_diversity",
  "range_subset",
  "entry_touch",
  "context_ready_resolved",
  "context_ready_setups",
  "unknown_context_dilution",
];

const MILESTONE_ID: Record<ShadowEvidenceCoverageRequirementId, ShadowEvidenceCoverageMilestone> = {
  context_ready_setups: "CONTEXT_READY_SETUPS",
  context_ready_resolved: "CONTEXT_READY_RESOLVED",
  range_subset: "RANGE_SUBSET",
  entry_touch: "ENTRY_TOUCH",
  price_context_diversity: "PRICE_CONTEXT_DIVERSITY",
  dynamic_grid_diversity: "DYNAMIC_GRID_DIVERSITY",
  unknown_context_dilution: "UNKNOWN_CONTEXT_DILUTION",
};

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clean(v: unknown): number {
  return finite(v) ? Math.max(0, v) : 0;
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function remaining(target: number, current: number): number {
  return Math.max(0, target - current);
}

function req(
  id: ShadowEvidenceCoverageRequirementId,
  current: number,
  target: number,
  unit: ShadowEvidenceCoverageUnit,
  note: string,
): ShadowEvidenceCoverageRequirement {
  const r = remaining(target, current);
  return { id, met: r === 0, current, target, remaining: r, unit, note };
}

function description(id: ShadowEvidenceCoverageRequirementId): string {
  switch (id) {
    case "price_context_diversity":
      return "Collect setups in one more price context bucket.";
    case "dynamic_grid_diversity":
      return "Collect setups in one more dynamic grid context bucket.";
    case "range_subset":
      return "Collect more RANGE-context setups.";
    case "entry_touch":
      return "Collect more entry-touch observations.";
    case "context_ready_resolved":
      return "Collect more context-ready resolved observations.";
    case "context_ready_setups":
      return "Collect more context-ready setups.";
    case "unknown_context_dilution":
      return "Collect context-ready setups to dilute UNKNOWN context share.";
  }
}

function emptyRequirements(): ShadowEvidenceCoverageRequirement[] {
  return [
    req("context_ready_setups", 0, 0, "samples", "No quality gate metrics available."),
    req("context_ready_resolved", 0, 0, "samples", "No quality gate metrics available."),
    req("range_subset", 0, 0, "samples", "No quality gate metrics available."),
    req("entry_touch", 0, 0, "samples", "No quality gate metrics available."),
    req("price_context_diversity", 0, 0, "buckets", "No quality gate metrics available."),
    req("dynamic_grid_diversity", 0, 0, "buckets", "No quality gate metrics available."),
    req("unknown_context_dilution", 0, 0, "context_ready_samples", "No quality gate metrics available."),
  ];
}

export function emptyShadowEvidenceCoverageTracker(): ShadowEvidenceCoverageTracker {
  return {
    schemaVersion: 1,
    source: SOURCE,
    status: "NO_DATA",
    activationAllowed: false,
    reviewOnly: true,
    coverageScore: 0,
    requirementsMet: 0,
    requirementsTotal: REQUIREMENT_TOTAL,
    requirements: emptyRequirements(),
    nextEvidenceMilestone: null,
    notes: ["No shadow outcome quality gate available."],
  };
}

function unknownDilutionTarget(totalSetups: number, unknownContextSetups: number, limit: number): number {
  if (limit <= 0 || unknownContextSetups <= 0) return totalSetups;
  return Math.max(totalSetups, Math.floor(unknownContextSetups / limit) + 1);
}

export function evaluateShadowEvidenceCoverage(
  gate: ShadowOutcomeQualityGate | null | undefined,
): ShadowEvidenceCoverageTracker {
  if (!gate || gate.status === "NO_DATA") return emptyShadowEvidenceCoverageTracker();

  const m = gate.metrics;
  const t = gate.thresholds;
  const totalSetups = clean(m.totalSetups);
  const unknownContextSetups = clean(m.unknownContextSetups);
  const unknownContextPct = finite(m.unknownContextPct) ? m.unknownContextPct : null;
  const unknownTarget =
    unknownContextPct === null || unknownContextPct < t.unknownDominanceLimit
      ? totalSetups
      : unknownDilutionTarget(totalSetups, unknownContextSetups, t.unknownDominanceLimit);

  const requirements: ShadowEvidenceCoverageRequirement[] = [
    req(
      "context_ready_setups",
      clean(m.contextReadySetups),
      clean(t.minContextReadySetups),
      "samples",
      "Collect context-ready setups.",
    ),
    req(
      "context_ready_resolved",
      clean(m.contextReadyResolved),
      clean(t.minContextReadyResolved),
      "samples",
      "Collect context-ready resolved observations.",
    ),
    req(
      "range_subset",
      t.rangeSubsetRequired ? clean(m.rangeSetups) : clean(t.rangeMinSample),
      t.rangeSubsetRequired ? clean(t.rangeMinSample) : clean(t.rangeMinSample),
      "samples",
      "Collect RANGE-context setups.",
    ),
    req(
      "entry_touch",
      clean(m.entryTouched),
      clean(t.minEntryTouchForPerf),
      "samples",
      "Collect entry-touch observations.",
    ),
    req(
      "price_context_diversity",
      t.priceContextDiversityRequired ? clean(m.distinctPriceContexts) : DIVERSITY_TARGET,
      DIVERSITY_TARGET,
      "buckets",
      "Collect a second non-UNKNOWN price context bucket.",
    ),
    req(
      "dynamic_grid_diversity",
      t.dynamicGridContextDiversityRequired ? clean(m.distinctDynamicGridContexts) : DIVERSITY_TARGET,
      DIVERSITY_TARGET,
      "buckets",
      "Collect a second non-UNKNOWN dynamic grid context bucket.",
    ),
    req(
      "unknown_context_dilution",
      totalSetups,
      unknownTarget,
      "context_ready_samples",
      "Collect context-ready setups to reduce UNKNOWN context share below the limit.",
    ),
  ];

  const requirementsMet = requirements.filter((r) => r.met).length;
  const coverageScore = round4(requirementsMet / REQUIREMENT_TOTAL);
  const next = MILESTONE_PRIORITY.map((id) => requirements.find((r) => r.id === id)).find((r): r is ShadowEvidenceCoverageRequirement => Boolean(r && !r.met));

  return {
    schemaVersion: 1,
    source: SOURCE,
    status: requirementsMet === REQUIREMENT_TOTAL ? "READY" : "NOT_READY",
    activationAllowed: false,
    reviewOnly: true,
    coverageScore,
    requirementsMet,
    requirementsTotal: REQUIREMENT_TOTAL,
    requirements,
    nextEvidenceMilestone: next
      ? {
          id: MILESTONE_ID[next.id],
          remaining: next.remaining,
          unit: next.unit,
          description: description(next.id),
        }
      : null,
    notes: ["UNKNOWN-context dilution assumes future samples are context-ready."],
  };
}
