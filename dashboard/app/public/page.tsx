// dashboard/app/public/page.tsx
import { readLatest } from "@/lib/readLatest";
import { buildPublicBulletsTH, buildOneLinerTH } from "@/lib/publicSummaryTH";
import { readSafetyFlags } from "@/lib/runtimeConfigValidation";
import { readSchedulerHeartbeat } from "@/lib/readSchedulerHeartbeat";
import { computeAlerts } from "@/lib/alertEngine";
import type { FreshnessInput } from "@/lib/alertEngine";

import SystemHealthBanner from "@/components/SystemHealthBanner";
import PaperModeBanner from "@/components/PaperModeBanner";
import SchedulerHeartbeatCard from "@/components/SchedulerHeartbeatCard";
import AutoRefreshController from "@/components/AutoRefreshController";
import AlertBanner from "@/components/AlertBanner";
import RuntimeAuditCard from "@/components/RuntimeAuditCard";
import PaperTradingCard from "@/components/PaperTradingCard";
import PaperJournalPanel from "@/components/PaperJournalPanel";
import LiveMigrationGateCard from "@/components/LiveMigrationGateCard";
import PaperPerformanceCard from "@/components/PaperPerformanceCard";
import ExchangeReadinessCard from "@/components/ExchangeReadinessCard";
import M0BPreflightCard from "@/components/M0BPreflightCard";
import OperatorEvidenceCard from "@/components/OperatorEvidenceCard";
import DashboardDiagnosticsCard from "@/components/DashboardDiagnosticsCard";
import CopyPostButton from "@/components/CopyPostButton";
import Step2Panel from "@/components/Step2Panel";
import RunSnapshotButton from "@/components/RunSnapshotButton";
import RefreshPageButton from "@/components/RefreshPageButton";

import PlanTrackerCard from "@/components/PlanTrackerCard";
import PageFreshBadge from "@/components/PageFreshBadge";
import OBGateCard from "@/components/OBGateCard";

import TimelineCard from "@/components/TimelineCard";
import MarketRegimeRow from "@/components/MarketRegimeRow";
import WinrateCard from "@/components/WinrateCard";
import DerivativesCard from "@/components/DerivativesCard";

import PlanStatusProvider from "@/components/plan-status/PlanStatusProvider";
import PlanStateCard from "@/components/PlanStateCard";
import RunCycleButton from "@/components/RunCycleButton";
import ManualOverridesCard from "@/components/ManualOverridesCard";

/* ----------------- types ----------------- */

type AnyRecord = Record<string, any>;
type FailSafeMode = "NORMAL" | "DEGRADED" | "HARD_STOP" | "UNKNOWN";

/* ----------------- Normalize helpers ----------------- */

function normUpper(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
}

function isBadUnknown(x: unknown) {
  const v = normUpper(x);
  return !v || v === "UNKNOWN" || v === "N/A" || v === "NULL" || v === "UNDEFINED";
}

function normalizeModeForDisplay(marketMode: unknown) {
  const m = normUpper(marketMode);
  return m || "UNKNOWN";
}

function normalizeRegimeForDisplay(regime: unknown, marketMode: unknown) {
  const r = normUpper(regime);
  const m = normUpper(marketMode);
  const key = `${r} ${m}`;

  if (!isBadUnknown(r)) return r;

  if (key.includes("NO_TRADE")) return "NO_TRADE";
  if (key.includes("TREND_DOWN") || key.includes("SHORT")) return "TREND_DOWN";
  if (key.includes("TREND_UP") || key.includes("LONG")) return "TREND_UP";
  if (key.includes("RANGE") || key.includes("GRID") || key.includes("CHOP")) return "RANGE";
  if (key.includes("TREND")) return "TREND";

  return "UNKNOWN";
}

function normalizeFailSafeMode(x: unknown): FailSafeMode {
  const v = normUpper(x);
  if (v === "NORMAL" || v === "DEGRADED" || v === "HARD_STOP") return v;
  return "UNKNOWN";
}

function asStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function asOwnershipBoundary(x: unknown) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const obj = x as AnyRecord;
  return {
    canonical_owned: asStringArray(obj.canonical_owned),
    route_live_owned: asStringArray(obj.route_live_owned),
    route_regenerated_owned: asStringArray(obj.route_regenerated_owned),
    route_persisted_outputs: asStringArray(obj.route_persisted_outputs),
  };
}

