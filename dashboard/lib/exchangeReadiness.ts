/**
 * dashboard/lib/exchangeReadiness.ts
 * Phase M-0 — Shadow Live / Read-only Exchange Sync Readiness
 *
 * ประเมินความพร้อมของ Phase M-0 แบบ NO NETWORK CALLS
 * ไม่เรียก BingX API จริง ไม่ใช้ credential จริง ไม่ส่ง order ใดๆ
 *
 * Hard Rules (ห้ามละเมิด):
 * - ห้าม import BingX execution / order / position logic
 * - ห้าม call fetch() / axios / http ไป BingX หรือ exchange ใดๆ
 * - ห้าม place / cancel / modify order
 * - ห้าม log API key / secret value
 * - ห้าม expose secret ไป client
 * - readOnly: true เสมอ
 * - ถ้า SHADOW_LIVE_ENABLED=true แต่ manualApprovalStatus != "approved"
 *   → status ยังเป็น WAITING_FOR_OPERATOR_APPROVAL
 */

export type ExchangeReadinessStatus =
  | "SHADOW_SYNC_DISABLED"
  | "WAITING_FOR_OPERATOR_APPROVAL"
  | "READY_FOR_READONLY_SETUP"
  | "BLOCKED";

export type PermissionCheckItem = {
  id: string;
  label: string;
  passed: boolean;
  note?: string;
};

