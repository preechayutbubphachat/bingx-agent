type Decision = {
  regime?: string;
  market_mode?: string;
  confidence?: number;
  risk_warning?: string[];
  reason?: {
    trend?: string;
    momentum?: string;
    volatility?: string;
    orderflow?: string;
    smc?: string;
    news_impact?: string;
  };
  parameters_for_grid_or_trend?: {
    trend_entry?: number | null;
    trend_sl?: number | null;
    trend_tp?: number | null;
  };
  summary_for_bot?: string;
};

function pick(str?: string) {
  return (str ?? "").trim();
}

function has(str?: string, kw?: RegExp) {
  if (!str) return false;
  return kw ? kw.test(str) : str.length > 0;
}

function modeTH(regime?: string, marketMode?: string) {
  const r = regime ?? "";
  const m = marketMode ?? "";
  if (r.includes("TREND_DOWN") || m.includes("SHORT")) return "ขาลง (เอนลง)";
  if (r.includes("TREND_UP") || m.includes("LONG")) return "ขาขึ้น (เอนขึ้น)";
  if (r.includes("RANGE") || m.includes("GRID")) return "แกว่งในกรอบ";
  if (r.includes("NO_TRADE") || m.includes("NO_TRADE")) return "ความเสี่ยงสูง/รอดู";
  return "ไม่ชัด/รอดู";
}

function actionTH(regime?: string, marketMode?: string, riskWarnings?: string[]) {
  const r = regime ?? "";
  const m = marketMode ?? "";
  const rw = riskWarnings ?? [];
  const mismatch = rw.some(x => x.toLowerCase().includes("mismatch"));

  if (r.includes("NO_TRADE") || m.includes("NO_TRADE")) {
    return "โหมดรักษาทุน: รอข้อมูล/สัญญาณคอนเฟิร์มก่อนเข้า";
  }

  if (m.includes("TREND_SHORT")) {
    return mismatch
      ? "เอน Short แต่ “รอเด้งเข้าด้านบน” และต้องคอนเฟิร์ม (กัน squeeze)"
      : "เอน Short แต่เน้นรอ pullback/รีเจ็กก่อนค่อยเข้า";
  }

  if (m.includes("TREND_LONG")) {
    return "เอน Long แต่รอ pullback/คอนเฟิร์มก่อนค่อยตาม";
  }

  if (m.includes("GRID")) {
    return "เหมาะเล่นกริดแบบตั้งรับ (ไม่ถี่/ไม่ไล่) รอให้ตลาดนิ่งก่อน";
  }

  return "รอจังหวะ/รอคอนเฟิร์มก่อนตัดสินใจ";
}

function riskTH(newsImpact?: string, riskWarnings?: string[]) {
  const ni = newsImpact ?? "";
  const rw = (riskWarnings ?? []).join(" | ");

  // ข่าว
  const macroMed = /macro risk to MED|MED macro risk|FOMC|CPI|NFP/i.test(ni);
  const newsLow = /risk level is LOW|risk_level LOW|no hot news/i.test(ni);

  // warning
  const mismatch = /mismatch/i.test(rw);
  const stale = /stale|restart|discontinuity/i.test(rw);

  const parts: string[] = [];

  if (newsLow) parts.push("ข่าวสั้น ๆ เบา");
  if (macroMed) parts.push("สัปดาห์นี้มี Macro → ระวังสวิง");
  if (mismatch) parts.push("สัญญาณ Derivatives ไม่ตรงกัน → กันโดน squeeze");
  if (stale) parts.push("ข้อมูลบางส่วนอาจไม่สด → ลดความมั่นใจ");

  if (parts.length === 0) return "ความเสี่ยง: ปกติ → ยังต้องคุมขนาดและรอคอนเฟิร์ม";
  return `ความเสี่ยง: ${parts.join(" / ")}`;
}

