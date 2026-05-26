/**
 * operatorEvidence.ts
 * Phase M-0D — Operator Evidence Intake & Approval Status Tracker
 *
 * Evidence model กลางสำหรับติดตาม operator evidence items ก่อน Phase M-0B
 *
 * Safety guarantees:
 * - NO network calls — ไม่เรียก BingX API หรือ exchange ใดๆ ทั้งสิ้น
 * - READ ONLY — ไม่เขียน / ไม่แก้ / ไม่ลบ ไฟล์ใดเลย
 * - ไม่มี API key / secret ใดถูกแสดง — ตรวจ presence เป็น boolean เท่านั้น
 * - ไม่ import BingX execution / order placement ใดๆ
 * - default status = BLOCKED (safe default)
 * - Phase M-0B = approval gate ONLY — no exchange calls here
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type EvidenceItemStatus = "pending" | "pass" | "fail" | "unknown";
export type EvidenceSource = "manual" | "env" | "api" | "derived";

export type EvidenceItem = {
  id: string;
  label: string;
  status: EvidenceItemStatus;
  required: boolean;
  passed: boolean;
  source: EvidenceSource;
  evidenceRef: string; // ชื่อ API endpoint, field, หรือ env var ที่ใช้ตรวจ
  message: string;
  nextAction: string;
};

export type OperatorEvidenceStatus =
  | "BLOCKED"
  | "PARTIAL_EVIDENCE"
  | "READY_FOR_OPERATOR_APPROVAL_REVIEW"
  | "APPROVED_FOR_M0B_READONLY_IMPLEMENTATION";

export type OperatorEvidenceSummary = {
  totalRequired: number;
  passed: number;
  pending: number;
  failed: number;
  blocked: number;
};

export type OperatorEvidenceReport = {
  ok: false; // เสมอ false — ต้องผ่าน manual approval ก่อน
  readOnly: true; // เสมอ true
  status: OperatorEvidenceStatus;
  phase: "M-0D Operator Evidence Tracker";
  evidence: EvidenceItem[];
  summary: OperatorEvidenceSummary;
  blockers: string[];
  warnings: string[];
  nextActions: string[];
  checkedAt: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function readBoolEnv(key: string, defaultVal: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === null) return defaultVal;
  return v.toLowerCase() === "true";
}

function hasEnvValue(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

function readEnvRaw(key: string): string {
  return process.env[key]?.trim() ?? "";
}

// ─── Evidence item builders ─────────────────────────────────────────────────────

function buildWindowsBuildEvidence(): EvidenceItem {
  // Windows build ต้องรันบน host — ตรวจ env flag ที่ operator set เพื่อยืนยัน
  const confirmed = readEnvRaw("OPERATOR_WINDOWS_BUILD_CONFIRMED").toLowerCase() === "confirmed";
  return {
    id: "windowsBuild",
    label: "Windows npm run build EXIT:0",
    status: confirmed ? "pass" : "pending",
    required: true,
    passed: confirmed,
    source: "env",
    evidenceRef: "OPERATOR_WINDOWS_BUILD_CONFIRMED=confirmed",
    message: confirmed
      ? "Windows build confirmed by operator"
      : "Operator must run build on Windows host and set OPERATOR_WINDOWS_BUILD_CONFIRMED=confirmed",
    nextAction: confirmed
      ? ""
      : "cd C:\\2025\\web-69\\ob-gate17-200369\\httpdocs\\dashboard && npm run build → set OPERATOR_WINDOWS_BUILD_CONFIRMED=confirmed",
  };
}

function buildEndpointEvidence(
  id: string,
  label: string,
  envFlag: string,
  endpoint: string
): EvidenceItem {
  const confirmed = readEnvRaw(envFlag).toLowerCase() === "confirmed";
  return {
    id,
    label,
    status: confirmed ? "pass" : "pending",
    required: true,
    passed: confirmed,
    source: "env",
    evidenceRef: `${envFlag}=confirmed / ${endpoint}`,
    message: confirmed
      ? `${label} confirmed by operator`
      : `Operator must check ${endpoint} and set ${envFlag}=confirmed`,
    nextAction: confirmed ? "" : `Check ${endpoint} → set ${envFlag}=confirmed`,
  };
}

function buildPaperFillAverageFillPrice(
  paperDataQuality: PaperQualityInput | null
): EvidenceItem {
  const hasAFP = paperDataQuality?.hasAverageFillPrice ?? null;
  const passed = hasAFP === true;
  const status: EvidenceItemStatus = hasAFP === null ? "unknown" : passed ? "pass" : "pending";
  return {
    id: "paperFillAverageFillPrice",
    label: "Paper fills contain averageFillPrice",
    status,
    required: true,
    passed,
    source: "derived",
    evidenceRef: "GET /api/paper-performance → paperDataQuality.hasAverageFillPrice",
    message: passed
      ? "FILL_RESULT events contain averageFillPrice"
      : "No FILL_RESULT events with averageFillPrice yet — paper execution must run to generate fills",
    nextAction: passed
      ? ""
      : "Trigger paper execution cycle → await FILL_RESULT audit events → re-check /api/paper-performance",
  };
}

function buildPaperFillQty(paperDataQuality: PaperQualityInput | null): EvidenceItem {
  // fill qty comes from ORDER_SIMULATED (filledQuantity) or FILL_RESULT
  // derive from hasAverageFillPrice presence (same source)
  const hasAFP = paperDataQuality?.hasAverageFillPrice ?? null;
  const passed = hasAFP === true;
  const status: EvidenceItemStatus = hasAFP === null ? "unknown" : passed ? "pass" : "pending";
  return {
    id: "paperFillQty",
    label: "Paper fills contain fillQty",
    status,
    required: true,
    passed,
    source: "derived",
    evidenceRef: "GET /api/paper-performance → paperDataQuality.hasAverageFillPrice (proxy)",
    message: passed
      ? "Paper fills have fill quantity data"
      : "Paper fill quantity data not available yet",
    nextAction: passed ? "" : "Trigger paper execution cycle to generate fill events",
  };
}

function buildPaperClosedCycles(paperDataQuality: PaperQualityInput | null): EvidenceItem {
  const hasClosedTrades = paperDataQuality?.hasClosedTrades ?? null;
  const passed = hasClosedTrades === true;
  const status: EvidenceItemStatus = hasClosedTrades === null ? "unknown" : passed ? "pass" : "pending";
  return {
    id: "paperClosedCycles",
    label: "Paper has closed cycles (buy+sell)",
    status,
    required: true,
    passed,
    source: "derived",
    evidenceRef: "GET /api/paper-performance → paperDataQuality.hasClosedTrades",
    message: passed
      ? "Closed paper trading cycles detected"
      : "No closed paper cycles yet — need at least one complete buy→sell or sell→buy cycle",
    nextAction: passed ? "" : "Run paper trading until at least one cycle closes",
  };
}

function buildApprovalChecklist(): EvidenceItem {
  // Approval checklist ตรวจ env flag ที่ operator set หลังตรวจ docs/M0B_OPERATOR_EVIDENCE_PACK.md
  const confirmed = readEnvRaw("OPERATOR_APPROVAL_CHECKLIST_CONFIRMED").toLowerCase() === "confirmed";
  return {
    id: "approvalChecklist",
    label: "Full approval checklist completed",
    status: confirmed ? "pass" : "pending",
    required: true,
    passed: confirmed,
    source: "env",
    evidenceRef: "OPERATOR_APPROVAL_CHECKLIST_CONFIRMED=confirmed",
    message: confirmed
      ? "Operator approval checklist confirmed"
      : "Operator must complete all items in docs/M0B_OPERATOR_EVIDENCE_PACK.md Action 5",
    nextAction: confirmed
      ? ""
      : "Complete all items in docs/M0B_OPERATOR_EVIDENCE_PACK.md Action 5 → set OPERATOR_APPROVAL_CHECKLIST_CONFIRMED=confirmed",
  };
}

function buildExchangeManualApproval(): EvidenceItem {
  const approvalVal = readEnvRaw("EXCHANGE_MANUAL_APPROVAL");
  const approved = approvalVal === "approved";
  return {
    id: "exchangeManualApproval",
    label: "EXCHANGE_MANUAL_APPROVAL=approved",
    status: approved ? "pass" : "pending",
    required: true,
    passed: approved,
    source: "env",
    evidenceRef: "EXCHANGE_MANUAL_APPROVAL env var",
    message: approved
      ? "EXCHANGE_MANUAL_APPROVAL is approved"
      : "EXCHANGE_MANUAL_APPROVAL is not set to 'approved' — set ONLY after all other evidence passes",
    nextAction: approved
      ? ""
      : "Complete all other evidence items → then set EXCHANGE_MANUAL_APPROVAL=approved in .env.local",
  };
}

function buildReadOnlyCredentialApproved(): EvidenceItem {
  // ตรวจ presence ของ read-only credential (boolean เท่านั้น — ห้ามแสดงค่า)
  const hasKey = hasEnvValue("BINGX_READONLY_API_KEY");
  const hasSecret = hasEnvValue("BINGX_READONLY_SECRET");
  const approvalVal = readEnvRaw("EXCHANGE_MANUAL_APPROVAL");
  const approved = approvalVal === "approved";
  const passed = hasKey && hasSecret && approved;
  return {
    id: "readOnlyCredentialApproved",
    label: "Read-only credential approved (no trade/withdraw permission)",
    status: passed ? "pass" : hasKey || hasSecret ? "pending" : "pending",
    required: true,
    passed,
    source: "env",
    evidenceRef: "BINGX_READONLY_API_KEY presence + BINGX_READONLY_SECRET presence + EXCHANGE_MANUAL_APPROVAL",
    message: passed
      ? "Read-only credential present and approved (values not shown)"
      : !approved
      ? "EXCHANGE_MANUAL_APPROVAL not set — credential approval pending"
      : !hasKey || !hasSecret
      ? "BINGX_READONLY_API_KEY or BINGX_READONLY_SECRET not set in .env.local"
      : "Credential pending approval",
    nextAction: passed
      ? ""
      : "Create read-only API key on BingX (read-only, no trade/order/withdraw permission) → set in .env.local → set EXCHANGE_MANUAL_APPROVAL=approved",
  };
}

function buildNoTradePermission(): EvidenceItem {
  // ตรวจ env flag — operator ยืนยันว่า credential ไม่มี trade permission
  const confirmed = readEnvRaw("OPERATOR_NO_TRADE_PERMISSION_CONFIRMED").toLowerCase() === "confirmed";
  return {
    id: "noTradePermission",
    label: "Read-only credential has no trade permission",
    status: confirmed ? "pass" : "pending",
    required: true,
    passed: confirmed,
    source: "env",
    evidenceRef: "OPERATOR_NO_TRADE_PERMISSION_CONFIRMED=confirmed",
    message: confirmed
      ? "Operator confirmed: no trade permission on read-only credential"
      : "Operator must verify API key has no trade permission",
    nextAction: confirmed
      ? ""
      : "Check BingX API key permissions → confirm no trade/order permission → set OPERATOR_NO_TRADE_PERMISSION_CONFIRMED=confirmed",
  };
}

function buildNoWithdrawPermission(): EvidenceItem {
  const confirmed = readEnvRaw("OPERATOR_NO_WITHDRAW_PERMISSION_CONFIRMED").toLowerCase() === "confirmed";
  return {
    id: "noWithdrawPermission",
    label: "Read-only credential has no withdraw permission",
    status: confirmed ? "pass" : "pending",
    required: true,
    passed: confirmed,
    source: "env",
    evidenceRef: "OPERATOR_NO_WITHDRAW_PERMISSION_CONFIRMED=confirmed",
    message: confirmed
      ? "Operator confirmed: no withdraw permission on read-only credential"
      : "Operator must verify API key has no withdraw permission",
    nextAction: confirmed
      ? ""
      : "Check BingX API key permissions → confirm no withdraw permission → set OPERATOR_NO_WITHDRAW_PERMISSION_CONFIRMED=confirmed",
  };
}

function buildSafetyFlagEvidence(
  id: string,
  label: string,
  envKey: string,
  expectedFalse: boolean
): EvidenceItem {
  const value = readBoolEnv(envKey, false);
  // expected = flag must be false
  const passed = expectedFalse ? !value : value;
  return {
    id,
    label,
    status: passed ? "pass" : "fail",
    required: true,
    passed,
    source: "env",
    evidenceRef: `${envKey}=${value}`,
    message: passed
      ? `${label} — confirmed safe`
      : `UNSAFE: ${envKey}=${value} — must be ${expectedFalse ? "false" : "true"}`,
    nextAction: passed ? "" : `Set ${envKey}=${expectedFalse ? "false" : "true"} in .env.local`,
  };
}

// ─── Input type ─────────────────────────────────────────────────────────────────

export type PaperQualityInput = {
  hasAverageFillPrice?: boolean | null;
  hasClosedTrades?: boolean | null;
  qualityStatus?: string | null;
};

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * evaluateOperatorEvidence
 *
 * Pure function — no side effects, no network, no file writes
 * Returns structured evidence report
 */
