"use client";

import { useEffect, useMemo, useRef } from "react";
import type { IChartApi, CandlestickData, Time } from "lightweight-charts";

type Candle = { time: number; open: number; high: number; low: number; close: number };

type MapLineKind =
  | "SWING_HIGH"
  | "SWING_LOW"
  | "EQ"
  | "EQH"
  | "EQL"
  | "RANGE_TOP"
  | "RANGE_BOT"
  | "PULLBACK_HIGH"
  | "PULLBACK_LOW"
  | "ENTRY_LOW"
  | "ENTRY_HIGH"
  | "ENTRY_MID"
  | "SL"
  | "TP1"
  | "GRID_U"
  | "GRID_L"
  | "MAGNET";

type Line = { price: number; title: string; kind?: MapLineKind | string };

type Props = {
  candles?: Candle[];
  lines?: Line[];
  height?: number;

  // ✅ จำนวนแท่งที่ “โชว์” (default 200)
  visibleCount?: number;

  // ✅ ไว้โชว์ overlay เช่น "1h"
  labelTf?: string;
};

function toSec(t: number): Time {
  const sec = t < 1e12 ? Math.floor(t) : Math.floor(t / 1000);
  return sec as Time;
}

function safeNum(x: any): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function kindPriority(kind?: string) {
  switch (kind) {
    case "SL":
      return 100;
    case "TP1":
      return 90;
    case "ENTRY_MID":
      return 88;
    case "ENTRY_LOW":
    case "ENTRY_HIGH":
      return 85;

    case "SWING_HIGH":
    case "SWING_LOW":
      return 80;

    case "EQH":
    case "EQL":
      return 78;

    case "EQ":
      return 75;

    case "GRID_U":
    case "GRID_L":
      return 65;
    case "RANGE_TOP":
    case "RANGE_BOT":
      return 55;
    case "PULLBACK_HIGH":
    case "PULLBACK_LOW":
      return 45;
    case "MAGNET":
      return 35;
    default:
      return 10;
  }
}

/**
 * เส้น “ต่างลาย” ไม่ต้องพึ่งสี:
 * - SL/TP: หนา + solid
 * - Entry: หนา + dashed
 * - Swing: หนา + solid (อ่อนลง)
 * - EQH/EQL: หนากว่า EQ + dotted (โชว์ label)
 * - EQ: บาง + sparse dotted
 * - Grid/Range: บาง + dotted (ไม่โชว์ label กันรก)
 * - Pullback: บางมาก + dashed (ไม่โชว์ label กันรก)
 */
function linePreset(kind?: string) {
  const base = {
    axisLabelVisible: true,
    lineVisible: true,
    lineWidth: 1,
    lineStyle: 2 as any,
    color: "rgba(255,255,255,0.26)",
  };

  switch (kind) {
    case "SL":
    case "TP1":
      return { ...base, lineWidth: 3, lineStyle: 0, color: "rgba(255,255,255,0.44)", axisLabelVisible: true };

    case "ENTRY_LOW":
    case "ENTRY_HIGH":
      return { ...base, lineWidth: 2, lineStyle: 2, color: "rgba(255,255,255,0.34)", axisLabelVisible: true };

    case "ENTRY_MID":
      return { ...base, lineWidth: 2, lineStyle: 4, color: "rgba(255,255,255,0.30)", axisLabelVisible: true };

    case "SWING_HIGH":
    case "SWING_LOW":
      return { ...base, lineWidth: 2, lineStyle: 0, color: "rgba(255,255,255,0.40)", axisLabelVisible: true };

    case "EQH":
    case "EQL":
      return { ...base, lineWidth: 2, lineStyle: 1, color: "rgba(255,255,255,0.32)", axisLabelVisible: true };

    case "EQ":
      return { ...base, lineWidth: 1, lineStyle: 4, color: "rgba(255,255,255,0.22)", axisLabelVisible: true };

    case "GRID_U":
    case "GRID_L":
      return { ...base, lineWidth: 1, lineStyle: 1, color: "rgba(255,255,255,0.18)", axisLabelVisible: false };

    case "RANGE_TOP":
    case "RANGE_BOT":
      return { ...base, lineWidth: 1, lineStyle: 1, color: "rgba(255,255,255,0.16)", axisLabelVisible: false };

    case "PULLBACK_HIGH":
    case "PULLBACK_LOW":
      return { ...base, lineWidth: 1, lineStyle: 2, color: "rgba(255,255,255,0.14)", axisLabelVisible: false };

    case "MAGNET":
      return { ...base, lineWidth: 2, lineStyle: 2, color: "rgba(255,255,255,0.32)", axisLabelVisible: true };

    default:
      return base;
  }
}

