"use client";

// dashboard/components/trading-agent-hq/CurrentPriceEligibleExactSubsetCard.tsx
// D7.2 - read-only current-price exact subset card.
// SAFETY: display only. No controls, no network calls, no activation or trade action.

import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

const NA = "ไม่มีข้อมูล";

function fmt(v: number | null | undefined, digits = 2): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : NA;
}

function count(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : NA;
}

function tone(status: string): "neutral" | "green" | "amber" | "red" {
  if (status.includes("REVIEW_READY") || status === "CLEAN_SUBSET_FOUND_REVIEW_ONLY" || status === "CLEAN_REVIEW_ONLY") return "green";
  if (status.includes("MISSING") || status.includes("STALE") || status === "NOT_READY") return "amber";
  if (status.includes("INVALIDATED")) return "red";
  return "neutral";
}

function Row({
  label,
  value,
  rowTone = "neutral",
}: {
  label: string;
  value: string;
  rowTone?: "neutral" | "green" | "amber" | "red";
}) {
  const cls =
    rowTone === "green"
      ? "text-[#2f7a51]"
      : rowTone === "amber"
        ? "text-[#a9701a]"
        : rowTone === "red"
          ? "text-[#b23a33]"
          : "text-[#2b2118]";
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[#e5d5bf] bg-white/75 px-2.5 py-1.5">
      <span className="min-w-0 truncate text-[11px] font-bold text-[#7a6a59]">{label}</span>
      <span className={`shrink-0 text-right text-[12px] font-black ${cls}`}>{value}</span>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-900">
      {children}
    </span>
  );
}

function flagText(flags: string[]): string {
  return flags.length ? flags.join(", ") : NA;
}

function moveDirectionLabel(direction: string): string {
  if (direction === "UP_TO_ENTRY") return "ขึ้นไปหา entry";
  if (direction === "DOWN_TO_ENTRY") return "ลงมาหา entry";
  if (direction === "INSIDE_ENTRY") return "อยู่ใน/ใกล้ entry";
  return NA;
}