export function evaluateOperatorEvidence(opts?: {
  paperDataQuality?: PaperQualityInput | null;
}): OperatorEvidenceReport {
  const checkedAt = new Date().toISOString();
  const paperDataQuality = opts?.paperDataQuality ?? null;

  // Build all evidence items
  const evidence: EvidenceItem[] = [
    buildWindowsBuildEvidence(),
    buildEndpointEvidence(
      "m0bPreflightEndpoint",
      "GET /api/m0b-preflight manual check",
      "OPERATOR_M0B_PREFLIGHT_CHECKED",
      "/api/m0b-preflight"
    ),
    buildEndpointEvidence(
      "healthEndpoint",
      "GET /api/health manual check",
      "OPERATOR_HEALTH_CHECKED",
      "/api/health"
    ),
    buildEndpointEvidence(
      "paperPerformanceEndpoint",
      "GET /api/paper-performance manual check",
      "OPERATOR_PAPER_PERFORMANCE_CHECKED",
      "/api/paper-performance"
    ),
    buildEndpointEvidence(
      "publicDashboardVisual",
      "/public dashboard visual check",
      "OPERATOR_PUBLIC_VISUAL_CHECKED",
      "/public"
    ),
    buildPaperFillAverageFillPrice(paperDataQuality),
    buildPaperFillQty(paperDataQuality),
    buildPaperClosedCycles(paperDataQuality),
    buildApprovalChecklist(),
    buildExchangeManualApproval(),
    buildReadOnlyCredentialApproved(),
    buildNoTradePermission(),
    buildNoWithdrawPermission(),
    buildSafetyFlagEvidence(
      "liveTradingDisabled",
      "LIVE_TRADING_ENABLED=false",
      "LIVE_TRADING_ENABLED",
      true // must be false
    ),
    buildSafetyFlagEvidence(
      "orderPlacementDisabled",
      "ENABLE_ORDER_PLACEMENT=false",
      "ENABLE_ORDER_PLACEMENT",
      true // must be false
    ),
    buildSafetyFlagEvidence(
      "productionTradingNotReady",
      "PRODUCTION_TRADING_READY=false",
      "PRODUCTION_TRADING_READY",
      true // must be false
    ),
  ];

  // Compute summary
  const required = evidence.filter((e) => e.required);
  const passed = required.filter((e) => e.passed).length;
  const pendingItems = required.filter((e) => e.status === "pending" || e.status === "unknown");
  const failedItems = required.filter((e) => e.status === "fail");

  const summary: OperatorEvidenceSummary = {
    totalRequired: required.length,
    passed,
    pending: pendingItems.length,
    failed: failedItems.length,
    blocked: failedItems.filter((e) => e.id.startsWith("liveTrad") || e.id.startsWith("orderPlac") || e.id.startsWith("production")).length,
  };

  // Determine status
  const blockers: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];

  // Safety flags are hard blockers
  const safetyItems = evidence.filter((e) =>
    ["liveTradingDisabled", "orderPlacementDisabled", "productionTradingNotReady"].includes(e.id)
  );
  for (const s of safetyItems) {
    if (!s.passed) {
      blockers.push(`SAFETY FLAG VIOLATION: ${s.label} — ${s.message}`);
    }
  }

  // Build evidence
  const windowsBuild = evidence.find((e) => e.id === "windowsBuild")!;
  if (!windowsBuild.passed) {
    blockers.push("Windows npm run build not yet confirmed by operator");
  }

  const paperItems = evidence.filter((e) =>
    ["paperFillAverageFillPrice", "paperFillQty", "paperClosedCycles"].includes(e.id)
  );
  for (const p of paperItems) {
    if (!p.passed) {
      blockers.push(p.message);
    }
  }

  const approvalItem = evidence.find((e) => e.id === "approvalChecklist")!;
  if (!approvalItem.passed) {
    blockers.push("Approval checklist not yet completed by operator");
  }

  const exchangeApproval = evidence.find((e) => e.id === "exchangeManualApproval")!;
  if (!exchangeApproval.passed) {
    blockers.push("EXCHANGE_MANUAL_APPROVAL not set to 'approved'");
  }

  const credItems = evidence.filter((e) =>
    ["readOnlyCredentialApproved", "noTradePermission", "noWithdrawPermission"].includes(e.id)
  );
  for (const c of credItems) {
    if (!c.passed) {
      warnings.push(c.message);
    }
  }

  // Collect next actions from unpassed required items
  for (const item of required) {
    if (!item.passed && item.nextAction) {
      nextActions.push(item.nextAction);
    }
  }

  // Determine overall status
  let status: OperatorEvidenceStatus = "BLOCKED";

  const safetyFlagsOk = safetyItems.every((s) => s.passed);
  const buildPassed = windowsBuild.passed;
  const paperPassed = paperItems.every((p) => p.passed);
  const approvalPassed = approvalItem.passed;
  const exchangeApprovalPassed = exchangeApproval.passed;

  if (!safetyFlagsOk || failedItems.length > 0) {
    status = "BLOCKED";
  } else if (!buildPassed || !paperPassed) {
    status = "BLOCKED";
  } else if (safetyFlagsOk && buildPassed && paperPassed && passed > summary.totalRequired * 0.5) {
    status = "PARTIAL_EVIDENCE";
  }

  if (safetyFlagsOk && buildPassed && paperPassed && approvalPassed && !exchangeApprovalPassed) {
    status = "READY_FOR_OPERATOR_APPROVAL_REVIEW";
  }

  // APPROVED only if all required items pass AND EXCHANGE_MANUAL_APPROVAL=approved
  if (
    passed === summary.totalRequired &&
    exchangeApprovalPassed &&
    safetyFlagsOk &&
    failedItems.length === 0
  ) {
    status = "APPROVED_FOR_M0B_READONLY_IMPLEMENTATION";
  }

  return {
    ok: false as const,
    readOnly: true as const,
    status,
    phase: "M-0D Operator Evidence Tracker",
    evidence,
    summary,
    blockers,
    warnings,
    nextActions,
    checkedAt,
  };
}