export function buildPublicBulletsTH(decision: Decision) {
  const regime = decision.regime;
  const marketMode = decision.market_mode;

  const reasonTrend = pick(decision.reason?.trend);
  const reasonSMC = pick(decision.reason?.smc);
  const reasonMomentum = pick(decision.reason?.momentum);
  const newsImpact = pick(decision.reason?.news_impact);

  // 1) ภาพรวมตลาด (สั้น)
  const b1 = `ภาพรวม: ${modeTH(regime, marketMode)} — ตลาดกำลัง “ไหล/แกว่ง” มากกว่าการเร่งวิ่ง`;

  // 2) แผนทำอะไรตอนนี้ (สั้น)
  // ถ้ามี hint เรื่อง “อยู่ล่างกรอบ/รอเด้งเข้า supply” ให้ย้ำ
  const nearRangeLow =
    has(reasonSMC, /(near the bottom|bottom of the 4H range|range lows|equal[-\s]?low|85[\s,]?000)/i) ||
    has(reasonTrend, /(below|well below)/i);

  const action = actionTH(regime, marketMode, decision.risk_warning);
  const b2 = nearRangeLow
    ? `แผน: ${action} (ตอนนี้ราคาอยู่โซนล่างของกรอบ → ไม่ควรไล่เข้า)`
    : `แผน: ${action}`;

  // 3) ความเสี่ยง/ข้อควรระวัง (สั้น)
  // ถ้ามี session false breakout / low vol → เตือน whipsaw
  const whipsaw =
    has(decision.reason?.volatility, /(false[-\s]?breakout|whipsaw|low expected volatility|Asia range)/i) ||
    has(reasonMomentum, /(squeeze risk|crowded)/i);

  const r = riskTH(newsImpact, decision.risk_warning);
  const b3 = whipsaw ? `${r} / ระวังไส้หลอก-เด้งแรงในกรอบ` : r;

  return [b1, b2, b3];
}

export function buildOneLinerTH(decision: any, bullets: string[]) {
  const regime = String(decision?.regime ?? "");
  const mode = String(decision?.market_mode ?? "");
  const conf = typeof decision?.confidence === "number" ? Math.round(decision.confidence * 100) : null;

  let stance = "รอดูคอนเฟิร์ม";
  if (mode.includes("TREND_SHORT")) stance = "เอน Short แต่รอเด้งเข้าด้านบน";
  else if (mode.includes("TREND_LONG")) stance = "เอน Long แต่รอจังหวะย่อ";
  else if (mode.includes("GRID")) stance = "เล่นกริดแบบตั้งรับ";
  else if (mode.includes("NO_TRADE") || regime.includes("NO_TRADE")) stance = "โหมดรักษาทุน";

  const riskNote =
    (decision?.risk_warning ?? []).some((x: string) => String(x).toLowerCase().includes("mismatch"))
      ? " (กันโดน squeeze)"
      : "";

  const b0 = bullets?.[0] ? bullets[0].replace(/^ภาพรวม:\s*/g, "") : "ตลาดยังไม่ชัด";
  const c = conf !== null ? ` | Conf ${conf}%` : "";

  return `${b0} → ${stance}${riskNote}${c}`;
}

type Regime =
  | "TREND_UP"
  | "TREND_DOWN"
  | "RANGE"
  | "GRID"
  | "NO_TRADE"
  | "UNCERTAIN"

export function headlineByRegime(regime: Regime) {
  switch (regime) {
    case "TREND_DOWN":
      return {
        title: "ตลาดไหลลงด้วยแรงขายจริง",
        subtitle: "แต่โครงสร้างยังไม่เปิดให้ไล่ Short",
      }

    case "TREND_UP":
      return {
        title: "ตลาดยกตัวขึ้นด้วยแรงซื้อที่ชัดเจน",
        subtitle: "แต่ยังไม่ใช่จังหวะไล่ราคาโดยไม่รอจังหวะย่อ",
      }

    case "RANGE":
    case "GRID":
      return {
        title: "ตลาดแกว่งตัวในกรอบอย่างเป็นระบบ",
        subtitle: "กลยุทธ์ที่เหมาะสมคือรอราคาเล่นในกรอบ ไม่ไล่ทิศ",
      }

    case "NO_TRADE":
      return {
        title: "ตลาดยังไม่แสดงทิศทางที่ชัดเจน",
        subtitle:
          "การไม่เทรดในช่วงนี้คือการป้องกันความเสี่ยงที่ดีที่สุด",
      }

    default:
      return {
        title: "ตลาดกำลังเปลี่ยนโหมด",
        subtitle:
          "ความผันผวนสูง แต่โครงสร้างยังไม่ยืนยันฝั่งใด",
      }
  }
}
