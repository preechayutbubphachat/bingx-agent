// dashboard/lib/trading-agent-hq/mockState.ts
// TradingAgentHQ — THQ-4 static mock ViewModel.
// HONEST mock: reflects real M-0Z-6 posture (paper LIVE, closedCycles=0 DATA_GAP, M-0B BLOCKED).
// NO real data binding here — THQ-5 replaces this with a public-safe adapter.

import type { TradingAgentHQViewModel } from "./viewModel";

export const MOCK_VIEW_MODEL: TradingAgentHQViewModel = {
  mode: "trading_agent_hq",
  meta: {
    lastUpdate: "—",
    source: "mock",
    isStale: true, // mock is never live truth
  },
  safety: {
    liveTradingEnabled: false,
    orderPlacementEnabled: false,
    productionTradingReady: false,
    exchangeManualApproval: "not_approved",
    phase: "M-0B_BLOCKED",
  },
  paper: {
    totalOrderFilled: 30,
    closedCycles: 0,
    sampleStatus: "INSUFFICIENT_SAMPLE",
    paperModeDetected: true,
    edgeStatus: "DATA_GAP", // closedCycles===0 → never edge PASS
    costGateStatus: "PASS",
    runtimeMonitor: {
      cumulativeBuyFillCount: 1460,
      cumulativeSellFillCount: 0,
      sampleBuyFillCount: 14,
      sampleSellFillCount: 0,
      paperNoTradeCount: 122,
      regridCandidateCount: 75,
      latestFillAt: null,
      latestNoTradeAt: null,
      latestRegridCandidateAt: null,
      buyCountStable: true,
      noTradeIncreasing: true,
      regridCandidateIncreasing: true,
      activationAllowed: false,
      priceVsGrid: "BELOW_GRID",
      paperLoopState: "REGRID_REQUIRED",
      monitorStatus: "PASS",
      monitorSummary: "STABLE_RUNTIME_PASS",
    },
    regridReadiness: {
      status: "NOT_READY",
      score: 40,
      passedGates: ["out_of_grid_context", "old_one_sided_exposure_quarantined"],
      failedGates: ["stable_candles_pending", "cooldown_pending", "candidate_grid_missing"],
      warnings: ["old_buy_exposure_quarantined_not_counted_as_closed_cycle"],
      nextAction: "wait_for_stability_cooldown_and_candidate_grid",
      operatorReviewRequired: false,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
    },
    paperEpoch: {
      currentEpochId: "static-grid:BELOW_GRID",
      previousEpochStatus: "OPEN_ONE_SIDED_EXPOSURE",
      previousEpochReason: "old static-grid BUY exposure is quarantined",
      nextEpochCandidateId: null,
      nextEpochStatus: "NOT_READY",
      oldExposurePolicy: [
        "QUARANTINE_OLD_ONE_SIDED_EXPOSURE",
        "DO_NOT_COUNT_AS_CLOSED_CYCLE",
        "DO_NOT_FORCE_SELL",
        "DO_NOT_USE_FOR_EXPECTANCY",
      ],
    },
    dynamicRegrid: {
      marketMode: "GRID_NEUTRAL",
      regime: "RANGE",
      priceVsGrid: "BELOW_GRID",
      paperLoopState: "REGRID_REQUIRED",
      lastNoTradeReason: "price_below_grid_lower",
      currentPrice: null,
      gridLower: null,
      gridUpper: null,
      gridMid: null,
      buyFillCount: 14,
      sellFillCount: 0,
      closedCycles: 0,
      candidate: {
        candidateStatus: "NO_TRADE",
        candidateReason: "Phase 1 read-only evaluator; activation blocked",
        cooldownRemaining: 4,
        stableCandleCount: 0,
        activationAllowed: false,
      },
    },
  },
  topHud: {
    marketMood: "UNKNOWN",
    simEquity: null,
    dailyPnl: null,
    riskHeat: "UNKNOWN",
    agentsActive: 2,
  },
  bottomLog: [
    { ts: "—", type: "SYSTEM", text: "TradingAgentHQ ตัวอย่าง (ข้อมูลจำลอง — ไม่ใช่ของจริง)" },
    { ts: "—", type: "FILL_RESULT", text: "บันทึก paper MARKET fill (จำลอง)", agentId: "grid_bot" },
    { ts: "—", type: "DECISION", text: "รอประเมิน regime (จำลอง)", agentId: "market_regime" },
    { ts: "—", type: "ALERT", text: "รอบปิดครบ = 0 → ยังไม่มีข้อมูลรอบปิด (honest)", agentId: "risk_manager" },
  ],
  agents: {
    grid_bot: {
      id: "grid_bot", status: "running", visualStates: ["running", "balancing_orders"],
      animation: "grid_working", bubble: "กำลังจัดสมดุลคำสั่ง… (จำลอง)",
      currentTask: "รอบ Paper grid", lastAction: "paper MARKET fill (จำลอง)",
      metric: "fills: 30", confidence: "n/a (paper)",
    },
    trend_bot: {
      id: "trend_bot", status: "unknown", visualStates: ["idle"],
      animation: "idle", bubble: "รอข้อมูล (จำลอง)",
      currentTask: "สแกนโมเมนตัม", lastAction: "—", metric: null, confidence: null,
    },
    risk_manager: {
      id: "risk_manager", status: "guarding", visualStates: ["calm"],
      animation: "idle", bubble: "เฝ้าระวังเงินทุน (จำลอง)",
      currentTask: "เฝ้าความเสี่ยง", lastAction: "ตรวจ flag", metric: "เงินจริง: ปิด", confidence: "safe-mode",
    },
    news_analyst: {
      id: "news_analyst", status: "unknown", visualStates: ["idle"],
      animation: "idle", bubble: "ไม่มีฟีดข่าว (จำลอง)",
      currentTask: "สแกนข่าว", lastAction: "—", metric: null, confidence: null,
    },
    market_regime: {
      id: "market_regime", status: "scanning", visualStates: ["thinking"],
      animation: "idle", bubble: "กำลังอ่าน regime… (จำลอง)",
      currentTask: "จำแนก regime", lastAction: "รอ decision", metric: "mode: UNKNOWN", confidence: null,
    },
    memory_brain: {
      id: "memory_brain", status: "logging", visualStates: ["idle"],
      animation: "idle", bubble: "กำลังบันทึก journal (จำลอง)",
      currentTask: "บันทึกตรวจสอบ (audit log)", lastAction: "เพิ่มเหตุการณ์", metric: null, confidence: null,
    },
  },
};