export type ExchangeReadinessReport = {
  ok: boolean;
  readOnly: true;
  status: ExchangeReadinessStatus;
  shadowLiveEnabled: boolean;
  exchangeReadOnlySyncEnabled: boolean;
  manualApprovalRequired: true;
  manualApprovalStatus: "not_approved" | "approved";
  hasReadonlyApiKey: boolean;   // true/false only — ห้าม log value
  hasReadonlySecret: boolean;   // true/false only — ห้าม log value
  permissionChecklist: PermissionCheckItem[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
  checkedAt: string;            // ISO 8601 UTC
};

/**
 * evaluateExchangeReadiness()
 * Pure function — no network calls, no side effects
 * อ่าน env vars เพื่อประเมินสถานะเท่านั้น
 */
export function evaluateExchangeReadiness(): ExchangeReadinessReport {
  const checkedAt = new Date().toISOString();

  // ── Read env flags (server-side only) ────────────────────────────────
  const shadowLiveEnabled =
    process.env.SHADOW_LIVE_ENABLED === "true";
  const exchangeReadOnlySyncEnabled =
    process.env.EXCHANGE_READONLY_SYNC_ENABLED === "true";
  const liveTrading =
    process.env.LIVE_TRADING_ENABLED === "true";
  const orderPlacement =
    process.env.ENABLE_ORDER_PLACEMENT === "true";
  const productionReady =
    process.env.PRODUCTION_TRADING_READY === "true";

  // ห้าม log ค่า key จริง — แค่ตรวจว่ามีหรือไม่
  const hasReadonlyApiKey =
    typeof process.env.BINGX_READONLY_API_KEY === "string" &&
    process.env.BINGX_READONLY_API_KEY.trim().length > 0;
  const hasReadonlySecret =
    typeof process.env.BINGX_READONLY_SECRET === "string" &&
    process.env.BINGX_READONLY_SECRET.trim().length > 0;

  // ── Manual approval check ─────────────────────────────────────────────
  // Phase M-0 ต้องการ manual approval เสมอ
  // Operator ต้องตั้ง EXCHANGE_MANUAL_APPROVAL=approved เป็นลายลักษณ์อักษรหลังผ่าน gate
  // Default: "not_approved" — ปลอดภัยเสมอถ้าไม่ได้ตั้งค่า
  const manualApprovalStatus: "not_approved" | "approved" =
    process.env.EXCHANGE_MANUAL_APPROVAL === "approved" ? "approved" : "not_approved";

  // ── Permission checklist ──────────────────────────────────────────────
  const permissionChecklist: PermissionCheckItem[] = [
    {
      id: "no_live_trading",
      label: "LIVE_TRADING_ENABLED = false",
      passed: !liveTrading,
      note: liveTrading ? "❌ LIVE_TRADING_ENABLED must be false" : undefined,
    },
    {
      id: "no_order_placement",
      label: "ENABLE_ORDER_PLACEMENT = false",
      passed: !orderPlacement,
      note: orderPlacement ? "❌ ENABLE_ORDER_PLACEMENT must be false" : undefined,
    },
    {
      id: "no_production_ready",
      label: "PRODUCTION_TRADING_READY = false",
      passed: !productionReady,
      note: productionReady ? "❌ PRODUCTION_TRADING_READY must be false" : undefined,
    },
    {
      id: "readonly_key_only",
      label: "Read-only API key (no trade/order/withdraw permission)",
      passed: false, // Cannot verify permission level without network call — always false until manual verify
      note: "ต้อง verify manually ว่า API key ไม่มี trade/order/withdraw permission",
    },
    {
      id: "no_key_in_repo",
      label: "API key ไม่ถูก commit ลง repo",
      passed: true, // จะ fail ถ้ามีใน code — ตรวจ runtime ไม่ได้
      note: "ตรวจด้วย git grep BINGX_READONLY ก่อน commit",
    },
    {
      id: "secret_server_only",
      label: "Secret อยู่ server-side เท่านั้น (ไม่มี NEXT_PUBLIC_)",
      passed: true,
      note: "ห้ามใช้ NEXT_PUBLIC_BINGX_READONLY_* ใดๆ",
    },
    {
      id: "ip_whitelist",
      label: "IP whitelist วางแผนแล้ว",
      passed: false, // ต้อง verify manually
      note: "ต้องตั้ง IP whitelist บน BingX ก่อน enable sync",
    },
    {
      id: "manual_approval",
      label: "Operator approval เป็นลายลักษณ์อักษร",
      passed: manualApprovalStatus === "approved",
      note: "ต้องได้รับ operator approval ก่อน enable SHADOW_LIVE_ENABLED หรือ EXCHANGE_READONLY_SYNC_ENABLED",
    },
    {
      id: "rate_limit_budget",
      label: "Rate limit budget กำหนดแล้ว (ไม่กระทบ main snapshot pipeline)",
      passed: false, // ต้อง design ก่อน implement
      note: "วางแผน rate limit budget ก่อน implement read-only sync",
    },
  ];

  // ── Collect blockers ──────────────────────────────────────────────────
  const blockers: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];

  if (liveTrading)
    blockers.push("LIVE_TRADING_ENABLED=true — ต้องตั้งเป็น false ก่อน");
  if (orderPlacement)
    blockers.push("ENABLE_ORDER_PLACEMENT=true — ต้องตั้งเป็น false ก่อน");
  if (productionReady)
    blockers.push("PRODUCTION_TRADING_READY=true — ต้องตั้งเป็น false ก่อน");
  if (manualApprovalStatus !== "approved")
    blockers.push("Manual operator approval ยังไม่มี — ต้องได้รับก่อนเปิด exchange sync");

  if (!hasReadonlyApiKey && exchangeReadOnlySyncEnabled)
    blockers.push("EXCHANGE_READONLY_SYNC_ENABLED=true แต่ BINGX_READONLY_API_KEY ว่างเปล่า");
  if (!hasReadonlySecret && exchangeReadOnlySyncEnabled)
    blockers.push("EXCHANGE_READONLY_SYNC_ENABLED=true แต่ BINGX_READONLY_SECRET ว่างเปล่า");

  if (shadowLiveEnabled && manualApprovalStatus !== "approved")
    warnings.push("SHADOW_LIVE_ENABLED=true แต่ manual approval ยังไม่ได้รับ — exchange sync ถูก block");
  if (exchangeReadOnlySyncEnabled && manualApprovalStatus !== "approved")
    warnings.push("EXCHANGE_READONLY_SYNC_ENABLED=true แต่ manual approval ยังไม่ได้รับ — exchange sync ถูก block");

  // ── Next actions ──────────────────────────────────────────────────────
  nextActions.push("รัน npm run build บน Windows host และยืนยัน EXIT:0");
  nextActions.push("Collect paper fills ที่มี averageFillPrice จริงเพื่อ unlock paper edge review");

  if (manualApprovalStatus !== "approved") {
    nextActions.push(
      "ขอ operator approval เป็นลายลักษณ์อักษรก่อนเปิด SHADOW_LIVE_ENABLED หรือ EXCHANGE_READONLY_SYNC_ENABLED"
    );
    nextActions.push(
      "Review Phase M-0 read-only API permission checklist ใน PROJECT_MAP.md Section 16"
    );
  }

  if (!hasReadonlyApiKey)
    nextActions.push(
      "สร้าง BingX read-only API key (market data only — ไม่มี trade/order/withdraw) หลังได้รับ operator approval"
    );

  nextActions.push(
    "Verify ด้วย git grep ว่า BINGX_READONLY_* ไม่ถูก commit ลง repo"
  );

  // ── Determine status ──────────────────────────────────────────────────
  let status: ExchangeReadinessStatus;

  const hasHardBlockers = liveTrading || orderPlacement || productionReady;

  if (hasHardBlockers) {
    status = "BLOCKED";
  } else if (manualApprovalStatus !== "approved") {
    status = "WAITING_FOR_OPERATOR_APPROVAL";
  } else if (!shadowLiveEnabled && !exchangeReadOnlySyncEnabled) {
    status = "SHADOW_SYNC_DISABLED";
  } else {
    // Both flags on + manual approved → ready for setup
    status = "READY_FOR_READONLY_SETUP";
  }

  const ok =
    status === "READY_FOR_READONLY_SETUP" &&
    blockers.length === 0 &&
    !hasHardBlockers;

  return {
    ok,
    readOnly: true,
    status,
    shadowLiveEnabled,
    exchangeReadOnlySyncEnabled,
    manualApprovalRequired: true,
    manualApprovalStatus,
    hasReadonlyApiKey,
    hasReadonlySecret,
    permissionChecklist,
    blockers,
    warnings,
    nextActions,
    checkedAt,
  };
}