/** รวมเส้นที่ราคาเดียวกัน (หรือใกล้กันมาก) ให้เป็นเส้นเดียว */
function mergeLines(raw: Line[], tick = 0.5): Line[] {
  const map = new Map<number, Line[]>();

  for (const ln of raw ?? []) {
    const p = safeNum(ln?.price);
    if (p == null) continue;

    const key = Math.round(p / tick) * tick;

    const arr = map.get(key) ?? [];
    arr.push({ ...ln, price: p });
    map.set(key, arr);
  }

  const out: Line[] = [];

  for (const [key, arr] of map.entries()) {
    arr.sort((a, b) => kindPriority(String(b.kind ?? "")) - kindPriority(String(a.kind ?? "")));

    const titles = Array.from(new Set(arr.map((x) => x.title).filter(Boolean)));

    titles.sort((ta, tb) => {
      const ka = arr.find((x) => x.title === ta)?.kind;
      const kb = arr.find((x) => x.title === tb)?.kind;
      return kindPriority(String(kb ?? "")) - kindPriority(String(ka ?? ""));
    });

    const head = arr[0];
    out.push({
      price: key,
      kind: head.kind,
      title: titles.join(" | "),
    });
  }

  out.sort((a, b) => b.price - a.price);
  return out;
}

function shouldShowLegend() {
  if (typeof window === "undefined") return false;
  const q = window.location.search;
  return q.includes("debugMap=1") || q.includes("debugLines=1");
}

function compactTitle(s: string, max = 22) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, Math.max(8, max - 1)) + "…" : t;
}

type LeftLabelItem = {
  key: string;
  price: number;
  title: string;
};

