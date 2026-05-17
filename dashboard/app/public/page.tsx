// dashboard/app/public/page.tsx
import { readLatest } from "@/lib/readLatest";
import { buildPublicBulletsTH, buildOneLinerTH } from "@/lib/publicSummaryTH";

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
import PlanStatusStateCard from "@/components/PlanStatusStateCard";
import DerivativesCard from "@/components/DerivativesCard";

import PlanStatusProvider from "@/components/plan-status/PlanStatusProvider";
import PlanStateCard from "@/components/PlanStateCard";
import RunCycleButton from "@/components/RunCycleButton";



/* ----------------- Normalize helpers ----------------- */

function normUpper(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
}

function isBadUnknown(x: unknown) {
  const v = normUpper(x);
  return !v || v === "UNKNOWN" || v === "N/A" || v === "NULL" || v === "UNDEFINED";
}

function normalizeMode(marketMode: unknown) {
  const m = normUpper(marketMode);
  return m || "UNKNOWN";
}

function normalizeRegime(regime: unknown, marketMode: unknown) {
  const r = normUpper(regime);
  const m = normUpper(marketMode);
  const key = `${r} ${m}`;

  // ถ้ามีค่าอยู่แล้วและไม่ใช่ UNKNOWN-ish ก็ใช้เลย
  if (!isBadUnknown(r)) return r;

  // derive จาก market_mode แบบ rule-based
  if (key.includes("NO_TRADE")) return "NO_TRADE";
  if (key.includes("TREND_DOWN") || key.includes("SHORT")) return "TREND_DOWN";
  if (key.includes("TREND_UP") || key.includes("LONG")) return "TREND_UP";
  if (key.includes("RANGE") || key.includes("GRID") || key.includes("CHOP")) return "RANGE";
  if (key.includes("TREND")) return "TREND";

  return "UNKNOWN";
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

  if (key.includes("NO_TRADE"))
    return "bg-neutral-500/15 text-neutral-200 border-neutral-500/30";
  if (key.includes("TREND_DOWN") || key.includes("SHORT"))
    return "bg-rose-500/15 text-rose-200 border-rose-500/30";
  if (key.includes("TREND_UP") || key.includes("LONG"))
    return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  if (key.includes("RANGE") || key.includes("GRID") || key.includes("CHOP"))
    return "bg-amber-500/15 text-amber-200 border-amber-500/30";

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

/* ----------------- Page ----------------- */

export default async function PublicPage() {
  const data = await readLatest();

  const d = data.decision as any;

  // ✅ Normalize สำหรับ UI + กัน d.regime ไม่มี
  const marketModeView = normalizeMode(d?.market_mode);
  const regimeView = normalizeRegime(d?.regime, marketModeView);

  // ✅ dView = เวอร์ชัน “พร้อมใช้งาน” ให้ summary builders
  const dView = {
    ...d,
    regime: regimeView,
    market_mode: marketModeView,
  };

  const bullets = buildPublicBulletsTH(dView);
  const oneLiner = buildOneLinerTH(dView, bullets);

  const { title: headlineTitle, subtitle: headlineSubtitle } = headlineByRegime(
    regimeView,
    marketModeView
  );

  const POST_HASHTAGS = "#BTC #BTCUSDT #MarketUpdate";
  const postText =
    `📊 Market Update (BTCUSDT)\n\n` +
    `${headlineTitle}\n` +
    `โหมดตลาด: ${regimeView} · กลยุทธ์: ${marketModeView}\n\n` +
    bullets.map((b: string) => `• ${b}`).join("\n") +
    `\n\n${POST_HASHTAGS}`;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 md:px-6 lg:px-8 2xl:px-10 py-8 md:py-10 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold">📊 Market Update</h1>
          <div className="flex items-center gap-3">
            <RefreshPageButton />
            <PageFreshBadge />
            <CopyPostButton text={postText} />
            <RunSnapshotButton />
            <RunCycleButton /> {/* ✅ เพิ่ม */}
          </div>
        </div>

        {/* Market Regime row + Live Cards (จาก /api/plan-status) */}
        <PlanStatusProvider>
          <MarketRegimeRow />

          <div className="grid gap-6 grid-cols-1 md:grid-cols-1 [@media(orientation:landscape)]:md:grid-cols-2">
            {/* Left */}
            <div className="space-y-6">
              <PlanStateCard />
              <PlanTrackerCard variant="CORE" />
              <DerivativesCard />
              <WinrateCard />
            </div>

            {/* Right */}
            <div className="space-y-6">
              <OBGateCard />
              <TimelineCard className="flex-1 min-h-0" />
            </div>
          </div>
        </PlanStatusProvider>


        {/* Headline / Top Card (จาก latest_decision.json) */}
        <div className="rounded-2xl bg-neutral-900 p-6 space-y-3">
          <div>
            <div className="text-xl font-semibold">{headlineTitle}</div>
            <div className="text-sm text-neutral-400">{headlineSubtitle}</div>
            <div className="mt-2 text-xs text-neutral-500">
              วิเคราะห์จากข้อมูลล่าสุด โดยประเมินโครงสร้างราคา สภาพคล่อง และแรงอนุพันธ์ร่วมกัน
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
            <span className={`rounded-full border px-3 py-1 ${badgeTone(regimeView, marketModeView)}`}>
              {regimeView}
            </span>
            <span className={`rounded-full border px-3 py-1 ${badgeTone(regimeView, marketModeView)}`}>
              {marketModeView}
            </span>
            <span className="text-neutral-500">
              Confidence: {pctOrDash(dView?.confidence)} — {confidenceLabel(dView?.confidence)}
            </span>
          </div>

          {/* Thai bullets */}
          <div className="mt-3 rounded-xl bg-neutral-950/60 p-4">
            <div className="text-sm text-neutral-400 mb-2">สรุปสั้น (ภาษาไทย)</div>
            <ul className="space-y-2 text-sm leading-relaxed text-neutral-200">
              {bullets.map((x: string, i: number) => (
                <li key={i}>• {x}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Step2 + JSON */}
        <div className="grid gap-6 md:grid-cols-2">
          <Step2Panel step2Text={data.step2Text ?? null} oneLiner={oneLiner} />

          <div className="rounded-2xl bg-neutral-900 p-6">
            <div className="text-sm text-neutral-400 mb-2">ข้อมูลระบบ (JSON / อ้างอิง)</div>
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">
              {JSON.stringify(
                {
                  regime: regimeView,
                  market_mode: marketModeView,
                  confidence: dView?.confidence,
                  risk_warning: dView?.risk_warning,
                  parameters_for_grid_or_trend: dView?.parameters_for_grid_or_trend,
                  _raw: {
                    d_regime: d?.regime,
                    d_market_mode: d?.market_mode,
                  },
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>

        <div className="text-xs text-neutral-500">
          อัปเดตล่าสุด: {new Date(data.updatedAt).toLocaleString()}
        </div>
      </div>
    </main>
  );
}