/* ----------------- UI helpers ----------------- */

function headlineByRegime(regime: string, marketMode: string) {
  const key = `${regime} ${marketMode}`.toUpperCase();

  if (key.includes("NO_TRADE")) {
    return {
      title: "ตลาดยังไม่แสดงทิศทางที่ชัดเจน",
      subtitle: "การไม่เทรดในช่วงนี้คือการป้องกันความเสี่ยงที่ดีที่สุด",
    };
  }

  if (key.includes("TREND_DOWN") || key.includes("SHORT")) {
    return {
      title: "ตลาดไหลลงด้วยแรงขายจริง",
      subtitle: "แต่โครงสร้างยังไม่เปิดให้ไล่ Short",
    };
  }

  if (key.includes("TREND_UP") || key.includes("LONG")) {
    return {
      title: "ตลาดยกตัวขึ้นด้วยแรงซื้อที่ชัดเจน",
      subtitle: "แต่ยังไม่ใช่จังหวะไล่ราคาโดยไม่รอจังหวะย่อ",
    };
  }

  if (key.includes("RANGE") || key.includes("GRID") || key.includes("CHOP")) {
    return {
      title: "ตลาดแกว่งตัวในกรอบอย่างเป็นระบบ",
      subtitle: "กลยุทธ์ที่เหมาะสมคือรอราคาเล่นในกรอบ ไม่ไล่ทิศ",
    };
  }

  return {
    title: "ตลาดกำลังเปลี่ยนโหมด",
    subtitle: "ความผันผวนสูง แต่โครงสร้างยังไม่ยืนยันฝั่งใด",
  };
}

function badgeTone(regime: string, marketMode: string) {
  const key = `${regime} ${marketMode}`.toUpperCase();

  if (key.includes("NO_TRADE")) {
    return "bg-neutral-500/15 text-neutral-200 border-neutral-500/30";
  }
  if (key.includes("TREND_DOWN") || key.includes("SHORT")) {
    return "bg-rose-500/15 text-rose-200 border-rose-500/30";
  }
  if (key.includes("TREND_UP") || key.includes("LONG")) {
    return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  }
  if (key.includes("RANGE") || key.includes("GRID") || key.includes("CHOP")) {
    return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  }

  return "bg-sky-500/15 text-sky-200 border-sky-500/30";
}

function confidenceLabel(confidence?: number) {
  const c = typeof confidence === "number" ? confidence : 0;
  if (c >= 0.72) return "ความมั่นใจสูง";
  if (c >= 0.55) return "ความชัดเจนยังไม่ครบ";
  return "ตลาดยังไม่ให้จังหวะ";
}

function pctOrDash(conf?: number) {
  if (typeof conf !== "number" || !Number.isFinite(conf)) return "—";
  return `${Math.round(conf * 100)}%`;
}

function failSafeTone(mode: FailSafeMode) {
  if (mode === "HARD_STOP") return "bg-rose-500/15 text-rose-200 border-rose-500/30";
  if (mode === "DEGRADED") return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  if (mode === "NORMAL") return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  return "bg-neutral-500/15 text-neutral-200 border-neutral-500/30";
}

function failSafeLabel(mode: FailSafeMode) {
  if (mode === "HARD_STOP") return "HARD_STOP";
  if (mode === "DEGRADED") return "DEGRADED";
  if (mode === "NORMAL") return "NORMAL";
  return "UNKNOWN";
}

function payloadTone(kind: string) {
  const k = normUpper(kind);
  if (k.includes("RESPONSE")) return "border-sky-500/30 bg-sky-500/10 text-sky-100";
  if (k.includes("DISK")) return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  return "border-neutral-700 bg-neutral-950 text-neutral-300";
}