export default function MarketRegimeMiniChart({
  candles = [],
  lines = [],
  height = 360,
  visibleCount = 200,
  labelTf = "1h",
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const roRef = useRef<ResizeObserver | null>(null);

  const candleData = useMemo(() => {
    const data: CandlestickData<Time>[] = (candles ?? [])
      .filter(
        (c) =>
          Number.isFinite(c.time) &&
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close)
      )
      .map((c) => ({
        time: toSec(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

    data.sort((a, b) => (a.time as number) - (b.time as number));
    return data;
  }, [candles]);

  const visibleCandleData = useMemo(() => {
    if (!candleData.length) return candleData;

    const raw = Number(visibleCount);
    const n = Math.max(10, Math.min(500, Number.isFinite(raw) ? raw : 200));
    return candleData.slice(-n);
  }, [candleData, visibleCount]);

  const mergedLines = useMemo(() => mergeLines(lines ?? [], 0.5), [lines]);

  // ✅ สร้างรายการ labels ที่ "ควรโชว์" (ตาม preset axisLabelVisible)
  const leftLabelItems = useMemo((): LeftLabelItem[] => {
    const items: LeftLabelItem[] = [];
    for (const ln of mergedLines) {
      const p = safeNum(ln?.price);
      if (p == null) continue;
      const preset = linePreset(String(ln?.kind ?? ""));
      if (!preset.axisLabelVisible) continue;
      items.push({
        key: `${p}-${String(ln?.kind ?? "")}-${ln?.title ?? ""}`,
        price: p,
        title: compactTitle(ln?.title ?? "", 24),
      });
    }
    // เรียงตามราคา (บน -> ล่าง)
    items.sort((a, b) => b.price - a.price);
    return items;
  }, [mergedLines]);

  useEffect(() => {
    let alive = true;

    async function boot() {
      if (!elRef.current) return;
      if (chartRef.current) return;

      const { createChart, CandlestickSeries } = await import("lightweight-charts");
      if (!alive) return;
      if (!elRef.current) return;

      elRef.current.innerHTML = "";

      const chart = createChart(elRef.current, {
        height,
        layout: {
          background: { color: "transparent" },
          textColor: "rgba(255,255,255,0.55)",
          fontSize: 11, // ✅ เล็กลงทั้งระบบ (ช่วยเรื่องป้ายด้วย)
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.06)" },
          horzLines: { color: "rgba(255,255,255,0.06)" },
        },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" },
        timeScale: { borderColor: "rgba(255,255,255,0.10)" },
        crosshair: {
          vertLine: { color: "rgba(255,255,255,0.15)" },
          horzLine: { color: "rgba(255,255,255,0.15)" },
        },
      });

      chartRef.current = chart;

      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
      });

      seriesRef.current = series;

      const ro = new ResizeObserver(() => {
        if (!elRef.current || !chartRef.current) return;
        const w = elRef.current.clientWidth || 0;
        if (w > 0) chartRef.current.resize(w, height);
        // resize แล้วต้องจัดตำแหน่ง label ใหม่
        requestAnimationFrame(() => positionLeftLabels());
      });
      ro.observe(elRef.current);
      roRef.current = ro;

      // ขยับ/ซูม/ลาก => อัปเดตตำแหน่งป้าย (กันหลุด)
      const node = elRef.current;
      const onAny = () => requestAnimationFrame(() => positionLeftLabels());
      node.addEventListener("wheel", onAny, { passive: true });
      node.addEventListener("mousemove", onAny, { passive: true });
      node.addEventListener("mousedown", onAny);
      node.addEventListener("mouseup", onAny);
      node.addEventListener("touchmove", onAny, { passive: true });
      node.addEventListener("touchstart", onAny, { passive: true });
      node.addEventListener("touchend", onAny, { passive: true });

      // cleanup listeners on unmount in return block below
      (boot as any)._cleanup = () => {
        node.removeEventListener("wheel", onAny as any);
        node.removeEventListener("mousemove", onAny as any);
        node.removeEventListener("mousedown", onAny as any);
        node.removeEventListener("mouseup", onAny as any);
        node.removeEventListener("touchmove", onAny as any);
        node.removeEventListener("touchstart", onAny as any);
        node.removeEventListener("touchend", onAny as any);
      };
    }

    // helper: จัดตำแหน่ง labels ตามราคา
    function positionLeftLabels() {
      const series = seriesRef.current;
      const layer = labelsRef.current;
      if (!series || !layer) return;

      const h = layer.clientHeight || 0;
      if (h <= 0) return;

      const nodes = Array.from(layer.children) as HTMLDivElement[];

      // ดึง desiredY ก่อน
      const desired: Array<{ i: number; y: number }> = [];
      for (let i = 0; i < nodes.length; i++) {
        const price = Number(nodes[i].dataset.price);
        const y = series.priceToCoordinate(price);
        if (y == null || !Number.isFinite(y)) {
          nodes[i].style.display = "none";
          continue;
        }
        nodes[i].style.display = "block";
        desired.push({ i, y });
      }

      // กันชนกัน: sort ตาม y แล้วดันให้ห่างขั้นต่ำ
      desired.sort((a, b) => a.y - b.y);

      const MIN_GAP = 14; // px
      const TOP_PAD = 8;
      const BOT_PAD = 8;

      let lastY = -Infinity;
      for (const d of desired) {
        let y = d.y;
        y = Math.max(TOP_PAD, Math.min(h - BOT_PAD, y));
        if (y - lastY < MIN_GAP) y = lastY + MIN_GAP;
        y = Math.min(h - BOT_PAD, y);
        lastY = y;
        nodes[d.i].style.top = `${y}px`;
      }
    }

    // expose for effects below
    (window as any).__mr_positionLeftLabels = positionLeftLabels;

    boot();

    return () => {
      alive = false;

      try {
        (boot as any)._cleanup?.();
      } catch { }

      try {
        roRef.current?.disconnect();
      } catch { }
      roRef.current = null;

      try {
        chartRef.current?.remove();
      } catch { }
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, []); // once

  // ให้เรียกได้จาก effect อื่น
  function positionLeftLabels() {
    const fn = (window as any).__mr_positionLeftLabels;
    if (typeof fn === "function") fn();
  }

  useEffect(() => {
    if (!chartRef.current || !elRef.current) return;
    const w = elRef.current.clientWidth || 0;
    if (w > 0) chartRef.current.resize(w, height);
    requestAnimationFrame(() => positionLeftLabels());
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    series.setData(visibleCandleData);

    if (visibleCandleData.length > 0) {
      chart.timeScale().fitContent();
    }

    requestAnimationFrame(() => positionLeftLabels());
  }, [visibleCandleData]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (visibleCandleData.length === 0) return;

    let minV = Infinity;
    let maxV = -Infinity;

    for (const c of visibleCandleData) {
      minV = Math.min(minV, c.low);
      maxV = Math.max(maxV, c.high);
    }

    for (const ln of mergedLines) {
      const p = safeNum(ln?.price);
      if (p == null) continue;
      minV = Math.min(minV, p);
      maxV = Math.max(maxV, p);
    }

    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return;

    const span = Math.max(1, maxV - minV);
    const pad = span * 0.06;

    series.applyOptions({
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: minV - pad, maxValue: maxV + pad },
      }),
    });

    requestAnimationFrame(() => positionLeftLabels());
  }, [visibleCandleData, mergedLines]);

  // ✅ วาด priceLines: “เส้น” ยังเหมือนเดิม แต่ปิด label ฝั่งขวา
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const pl of priceLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch { }
    }
    priceLinesRef.current = [];

    if (!visibleCandleData.length) return;

    for (const ln of mergedLines) {
      const p = safeNum(ln?.price);
      if (p == null) continue;

      const preset = linePreset(String(ln?.kind ?? ""));
      const pl = series.createPriceLine({
        price: p,
        title: "", // title ไม่ต้องโชว์ขวา เอาไว้ซ้ายอย่างเดียว
        lineWidth: preset.lineWidth,
        lineStyle: preset.lineStyle,
        color: preset.color,
        axisLabelVisible: true, // ✅ เปิดป้ายราคาฝั่งขวากลับมา
      });


      priceLinesRef.current.push(pl);
    }

    requestAnimationFrame(() => positionLeftLabels());
  }, [mergedLines, visibleCandleData.length]);

  // ✅ สร้าง DOM labels ฝั่งซ้าย (ไม่ใช่ overlay list แบบเดิม — ผูก y ตามราคา)
  useEffect(() => {
    const layer = labelsRef.current;
    if (!layer) return;

    layer.innerHTML = "";

    for (const item of leftLabelItems) {
      const el = document.createElement("div");
      el.dataset.price = String(item.price);

      el.style.position = "absolute";
      el.style.left = "6px";
      el.style.transform = "translateY(-50%)";
      el.style.pointerEvents = "none";
      el.style.whiteSpace = "nowrap";

      // ✅ ตัวเล็กลง + ไม่บังกราฟ
      // ✅ อ่านชัดขึ้น (พื้นขาวนัว ๆ)
      el.style.fontSize = "10px";
      el.style.lineHeight = "12px";
      el.style.padding = "2px 6px";
      el.style.borderRadius = "6px";

      // พื้นหลังขาวโปร่ง + ขอบเข้ม
      el.style.background = "rgba(255,255,255,0.78)";
      el.style.border = "1px solid rgba(0,0,0,0.25)";
      el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.25)";

      // ตัวหนังสือเข้ม อ่านง่าย
      el.style.color = "rgba(0,0,0,0.82)";


      // ตัวเลขราคาเล็ก ๆ ต่อท้าย (อยากเอาออกก็ลบ span นี้)
      el.innerHTML = `
        <span style="font-weight:700; color: rgba(0,0,0,0.85)">${item.title}</span>
        <span style="margin-left:6px; color: rgba(0,0,0,0.55)">${Math.round(item.price)}</span> `;

      layer.appendChild(el);
    }

    requestAnimationFrame(() => positionLeftLabels());
  }, [leftLabelItems]);

  const showLegend = shouldShowLegend();

  const legendLines = useMemo(() => {
    const arr = [...mergedLines];
    arr.sort((a, b) => kindPriority(String(b.kind ?? "")) - kindPriority(String(a.kind ?? "")));
    return arr.slice(0, 10);
  }, [mergedLines]);

  const overlayText = useMemo(() => {
    const shown = visibleCandleData.length;
    const total = candleData.length;
    if (!total) return `${labelTf}`;
    return `${labelTf} (${shown}/${total})`;
  }, [visibleCandleData.length, candleData.length, labelTf]);

  return (
    <div ref={wrapRef} className="rounded-xl border border-white/10 bg-white/5 p-2 relative">
      {candles.length === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-xs text-neutral-400">
          ยังไม่มี candles ใน payload → กราฟจะขึ้นทันทีเมื่อ backend ส่ง klines มา
        </div>
      ) : (
        <>
          {/* overlay มุมบน (อันนี้ไม่เกี่ยวกับ label เส้น) */}
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/35 px-2 py-1 text-[11px] text-white/70">
            <div className="font-semibold text-white/80">{overlayText}</div>
            <div className="text-[10px] text-white/50">map lines: {mergedLines.length}</div>
          </div>

          {/* ตัวกราฟ */}
          <div ref={elRef} />

          {/* ✅ layer สำหรับ title ฝั่งซ้าย (ผูกกับ priceToCoordinate) */}
          <div
            ref={labelsRef}
            className="pointer-events-none absolute inset-0"
            style={{
              // กันไปชนขอบบน/ล่าง + ไม่ทับ padding ของการ์ด
              top: 8,
              bottom: 8,
              left: 8,
              right: 8,
            }}
          />

          {showLegend ? (
            <div className="pointer-events-none absolute left-3 top-14 rounded-lg bg-black/35 px-2 py-1 text-[11px] text-white/70">
              <div className="font-semibold text-white/80">MAP (debug)</div>
              {legendLines.map((l) => (
                <div key={`${l.price}-${l.title}`} className="whitespace-nowrap">
                  {l.title} @ {l.price}
                </div>
              ))}
              {mergedLines.length > legendLines.length ? <div>… +{mergedLines.length - legendLines.length}</div> : null}
              <div className="mt-1 text-[10px] text-white/50">tip: ปิดได้โดยลบ ?debugMap=1</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
