// dashboard/lib/trend/rejectReasonTaxonomy.ts
// Phase T-3H-6-a1 — Rejection Reason Taxonomy (PURE, analytics/UI-only).
// Classifies logged reject reasons for DISPLAY GROUPING in Rejection Analysis.
//
// SAFETY:
//   - Pure functions, no I/O. NEVER imported by runner/strategy/decision code.
//   - Classification affects how the UI groups counts — it never changes whether
//     a trade enters, never changes thresholds, never touches the decision log schema.
//   - Unknown reasons default to INFO (never silently promoted to blocker).

export type RejectReasonCategory = "HARD_BLOCKER" | "SOFT_WAIT" | "PASS_CONTEXT" | "INFO";

/** Exact-match table — authoritative for known reasons (from runner output + T-3H-6-a1 spec). */
const EXACT: Record<string, RejectReasonCategory> = {
  // HARD_BLOCKER — actual blockers preventing entry
  reward_risk_min: "HARD_BLOCKER",
  confirmation_required: "HARD_BLOCKER",
  confirmation_waiting_5m: "HARD_BLOCKER",
  price_not_near_target: "HARD_BLOCKER",
  regime_direction_mismatch: "HARD_BLOCKER",
  zone_not_ready: "HARD_BLOCKER",
  risk_rejected: "HARD_BLOCKER",
  // SOFT_WAIT — waiting states, not hard failures
  trend_status_awaiting_or_setup_ready: "SOFT_WAIT",
  price_inside_entry_zone_or_edge: "SOFT_WAIT",
  zone_build_ready: "SOFT_WAIT",
  waiting_5m_confirm: "SOFT_WAIT",
  // PASS_CONTEXT — conditions that PASSED; logged as context, NOT blockers
  risk_status_pass: "PASS_CONTEXT",
  indicator_gate_not_conflicting: "PASS_CONTEXT",
  regime_direction_match: "PASS_CONTEXT",
};

/**
 * Conservative keyword fallback for naming drift (documented, display-only):
 *   *_pass / *_match / *not_conflicting → PASS_CONTEXT
 *   contains "awaiting"/"waiting" or ends in "_ready" → SOFT_WAIT
 *   contains "mismatch"/"rejected"/"_required" or ends in "_min" → HARD_BLOCKER
 * Anything else → INFO.
 */
export function classifyRejectReason(reason: string): RejectReasonCategory {
  const r = (reason ?? "").trim().toLowerCase();
  if (!r) return "INFO";
  const exact = EXACT[r];
  if (exact) return exact;
  if (r.endsWith("_pass") || r.endsWith("_match") || r.includes("not_conflicting")) return "PASS_CONTEXT";
  if (r.includes("awaiting") || r.includes("waiting") || r.endsWith("_ready")) return "SOFT_WAIT";
  if (r.includes("mismatch") || r.includes("rejected") || r.includes("_required") || r.endsWith("_min")) return "HARD_BLOCKER";
  return "INFO";
}

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface GroupedRejectReasons {
  hardBlockers: ReasonCount[];
  softWaits: ReasonCount[];
  passContext: ReasonCount[];
  info: ReasonCount[];
  /** total across ALL categories (raw sample of reason occurrences) */
  totalReasonCount: number;
  /** total of HARD_BLOCKER occurrences only */
  hardBlockerCount: number;
}

/** Group raw counts (e.g. summary.rejectReasonCounts) into taxonomy buckets, sorted desc. */
export function groupRejectReasonCounts(counts: Record<string, number> | null | undefined): GroupedRejectReasons {
  const out: GroupedRejectReasons = {
    hardBlockers: [],
    softWaits: [],
    passContext: [],
    info: [],
    totalReasonCount: 0,
    hardBlockerCount: 0,
  };
  if (!counts) return out;
  for (const [reason, count] of Object.entries(counts)) {
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) continue;
    const entry: ReasonCount = { reason, count };
    out.totalReasonCount += count;
    switch (classifyRejectReason(reason)) {
      case "HARD_BLOCKER":
        out.hardBlockers.push(entry);
        out.hardBlockerCount += count;
        break;
      case "SOFT_WAIT":
        out.softWaits.push(entry);
        break;
      case "PASS_CONTEXT":
        out.passContext.push(entry);
        break;
      default:
        out.info.push(entry);
    }
  }
  const byCountDesc = (a: ReasonCount, b: ReasonCount) => b.count - a.count || a.reason.localeCompare(b.reason);
  out.hardBlockers.sort(byCountDesc);
  out.softWaits.sort(byCountDesc);
  out.passContext.sort(byCountDesc);
  out.info.sort(byCountDesc);
  return out;
}

export const CATEGORY_LABEL_TH: Record<RejectReasonCategory, string> = {
  HARD_BLOCKER: "ตัวบล็อกจริง (hard blockers)",
  SOFT_WAIT: "สถานะรอ (soft waits)",
  PASS_CONTEXT: "สัญญาณผ่าน (pass/context)",
  INFO: "อื่น ๆ (info)",
};
