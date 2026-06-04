import type { DynamicRegridVM } from "./viewModel";

const STATUS_LABELS: Record<string, string> = {
  BELOW_GRID: "ราคาอยู่นอกกรอบล่าง",
  INSIDE_GRID: "ราคาอยู่ในกรอบ",
  ABOVE_GRID: "ราคาอยู่นอกกรอบบน",
  REGRID_REQUIRED: "ต้องประเมินกริดใหม่",
  PAUSE_OUT_OF_RANGE: "พักเพราะราคาอยู่นอกกรอบ",
  PAUSE_EXPOSURE_LIMIT: "พักเพราะ exposure ฝั่งเดียวสูงเกินไป",
  STALE_DATA: "ข้อมูลไม่สด",
  NO_TRADE: "ยังไม่เปิดกริดใหม่",
  CANDIDATE_READY: "มี candidate พร้อมรอตรวจ",
  REGRID_CANDIDATE: "พบ candidate สำหรับกริดใหม่",
  DYNAMIC_GRID_ACTIVE: "กริดใหม่ผ่านรูปทรงแล้ว แต่ยังไม่เปิดใช้งาน",
  INACTIVE: "ยังไม่อยู่ในบริบท regrid",
  UNKNOWN: "ยังไม่ทราบสถานะ",
};

const REASON_LABELS: Record<string, string> = {
  price_below_grid_lower: "ราคาต่ำกว่าขอบล่างของกริด",
  price_above_grid_upper: "ราคาสูงกว่าขอบบนของกริด",
  one_sided_buy_limit: "มี BUY ค้างฝั่งเดียว ยังไม่มี SELL",
  one_sided_sell_limit: "มี SELL ค้างฝั่งเดียว ยังไม่มี BUY",
  stale_decision_or_price_mismatch: "ข้อมูล decision หรือราคายังไม่ตรงกัน",
};

export function regridStatusLabel(value: string | null | undefined): string {
  if (!value) return "ยังไม่มีข้อมูล";
  return STATUS_LABELS[value] ?? value;
}

export function noTradeReasonLabel(value: string | null | undefined): string {
  if (!value) return "ยังไม่มีเหตุผล no-trade";
  return REASON_LABELS[value] ?? value;
}

export function activationAllowedLabel(value: boolean | null | undefined): string {
  if (value === true) return "อนุญาตให้เปิดกริดใหม่";
  if (value === false) return "ยังไม่อนุญาตให้เปิดกริดใหม่";
  return "ยังไม่มีข้อมูลการอนุญาต";
}

export function formatRegridNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 }).format(value);
}

export function regridExposureLabel(regrid: DynamicRegridVM): string {
  if (regrid.buyFillCount > 0 && regrid.sellFillCount === 0) {
    return "มี BUY ค้างฝั่งเดียว ยังไม่มี SELL";
  }
  if (regrid.sellFillCount > 0 && regrid.buyFillCount === 0) {
    return "มี SELL ค้างฝั่งเดียว ยังไม่มี BUY";
  }
  return "มีข้อมูลทั้งสองฝั่งหรือยังไม่มี exposure เด่น";
}
