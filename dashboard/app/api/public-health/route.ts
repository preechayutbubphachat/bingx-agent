import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RuntimeFileStatus = "exists" | "missing" | "optional_missing";
type PublicApprovalStatus = "approved" | "not_approved";
type RuntimeCoreFilename =
  | "latest_decision.json"
  | "market_snapshot.json"
  | "scheduler_heartbeat.json"
  | "plan_status.json"
  | "news_context.json";

const PROJECT_ROOT =
  process.env.BINGX_AGENT_DIR?.trim() ||
  process.env.DATA_DIR?.trim() ||
  process.env.AGENT_DIR?.trim() ||
  process.cwd();

function envFlagEnabled(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "enabled";
}

function exchangeManualApproval(): PublicApprovalStatus {
  return process.env.EXCHANGE_MANUAL_APPROVAL?.trim().toLowerCase() === "approved"
    ? "approved"
    : "not_approved";
}

function runtimeFilePath(filename: RuntimeCoreFilename): string {
  switch (filename) {
    case "latest_decision.json":
      return path.join(PROJECT_ROOT, "latest_decision.json");
    case "market_snapshot.json":
      return path.join(PROJECT_ROOT, "market_snapshot.json");
    case "scheduler_heartbeat.json":
      return path.join(PROJECT_ROOT, "scheduler_heartbeat.json");
    case "plan_status.json":
      return path.join(PROJECT_ROOT, "plan_status.json");
    case "news_context.json":
      return path.join(PROJECT_ROOT, "news_context.json");
  }
}

function fileStatus(filename: RuntimeCoreFilename, optional = false): RuntimeFileStatus {
  try {
    return fs.existsSync(runtimeFilePath(filename))
      ? "exists"
      : optional
        ? "optional_missing"
        : "missing";
  } catch {
    return optional ? "optional_missing" : "missing";
  }
}

export async function GET() {
  const liveTradingEnabled = envFlagEnabled("LIVE_TRADING_ENABLED");
  const orderPlacementEnabled = envFlagEnabled("ENABLE_ORDER_PLACEMENT");
  const productionReady = envFlagEnabled("PRODUCTION_TRADING_READY");
  const approval = exchangeManualApproval();

  const runtimeCoreFiles = {
    latestDecision: fileStatus("latest_decision.json"),
    marketSnapshot: fileStatus("market_snapshot.json"),
    schedulerHeartbeat: fileStatus("scheduler_heartbeat.json"),
    planStatus: fileStatus("plan_status.json"),
    newsContext: fileStatus("news_context.json", true),
  };

  const warnings: string[] = [];
  if (runtimeCoreFiles.newsContext === "optional_missing") {
    warnings.push("news_context_optional_missing");
  }

  const requiredRuntimeMissing = Object.entries(runtimeCoreFiles)
    .filter(([key, status]) => key !== "newsContext" && status !== "exists")
    .map(([key]) => `${key}_missing`);

  warnings.push(...requiredRuntimeMissing);

  const blockers = [
    "authenticated_endpoint_verification_pending",
    "public_visual_check_pending",
    "paper_fill_evidence_pending",
    "exchange_manual_approval_not_approved",
  ];

  if (liveTradingEnabled) blockers.push("live_trading_flag_must_remain_false");
  if (orderPlacementEnabled) blockers.push("order_placement_flag_must_remain_false");
  if (productionReady) blockers.push("production_ready_flag_must_remain_false");
  if (approval === "approved") blockers.push("exchange_manual_approval_should_not_be_approved_yet");

  return NextResponse.json(
    {
      ok: true,
      status: "SAFE_PUBLIC_HEALTH",
      phase: "M-0B_BLOCKED",
      liveTradingEnabled,
      orderPlacementEnabled,
      productionReady,
      exchangeManualApproval: approval,
      runtimeCoreFiles,
      auth: {
        protectedEndpoints: true,
        unauthenticatedApiRedirect: "expected",
      },
      blockers,
      warnings,
      nextActions: [
        "verify authenticated endpoints after login",
        "verify /public dashboard",
        "collect paper fill evidence with averageFillPrice",
        "keep Phase M-0B blocked",
      ],
      generatedAt: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
