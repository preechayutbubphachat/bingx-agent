import { readLatest } from "@/lib/readLatest";
import { buildPublicBulletsTH, buildOneLinerTH } from "@/lib/publicSummaryTH";
import CopyPostButton from "@/components/CopyPostButton";
import Step2Panel from "@/components/Step2Panel";
import RunSnapshotButton from "@/components/RunSnapshotButton";
import RefreshPageButton from "@/components/RefreshPageButton";
import PlanTrackerCard from "@/components/PlanTrackerCard";
import PageFreshBadge from "@/components/PageFreshBadge";

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

  if (key.includes("RANGE") || key.includes("GRID")) {
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
  if (key.includes("NO_TRADE")) return "bg-neutral-500/15 text-neutral-200 border-neutral-500/30";
  if (key.includes("TREND_DOWN") || key.includes("SHORT"))
    return "bg-rose-500/15 text-rose-200 border-rose-500/30";
  if (key.includes("TREND_UP") || key.includes("LONG"))
    return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  if (key.includes("RANGE") || key.includes("GRID"))
    return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  return "bg-sky-500/15 text-sky-200 border-sky-500/30";
}

function confidenceLabel(confidence?: number) {
  const c = typeof confidence === "number" ? confidence : 0;
  if (c >= 0.72) return "ความมั่นใจสูง";
  if (c >= 0.55) return "ความชัดเจนยังไม่ครบ";
  return "ตลาดยังไม่ให้จังหวะ";
}

export default async function PublicPage() {
  const data = await readLatest();

  if (!data.ok) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-3xl px-5 py-10">
          <div className="rounded-2xl bg-rose-500/10 p-6 text-rose-200">
            Error: {data.error}
            <br />
            dir: {data.dir}
          </div>
        </div>
      </main>
    );
  }

  const d = data.decision;

  const bullets = buildPublicBulletsTH(d);
  const oneLiner = buildOneLinerTH(d, bullets);

  const { title: headlineTitle, subtitle: headlineSubtitle } = headlineByRegime(d.regime, d.market_mode);

  const POST_HASHTAGS = "#BTC #BTCUSDT #MarketUpdate";
  const postText =
    `📊 Market Update (BTCUSDT)\n\n` +
    `${headlineTitle}\n` +
    `โหมดตลาด: ${d.regime} · กลยุทธ์: ${d.market_mode}\n\n` +
    bullets.map((b) => `• ${b}`).join("\n") +
    `\n\n${POST_HASHTAGS}`;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-5 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold">📊 Market Update</h1>
          <div className="flex items-center gap-3">
            <RefreshPageButton />
            <PageFreshBadge />
            <CopyPostButton text={postText} />
            <RunSnapshotButton />
          </div>

        </div>

        {/* ✅ Plan Tracker (อัปเดตถี่ ไม่ใช้ข่าว) */}
        <PlanTrackerCard />

        {/* Top Card เดิม */}
        <div className="rounded-2xl bg-neutral-900 p-6 space-y-3">
          ...
        </div>

        {/* Top Card */}
        <div className="rounded-2xl bg-neutral-900 p-6 space-y-3">
          <div>
            <div className="text-xl font-semibold">{headlineTitle}</div>
            <div className="text-sm text-neutral-400">{headlineSubtitle}</div>
            <div className="mt-2 text-xs text-neutral-500">
              วิเคราะห์จากข้อมูลล่าสุด โดยประเมินโครงสร้างราคา สภาพคล่อง และแรงอนุพันธ์ร่วมกัน
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
            <span className={`rounded-full border px-3 py-1 ${badgeTone(d.regime, d.market_mode)}`}>
              {d.regime}
            </span>
            <span className={`rounded-full border px-3 py-1 ${badgeTone(d.regime, d.market_mode)}`}>
              {d.market_mode}
            </span>
            <span className="text-neutral-500">
              Confidence: {(d.confidence * 100).toFixed(0)}% — {confidenceLabel(d.confidence)}
            </span>
          </div>

          {/* Thai 3 bullets */}
          <div className="mt-3 rounded-xl bg-neutral-950/60 p-4">
            <div className="text-sm text-neutral-400 mb-2">สรุปสั้น (ภาษาไทย)</div>
            <ul className="space-y-2 text-sm leading-relaxed text-neutral-200">
              {bullets.map((x, i) => (
                <li key={i}>• {x}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Split: STEP02 Panel (highlight + jump + one-liner) + JSON */}
        <div className="grid gap-6 md:grid-cols-2">
          <Step2Panel step2Text={data.step2Text ?? null} oneLiner={oneLiner} />

          <div className="rounded-2xl bg-neutral-900 p-6">
            <div className="text-sm text-neutral-400 mb-2">ข้อมูลระบบ (JSON / อ้างอิง)</div>
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">
              {JSON.stringify(
                {
                  regime: d.regime,
                  market_mode: d.market_mode,
                  confidence: d.confidence,
                  risk_warning: d.risk_warning,
                  parameters_for_grid_or_trend: d.parameters_for_grid_or_trend,
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>

        <div className="text-xs text-neutral-500">อัปเดตล่าสุด: {new Date(data.updatedAt).toLocaleString()}</div>
      </div>
    </main>
  );
}