export default function CurrentPriceEligibleExactSubsetCard({ paper }: { paper: PaperVM }) {
  const s = paper.currentPriceEligibleExactSubset;
  const price = s.currentPrice;
  const sample = s.sampleAccounting;
  const filters = s.eligibilityFilters;
  const gate = s.cleanSubsetGate;
  const audit = paper.currentPriceConsistencyAudit;
  const watchlist = paper.regimeAwareExactCandidateWatchlist;
  const mismatchedConsumers = audit.detectedConsumers.filter((consumer) => consumer.status === "MISMATCH" || consumer.status === "STALE");
  const affectedCondition = audit.affectedConditions[0] ?? null;
  const noActiveTrendZone = audit.currentPriceReevaluation.priceMoveRequiredDirection === "NO_ZONE";
  const firstCandidate = s.topCandidates[0] ?? null;
  const geometryMissing = s.status === "GEOMETRY_INPUTS_MISSING";
  const hasWaitingCandidate = s.topCandidates.some((candidate) => candidate.currentPriceStatus === "WAITING_PULLBACK_TO_ENTRY");

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#d7e4df] bg-[#f7fbf8] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-black text-[#1f2c26]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-100 text-[11px]" aria-hidden="true">
            D7.2
          </span>
          <span className="min-w-0">Exact Zone ที่ยังใช้ได้กับราคาปัจจุบัน</span>
        </h2>
        <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-900">
          {s.status}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <Badge>ยึดราคาปัจจุบันก่อน</Badge>
        <Badge>ไม่ใช้ verdict เก่าโดยไม่ re-evaluate</Badge>
        <Badge>ใช้เพื่อรีวิวเท่านั้น</Badge>
        <Badge>ไม่ใช่สัญญาณเข้าไม้</Badge>
        <Badge>ไม่ใช่ Activation</Badge>
        <Badge>ไม่ส่ง Order</Badge>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2 text-[11px] font-bold leading-relaxed text-amber-950">
        ระบบจะไม่เดา geometry · ต้องมี entry / stop / target ต่อ candidate
      </div>

      {hasWaitingCandidate ? (
        <div className="rounded-lg border border-amber-200 bg-white/85 p-2 text-[11px] font-bold leading-relaxed text-amber-950">
          <div>ราคาปัจจุบันยังไม่อยู่ใกล้ entry</div>
          <div>ต้องรอ pullback เข้าหาโซนก่อนจึงจะ eligible</div>
          <div>TARGET_TOO_CLOSE คือปัญหา quality ไม่ใช่สถานะราคาปัจจุบัน</div>
        </div>
      ) : null}

      <div className="rounded-lg border border-cyan-200 bg-cyan-50/80 p-2 text-[11px] font-bold leading-relaxed text-cyan-950">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="font-black">Current Price Consistency / ตรวจราคาที่ใช้ใน Gate</div>
          <span className="shrink-0 rounded-full border border-cyan-300 bg-white px-2 py-0.5 text-[10px] font-black">
            {audit.status}
          </span>
        </div>
        <div>ราคาปัจจุบันต้องมาก่อน: {audit.canonicalCurrentPrice.freshnessStatus}</div>
        <div>Current Price: {fmt(audit.canonicalCurrentPrice.value)} · source {audit.canonicalCurrentPrice.source ?? NA}</div>
        <div>Latest candle: {audit.canonicalCurrentPrice.latestCandleAt ?? NA} · age {count(audit.canonicalCurrentPrice.ageSeconds)}s</div>
        <div>Stale consumers: {audit.pricePropagationAudit.staleConsumerCount} · previous analysis price: {audit.pricePropagationAudit.previousAnalysisPriceCount}</div>
        {mismatchedConsumers.length ? (
          <div className="mt-1 rounded-md border border-amber-200 bg-white/80 p-1.5 text-amber-950">
            <div className="font-black">พบ consumer บางตัวใช้ราคาเก่า</div>
            {mismatchedConsumers.slice(0, 3).map((consumer) => (
              <div key={consumer.path}>
                {consumer.path}: {fmt(consumer.value)} · delta {fmt(consumer.priceDelta)} ({fmt(consumer.priceDeltaPct, 4)}%)
              </div>
            ))}
          </div>
        ) : null}
        {noActiveTrendZone ? (
          <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 p-1.5 text-amber-950">
            <div className="font-black">ตอนนี้ไม่มี active trend zone ให้ประเมิน</div>
            <div>Regime ปัจจุบันไม่ใช่ trend หรือไม่มี zone geometry ที่ใช้ได้</div>
            <div>{audit.currentPriceReevaluation.explanation}</div>
            <div>ไม่ถือว่า price_inside_entry_zone ผ่าน</div>
          </div>
        ) : null}
        {affectedCondition ? (
          <div>Condition: {affectedCondition.condition} · {affectedCondition.impact}</div>
        ) : null}
        <div>Re-evaluate: {audit.currentPriceReevaluation.trendZoneStatus} · move {audit.currentPriceReevaluation.priceMoveRequiredDirection}</div>
        <div>สถานะเข้าโซนจากราคาเก่าจะไม่ถือเป็น current truth</div>
        <div>ยังไม่ใช่สัญญาณเข้าไม้ · ไม่ส่ง Order / ไม่ Activation</div>
      </div>

      <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-2 text-[11px] font-bold leading-relaxed text-violet-950">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="font-black">Watchlist จุดเข้า MTF ตาม Regime</div>
          <span className="shrink-0 rounded-full border border-violet-300 bg-white px-2 py-0.5 text-[10px] font-black">
            {watchlist.status}
          </span>
        </div>
        <div>ใช้เฝ้าดูเท่านั้น · ยังไม่ใช่สัญญาณเข้าไม้</div>
        <div>Regime: {watchlist.currentMarket.regime ?? NA} / {watchlist.currentMarket.direction ?? NA} · confidence {count(watchlist.currentMarket.confidence)}</div>
        <div>Trend zone: {watchlist.currentMarket.trendZoneStatus ?? NA}</div>
        {watchlist.currentMarket.noZoneReason ? <div>{watchlist.currentMarket.noZoneReason}</div> : null}
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Row label="Watch / pullback" value={`${watchlist.watchlistSummary.watchCandidates} / ${watchlist.watchlistSummary.waitingPullbackCandidates}`} />
          <Row label="Regime blocked" value={String(watchlist.watchlistSummary.regimeBlockedCandidates)} rowTone={watchlist.watchlistSummary.regimeBlockedCandidates > 0 ? "amber" : "green"} />
          <Row label="Quality rejected" value={String(watchlist.watchlistSummary.qualityRejectedCandidates)} rowTone={watchlist.watchlistSummary.qualityRejectedCandidates > 0 ? "amber" : "green"} />
          <Row label="Clean review" value={String(watchlist.watchlistSummary.cleanReviewCandidates)} rowTone={watchlist.watchlistSummary.cleanReviewCandidates > 0 ? "green" : "amber"} />
          <Row label="Missed" value={String(watchlist.watchlistSummary.missedCandidates)} rowTone={watchlist.watchlistSummary.missedCandidates > 0 ? "amber" : "neutral"} />
          <Row label="Invalidated" value={String(watchlist.watchlistSummary.invalidatedCandidates)} rowTone={watchlist.watchlistSummary.invalidatedCandidates > 0 ? "red" : "neutral"} />
        </div>
        {watchlist.topWatchCandidates.slice(0, 3).map((candidate) => (
          <div key={candidate.id} className="mt-1 rounded-md border border-violet-200 bg-white/80 p-1.5">
            <div className="font-black">{candidate.id} · {candidate.direction} · {candidate.actionability}</div>
            <div>entry {fmt(candidate.entry)} · stop {fmt(candidate.stopLoss)} · target {fmt(candidate.target1)} · RR {fmt(candidate.netRR)}</div>
            <div>distance {fmt(candidate.distanceToEntryPct)}% · move {candidate.priceMoveRequiredDirection}</div>
            <div>status {candidate.currentPriceStatus} · quality {candidate.qualityStatus}</div>
            <div>blockers: {candidate.blockers.length ? candidate.blockers.join(", ") : NA}</div>
            <div>{candidate.watchCondition}</div>
          </div>
        ))}
        <div className="mt-1 rounded-md border border-violet-200 bg-white/80 p-1.5">
          <div className="font-black">Next trigger checklist</div>
          <div>regime: {watchlist.nextTriggerChecklist.regimeRequired.join(", ") || NA}</div>
          <div>price: {watchlist.nextTriggerChecklist.priceRequired.join(", ") || NA}</div>
          <div>confirm: {watchlist.nextTriggerChecklist.confirmationRequired.join(", ") || NA}</div>
          <div>quality: {watchlist.nextTriggerChecklist.qualityRequired.join(", ") || NA}</div>
        </div>
        <div>ถ้า regime เป็น NO_TRADE จะไม่ถือว่า candidate actionable · ไม่ส่ง Order / ไม่ Activation</div>
      </div>

      {geometryMissing ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-2 text-[11px] font-bold leading-relaxed text-rose-950">
          <div>ยังไม่มี per-candidate geometry snapshot</div>
          <div>มี aggregate exact evidence แล้ว แต่ยังคำนวณ current-price eligible ไม่ได้</div>
          <div>ขั้นถัดไป: เพิ่ม exactCandidateGeometrySnapshot ใน evidence log</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-1.5">
        <Row label="Current Price" value={fmt(price.value)} rowTone={price.freshnessStatus === "FRESH" ? "green" : "amber"} />
        <Row label="Freshness" value={price.freshnessStatus} rowTone={price.freshnessStatus === "FRESH" ? "green" : "amber"} />
        <Row label="Subset price source" value={s.priceSourceAudit.subsetPriceSource ?? price.source ?? NA} />
        <Row label="Snapshot price source" value={s.priceSourceAudit.snapshotPriceSource ?? NA} rowTone={s.priceSourceAudit.priceSourceConsistent ? "green" : "amber"} />
        <Row label="Latest candle" value={price.latestCandleAt ?? NA} />
        <Row label="Lifetime exact samples" value={count(sample.lifetimeExactSamples)} />
        <Row label="Window exact samples" value={count(sample.windowExactSamples)} />
        <Row label="Current-price eligible" value={count(sample.currentPriceEligibleExactSamples)} rowTone={sample.currentPriceEligibleExactSamples == null ? "amber" : "green"} />
        <Row label="Clean eligible" value={count(sample.cleanCurrentPriceEligibleSamples)} rowTone={(sample.cleanCurrentPriceEligibleSamples ?? 0) > 0 ? "green" : "amber"} />
        <Row label="Geometry inputs" value={`${count(sample.geometryInputSamples)} present / ${count(sample.geometryMissingSamples)} missing`} rowTone={(sample.geometryInputSamples ?? 0) > 0 ? "green" : "amber"} />
        <Row label="Clean subset gate" value={gate.status} rowTone={tone(gate.status)} />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Row label="Raw candidates" value={String(s.dedupSummary.rawCandidates)} />
        <Row label="Unique / duplicates" value={`${s.dedupSummary.uniqueCandidates} / ${s.dedupSummary.duplicateCandidates}`} rowTone={s.dedupSummary.duplicateCandidates > 0 ? "amber" : "green"} />
        <Row label="Near/inside" value={String(filters.currentPriceInsideOrNearEntry)} rowTone={filters.currentPriceInsideOrNearEntry > 0 ? "green" : "amber"} />
        <Row label="Clean" value={String(filters.cleanCandidates)} rowTone={filters.cleanCandidates > 0 ? "green" : "amber"} />
        <Row label="Missed" value={String(filters.missedCandidates)} rowTone={filters.missedCandidates > 0 ? "amber" : "neutral"} />
        <Row label="Invalidated" value={String(filters.invalidatedCandidates)} rowTone={filters.invalidatedCandidates > 0 ? "red" : "neutral"} />
      </div>

      {firstCandidate ? (
        <div className="space-y-1.5">
          {s.topCandidates.slice(0, 3).map((candidate) => (
            <div key={candidate.id} className="rounded-lg border border-sky-200 bg-sky-50/70 p-2 text-[11px] font-bold leading-relaxed text-sky-950">
              <div className="mb-1 font-black">Top candidate: {candidate.id} · {candidate.status}</div>
              <div>{candidate.direction} · current {candidate.currentPriceStatus} · quality {candidate.qualityStatus}</div>
              <div>{candidate.zoneType ?? "UNKNOWN_ZONE"} · readiness {candidate.readiness ?? NA} · occurrence {candidate.occurrenceCount}</div>
              <div>entry {fmt(candidate.entry)} · zone {fmt(candidate.entryLow)}-{fmt(candidate.entryHigh)} · stop {fmt(candidate.stopLoss)} · target {fmt(candidate.target1)} · RR {fmt(candidate.netRR)}</div>
              <div>distance {fmt(candidate.distanceToEntryPct)}% / {fmt(candidate.distanceToEntryAbs)} · move {moveDirectionLabel(candidate.priceMoveRequiredDirection)}</div>
              <div>flags {flagText(candidate.flags)}</div>
              <div>{candidate.reason}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-white/80 p-2 text-[11px] font-bold leading-relaxed text-amber-950">
          ยังไม่มี top candidate ที่มี structured geometry เพียงพอสำหรับเทียบกับราคาปัจจุบัน
        </div>
      )}

      {s.requiredGeometryInputs.length ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-2 text-[11px] font-bold leading-relaxed text-rose-950">
          <div className="mb-1 font-black">Geometry inputs ที่ต้องมี</div>
          <div>{s.requiredGeometryInputs.join(", ")}</div>
        </div>
      ) : null}

      <div className="rounded-lg border border-[#d7e4df] bg-white/80 p-2 text-[11px] font-bold leading-relaxed text-[#26352d]">
        <div className="font-black">Next action</div>
        <div>{s.nextAction}</div>
        <div>ใช้รีวิวเท่านั้น ไม่ใช่สัญญาณเข้าไม้ · ไม่ส่ง Order / ไม่ Activation</div>
      </div>
    </section>
  );
}