function truthNoteByFailSafe(mode: FailSafeMode) {
  if (mode === "HARD_STOP") {
    return "live route ควรถูกมองเป็นภาวะหยุดเสี่ยง — หน้าอาจเหลือ public-view / diagnostic truth มากกว่าการตีความเชิง action";
  }
  if (mode === "DEGRADED") {
    return "live route ยังเป็น truth หลัก แต่ต้องอ่านพร้อม fail-safe reasons และไม่ตีความเชิงรุกเกินข้อมูล";
  }
  if (mode === "NORMAL") {
    return "live route เป็น truth หลักของหน้า และ SSR snapshot ใช้เป็น summary เท่านั้น";
  }
  return "ไม่พบ fail-safe mode ที่เชื่อถือได้ — ห้ามให้ SSR summary กลายเป็น owner ของ live state";
}

/* ----------------- SSR snapshot view model ----------------- */

function buildSnapshotView(decision: AnyRecord) {
  const snapshotMarketMode = normalizeModeForDisplay(decision.market_mode);
  const snapshotRegime = normalizeRegimeForDisplay(decision.regime, snapshotMarketMode);

  return {
    ...decision,
    regime: snapshotRegime,
    market_mode: snapshotMarketMode,
  } as AnyRecord;
}

/* ----------------- Next page cache guards ----------------- */

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/* ----------------- Page ----------------- */

const DEPLOYMENT_BUILD_MARKER = "M-0G / main / 2026-05-26T11:20:00+07:00";

export default async function PublicPage() {
  const latest = await readLatest();
  // Phase F: อ่าน scheduler heartbeat สำหรับ monitoring card
  const heartbeatResult = await readSchedulerHeartbeat();

  const snapshotDecision = latest.ok ? ((latest.decision ?? {}) as AnyRecord) : {};
  const snapshotView = buildSnapshotView(snapshotDecision);

  const snapshotRegime = snapshotView.regime as string;
  const snapshotMarketMode = snapshotView.market_mode as string;

  /**
   * สำคัญ:
   * หน้า public นี้ต้องไม่สมมติว่า readLatest() มี live route payload เสมอ
   * เพราะ owner ของ live truth คือ /api/plan-status ผ่าน provider ใน client tree
   * ดังนั้น latest.planStatus ใช้ได้แค่ optional diagnostic surface เท่านั้น
   */
  const diagnosticPlanStatus = ((latest as AnyRecord)?.planStatus ?? null) as AnyRecord | null;

  const diagnosticFailSafeMode = normalizeFailSafeMode(diagnosticPlanStatus?.fail_safe?.mode);
  const diagnosticPayloadKind = String(diagnosticPlanStatus?.payload_kind ?? "UNAVAILABLE_FROM_SSR");
  const diagnosticResolvedPlanSource = String(
    diagnosticPlanStatus?.resolved_plan_source ?? "UNAVAILABLE_FROM_SSR"
  );
  const diagnosticRouteBuildMarker = String(
    diagnosticPlanStatus?.route_build_marker ?? "UNAVAILABLE_FROM_SSR"
  );
  const diagnosticRouteSourceMarker = String(
    diagnosticPlanStatus?.route_source_marker ?? "UNAVAILABLE_FROM_SSR"
  );
  const diagnosticCanonicalHasPlan = Boolean(
    diagnosticPlanStatus?.canonical?.root_plan_present ??
      diagnosticPlanStatus?.canonical?.has_plan ??
      diagnosticPlanStatus?.canonical_status_meta?.root_plan_present ??
      diagnosticPlanStatus?.canonical_status_meta?.has_plan
  );
  const diagnosticFailSafeReasons = asStringArray(diagnosticPlanStatus?.fail_safe?.reasons);
  const ownershipBoundary = asOwnershipBoundary(diagnosticPlanStatus?.field_ownership_boundary);
  const hasSsrDiagnosticPlanStatus = Boolean(diagnosticPlanStatus);

  const bullets = buildPublicBulletsTH(snapshotView);
  const oneLiner = buildOneLinerTH(snapshotView, bullets);

  const { title: headlineTitle, subtitle: headlineSubtitle } = headlineByRegime(
    snapshotRegime,
    snapshotMarketMode
  );

  // PageFreshBadge props
  const sourceMeta = (latest.sourceInfo ?? (latest as any).sourceMeta ?? null) as any;
  const latestFreshness = latest.freshness as
    | { tag?: string; ageSec?: number | null }
    | undefined;
  const pageBadgeFreshness: { tag?: string; ageSec?: number | null } | null =
    latestFreshness?.tag || typeof latestFreshness?.ageSec !== "undefined"
      ? latestFreshness
      : null;
  const pageBadgeDecisionKind: "root" | "mirror" | null =
    (sourceMeta?.selected?.decision?.kind as "root" | "mirror" | undefined) ?? null;
  const pageBadgeSnapshotKind: "root" | "mirror" | null =
    (sourceMeta?.selected?.marketSnapshot?.kind as "root" | "mirror" | undefined) ?? null;
  const pageBadgeHasDecision = Boolean(sourceMeta?.selected?.decision?.ok);
  const pageBadgeHasSnapshot = Boolean(sourceMeta?.selected?.marketSnapshot?.ok);

  // ─── Phase G: compute alerts (ต้องอยู่หลัง pageBadgeHasDecision/Snapshot) ──
  const alertFreshness: FreshnessInput = {
    tag: (latestFreshness?.tag ?? "UNKNOWN") as FreshnessInput["tag"],
    ageSec: latestFreshness?.ageSec ?? null,
    hasDecision: pageBadgeHasDecision,
    hasSnapshot: pageBadgeHasSnapshot,
  };
  const activeAlerts = computeAlerts(alertFreshness, heartbeatResult);

  // ─── Phase E: Production safety banner props ─────────────────────────────
  const safetyFlags = readSafetyFlags();
  const bannerWarnings: string[] = Array.isArray((latest as any).warnings)
    ? ((latest as any).warnings as string[])
    : [];
  const bannerSourceStatus = sourceMeta
    ? {
        resolvedFrom: ((sourceMeta as any).resolvedFrom as string | undefined) ?? "unknown",
        envOk: pageBadgeHasDecision || pageBadgeHasSnapshot,
      }
    : undefined;
  // healthy = ทั้ง decision และ snapshot มาจาก root และ ok
  const bannerHealthy = pageBadgeHasDecision && pageBadgeHasSnapshot;

  const POST_HASHTAGS = "#BTC #BTCUSDT #MarketUpdate";
  const postText =
    `📊 Market Update (BTCUSDT)\n\n` +
    `${headlineTitle}\n` +
    `โหมดตลาด: ${snapshotRegime} · กลยุทธ์: ${snapshotMarketMode}\n\n` +
    bullets.map((b: string) => `• ${b}`).join("\n") +
    `\n\n${POST_HASHTAGS}`;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-3 py-8 sm:px-4 md:px-6 md:py-10 lg:px-8 2xl:px-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold">📊 Market Update</h1>
            <div className="text-xs text-neutral-500">
              หน้าเดียว แต่มี 2 truth model: live route truth ด้านบน และ SSR snapshot summary ด้านล่าง
            </div>
            <div className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-100">
              Dashboard build marker: {DEPLOYMENT_BUILD_MARKER}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* Phase F: Auto-refresh controller */}
            <AutoRefreshController intervalSec={30} defaultOn={true} />
            <RefreshPageButton />
            <PageFreshBadge
              freshness={pageBadgeFreshness}
              decisionKind={pageBadgeDecisionKind}
              snapshotKind={pageBadgeSnapshotKind}
              hasDecision={pageBadgeHasDecision}
              hasSnapshot={pageBadgeHasSnapshot}
            />
            <CopyPostButton text={postText} />
            <RunSnapshotButton />
            <RunCycleButton />

            <a
              href="/api/download?file=market_snapshot.json"
              className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
              title="Download market_snapshot.json"
            >
              ⬇ Snapshot
            </a>

            <a
              href="/api/download?file=derivatives_history_cache.json"
              className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
              title="Download derivatives_history_cache.json"
            >
              ⬇ Derivatives
            </a>

            <a
              href="/api/download?file=news_context.json"
              className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
              title="Download news_context.json"
            >
              ⬇ News
            </a>
          </div>
        </div>

        {/* ── Phase E: System Health Banner ────────────────────────────────── */}
        <SystemHealthBanner
          safetyFlags={safetyFlags}
          healthy={bannerHealthy}
          warnings={bannerWarnings}
          sourceStatus={bannerSourceStatus}
        />

        {/* ── Phase H: Paper/Execution Mode Banner ─────────────────────────── */}
        <PaperModeBanner />

        {/* ── Phase F: Scheduler Heartbeat Card ────────────────────────────── */}
        <SchedulerHeartbeatCard result={heartbeatResult} />

        {/* ── Phase G: Alert Banner ─────────────────────────────────────────── */}
        <AlertBanner alerts={activeAlerts} />

        {/* Phase M-0I: Endpoint/runtime payload diagnostics */}
        <DashboardDiagnosticsCard />

        {/* ── Phase I: Runtime State Audit Card ────────────────────────────── */}
        <RuntimeAuditCard />

        {/* ── Phase J: Paper Trading Simulation Dashboard ──────────────────── */}
        <PaperTradingCard />
        <PaperJournalPanel />

        {/* ── Phase K: Live Migration Gate ── */}
        <PaperPerformanceCard />
        <LiveMigrationGateCard />
        {/* Phase M-0 — Shadow Live / Read-only Exchange Sync Readiness */}
        <ExchangeReadinessCard />
        {/* Phase M-0B — Preflight Gate (approval checklist before exchange API) */}
        <M0BPreflightCard />
        {/* Phase M-0D — Operator Evidence Tracker (evidence intake before Phase M-0B unblock) */}
        <OperatorEvidenceCard />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              Live Route Truth
            </span>
            <span className="text-xs text-neutral-500">
              cards ชุดนี้อ่านจาก /api/plan-status ผ่าน provider และควรเป็นแหล่ง truth หลักของหน้า
            </span>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                live owner: /api/plan-status
              </span>
              <span className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-neutral-300">
                SSR diagnostic route payload: {hasSsrDiagnosticPlanStatus ? "present" : "absent"}
              </span>
              <span className={`rounded-full border px-3 py-1 ${failSafeTone(diagnosticFailSafeMode)}`}>
                SSR fail-safe diagnostic: {failSafeLabel(diagnosticFailSafeMode)}
              </span>
              <span className={`rounded-full border px-3 py-1 ${payloadTone(diagnosticPayloadKind)}`}>
                SSR payload diagnostic: {diagnosticPayloadKind}
              </span>
            </div>

            <div className="mt-3 text-xs text-neutral-400">{truthNoteByFailSafe(diagnosticFailSafeMode)}</div>

            <div className="mt-3 rounded-xl bg-neutral-950/60 p-3 text-xs text-neutral-300">
              บล็อคนี้มีไว้ประกาศ boundary เท่านั้น: live cards ด้านล่างต้องเชื่อ provider route truth ก่อนเสมอ ส่วน SSR
              summary ใช้เพื่อสรุปโพสต์/อ้างอิงเร็ว ไม่ใช่ owner ของ state ปัจจุบัน
            </div>

            {(hasSsrDiagnosticPlanStatus || diagnosticFailSafeReasons.length > 0) && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-neutral-950/60 p-3">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">SSR diagnostic route markers</div>
                  <div className="space-y-1 text-xs text-neutral-300">
                    <div>resolved plan source: {diagnosticResolvedPlanSource}</div>
                    <div>canonical root plan: {diagnosticCanonicalHasPlan ? "present" : "missing"}</div>
                    <div>source marker: {diagnosticRouteSourceMarker}</div>
                    <div>build marker: {diagnosticRouteBuildMarker}</div>
                  </div>
                </div>

                <div className="rounded-xl bg-neutral-950/60 p-3">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">SSR fail-safe reasons</div>
                  {diagnosticFailSafeReasons.length ? (
                    <ul className="space-y-1 text-xs text-neutral-300">
                      {diagnosticFailSafeReasons.map((reason: string, index: number) => (
                        <li key={`${reason}-${index}`}>• {reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-neutral-500">ไม่มี reason จาก SSR diagnostic payload ตอนนี้</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <PlanStatusProvider>
            <MarketRegimeRow />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
              <div className="flex min-h-0 flex-col gap-6">
                <PlanStateCard />
                <PlanTrackerCard variant="CORE" />
                <WinrateCard />
              </div>

              <div className="flex min-h-0 flex-col gap-6">
                <DerivativesCard />
                <OBGateCard />
                <TimelineCard className="min-h-0 flex-1" />
              </div>
            </div>
          </PlanStatusProvider>
        </section>

        <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
              SSR Snapshot Summary
            </span>
            <span className="text-xs text-neutral-500">
              ส่วนนี้มาจาก readLatest() ฝั่ง SSR ใช้สำหรับสรุปโพสต์/อ้างอิงเร็ว และอาจไม่เท่ากับ live cards ทุกวินาที
            </span>
          </div>

          <div>
            <div className="text-xl font-semibold">{headlineTitle}</div>
            <div className="text-sm text-neutral-400">{headlineSubtitle}</div>
            <div className="mt-2 text-xs text-neutral-500">
              วิเคราะห์จาก snapshot ล่าสุดของ readLatest() ไม่ใช่ตัว truth หลักของ live route
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
            <span className={`rounded-full border px-3 py-1 ${badgeTone(snapshotRegime, snapshotMarketMode)}`}>
              {snapshotRegime}
            </span>
            <span className={`rounded-full border px-3 py-1 ${badgeTone(snapshotRegime, snapshotMarketMode)}`}>
              {snapshotMarketMode}
            </span>
            <span className="text-neutral-500">
              Confidence: {pctOrDash(snapshotView?.confidence)} — {confidenceLabel(snapshotView?.confidence)}
            </span>
          </div>

          <div className="mt-3 rounded-xl bg-neutral-950/60 p-4">
            <div className="mb-2 text-sm text-neutral-400">สรุปสั้น (ภาษาไทย)</div>
            <ul className="space-y-2 text-sm leading-relaxed text-neutral-200">
              {bullets.map((x: string, i: number) => (
                <li key={i}>• {x}</li>
              ))}
            </ul>
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <Step2Panel step2Text={latest.ok ? latest.step2Text ?? null : null} oneLiner={oneLiner} />

          <div className="rounded-2xl bg-neutral-900 p-6">
            <div className="mb-2 text-sm text-neutral-400">ข้อมูลระบบ (JSON / อ้างอิง)</div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 text-xs text-neutral-300">
              <div>owner: /api/plan-status</div>
              <div>SSR payload: {hasSsrDiagnosticPlanStatus ? diagnosticPayloadKind : "absent"}</div>
              <div>SSR fail-safe: {failSafeLabel(diagnosticFailSafeMode)}</div>
              <div>root decision/snapshot: {pageBadgeHasDecision && pageBadgeHasSnapshot ? "available" : "incomplete"}</div>
            </div>
            <details className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
              <summary className="cursor-pointer text-xs font-medium text-neutral-300">Debug details (collapsed)</summary>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">
              {JSON.stringify(
                {
                  live_truth_model: {
                    owner: "/api/plan-status",
                    sections: [
                      "MarketRegimeRow",
                      "PlanStateCard",
                      "PlanTrackerCard",
                      "DerivativesCard",
                      "OBGateCard",
                      "TimelineCard",
                    ],
                    rule: "route truth must win over SSR summary",
                    note: "public page must not let readLatest().planStatus override provider-backed live cards",
                  },
                  ssr_diagnostic_route_payload: {
                    present: hasSsrDiagnosticPlanStatus,
                    payload_kind: diagnosticPayloadKind,
                    fail_safe_mode: diagnosticFailSafeMode,
                    resolved_plan_source: diagnosticResolvedPlanSource,
                    canonical_root_plan_present: diagnosticCanonicalHasPlan,
                    route_markers: {
                      source: diagnosticRouteSourceMarker,
                      build: diagnosticRouteBuildMarker,
                    },
                  },
                  ssr_snapshot_model: {
                    owner: "readLatest()",
                    ok: latest.ok,
                    error: latest.ok ? null : (latest as any).error,
                    sourceInfo: latest.sourceInfo ?? (latest as any).sourceMeta ?? null,
                    freshness: latest.freshness ?? null,
                    warnings: (latest as any).warnings ?? [],
                    usage: [
                    "SSR regime/mode into provider-backed cards",
                    "SSR confidence into route-backed status cards",
                    "SSR diagnostic planStatus into live provider truth",
                    ],
                  },
                },
                null,
                2
              )}
            </pre>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}
