/**
 * test-paper-fill-counting.mjs
 * Phase M-0Z-6 (S1 fix) — dependency-free logic test for paper fill counting.
 *
 * รันด้วย:  node dashboard/scripts/test-paper-fill-counting.mjs
 *
 * หมายเหตุ: โปรเจคยังไม่มี test runner (ไม่มี jest/vitest) และ readPaperJournal.ts ใช้ path
 * alias @/lib + อ่าน filesystem. test นี้เป็น "logic mirror" ของบล็อกการนับใน
 * readPaperJournal.ts (S1 fix) — ต้อง keep ให้ตรงกับ source. เมื่อมี test runner จริงในอนาคต
 * ควรเขียน integration test ที่เรียก readPaperJournal() กับ synthetic .jsonl fixtures โดยตรง.
 *
 * Mirrors: ORDER_FILLED / FILL_RESULT counting with dedupe by (eventKey ?? payload.orderId).
 */

// ── mirror of the S1 counting block in readPaperJournal.ts ──────────────────
function countOrderFilled(events) {
  const filledOrderKeys = new Set();
  let totalOrderFilled = 0;
  for (const event of events) {
    // isPaperEvent gate (mode === "PAPER")
    if (String(event.mode ?? "").toUpperCase() !== "PAPER") continue;
    const eventType = String(event.type ?? "").toUpperCase();
    if (eventType === "ORDER_FILLED" || eventType === "FILL_RESULT") {
      const payloadObj = event.payload;
      const fillKey =
        event.eventKey ??
        (typeof payloadObj?.orderId === "string" ? payloadObj.orderId : null);
      if (fillKey) {
        if (!filledOrderKeys.has(fillKey)) {
          filledOrderKeys.add(fillKey);
          totalOrderFilled++;
        }
      } else {
        totalOrderFilled++;
      }
    }
  }
  return totalOrderFilled;
}

// ── tiny assert harness ─────────────────────────────────────────────────────
let pass = 0, fail = 0;
function expect(name, got, want) {
  if (got === want) { pass++; console.log(`  PASS  ${name} (=${got})`); }
  else { fail++; console.log(`  FAIL  ${name} — got ${got}, want ${want}`); }
}

console.log("Paper fill counting (S1 fix) — logic mirror test\n");

// 1) ORDER_FILLED only, with eventKey → 1
expect("ORDER_FILLED only", countOrderFilled([
  { mode: "PAPER", type: "ORDER_FILLED", eventKey: "k1" },
]), 1);

// 2) FILL_RESULT only (orderId in payload) → 1  (was 0 before fix — the core bug)
expect("FILL_RESULT only counts (regression of S1)", countOrderFilled([
  { mode: "PAPER", type: "FILL_RESULT", payload: { orderId: "o9" } },
]), 1);

// 3) ORDER_FILLED + FILL_RESULT same key → 1 (dedupe, no double count)
expect("dedupe same key", countOrderFilled([
  { mode: "PAPER", type: "ORDER_FILLED", eventKey: "kS" },
  { mode: "PAPER", type: "FILL_RESULT", eventKey: "kS" },
]), 1);

// 3b) same order via eventKey then payload.orderId equal value → 1
expect("dedupe across eventKey/orderId", countOrderFilled([
  { mode: "PAPER", type: "ORDER_FILLED", eventKey: "ord-7" },
  { mode: "PAPER", type: "FILL_RESULT", payload: { orderId: "ord-7" } },
]), 1);

// 4) different keys → 2
expect("two distinct orders", countOrderFilled([
  { mode: "PAPER", type: "ORDER_FILLED", eventKey: "a" },
  { mode: "PAPER", type: "FILL_RESULT", payload: { orderId: "b" } },
]), 2);

// 5) no stable key → counts (fallback, no undercount)
expect("no-key fallback counts", countOrderFilled([
  { mode: "PAPER", type: "ORDER_FILLED" },
  { mode: "PAPER", type: "FILL_RESULT" },
]), 2);

// 6) non-PAPER mode ignored
expect("non-PAPER ignored", countOrderFilled([
  { mode: "LIVE", type: "ORDER_FILLED", eventKey: "x" },
  { mode: "PAPER", type: "ORDER_FILLED", eventKey: "y" },
]), 1);

// 7) unrelated events ignored
expect("non-fill events ignored", countOrderFilled([
  { mode: "PAPER", type: "INTENT_CREATED", eventKey: "i" },
  { mode: "PAPER", type: "ORDER_SIMULATED", eventKey: "s" },
  { mode: "PAPER", type: "ORDER_CANCELED", eventKey: "c" },
]), 0);

// ── mirror of S3: hasAverageFillPrice filter in paperPerformance.ts ─────────
function hasAverageFillPrice(events) {
  const filled = events.filter((e) =>
    e.type === "ORDER_FILLED" || e.type === "ORDER_SIMULATED" || e.type === "FILL_RESULT"
  );
  return filled.length > 0 && filled.some((e) => e.averageFillPrice && e.averageFillPrice > 0);
}

// ── mirror of extractFills inclusion + guard (paperPerformance.ts:463-484) ──
function extractFills(events) {
  const out = [];
  for (const ev of events) {
    if (ev.type !== "ORDER_FILLED" && ev.type !== "ORDER_SIMULATED" && ev.type !== "FILL_RESULT") continue;
    const price = ev.averageFillPrice;
    const qty = ev.filledQuantity ?? ev.quantity;
    if (!price || price <= 0 || !qty || qty <= 0 || !ev.side) continue;
    out.push({ ts: ev.ts ?? 0, side: ev.side, price, quantity: qty });
  }
  return out;
}

// ── Reviewer Decision Rule (from static analysis §Reviewer Decision Rule) ────
function reviewerClassify({ totalOrderFilled, events }) {
  const fills = extractFills(events);
  const fillResultPresent = events.some(
    (e) => e.type === "FILL_RESULT" && e.averageFillPrice > 0 && (e.filledQuantity ?? e.quantity) > 0 && e.side
  );
  // real fills claimed but none usable (missing averageFillPrice) → FAIL, never warning-only
  if (totalOrderFilled > 0 && fills.length === 0) return "FAIL_missing_avgFillPrice";
  // no counted fills but a valid FILL_RESULT exists → suspect S1 counting bug, treat DATA_GAP not PASS
  if (totalOrderFilled === 0 && fillResultPresent) return "DATA_GAP_suspect_S1";
  if (totalOrderFilled === 0) return "DATA_GAP_zero_fills";
  return "OK_has_fills";
}

console.log("\nS3 hasAverageFillPrice (include FILL_RESULT)");
expect("FILL_RESULT with price → true", hasAverageFillPrice([
  { type: "FILL_RESULT", averageFillPrice: 65000 },
]), true);
expect("FILL_RESULT null price → false", hasAverageFillPrice([
  { type: "FILL_RESULT", averageFillPrice: null },
]), false);
expect("no fill events → false", hasAverageFillPrice([
  { type: "INTENT_CREATED" },
]), false);

console.log("\nReviewer Decision Rule");
expect("fills claimed but avgFillPrice missing → FAIL", reviewerClassify({
  totalOrderFilled: 3,
  events: [{ type: "ORDER_FILLED", averageFillPrice: null, filledQuantity: 1, side: "BUY" }],
}), "FAIL_missing_avgFillPrice");
expect("0 counted but valid FILL_RESULT → suspect S1", reviewerClassify({
  totalOrderFilled: 0,
  events: [{ type: "FILL_RESULT", averageFillPrice: 65000, filledQuantity: 1, side: "BUY" }],
}), "DATA_GAP_suspect_S1");
expect("genuine zero fills → DATA_GAP", reviewerClassify({
  totalOrderFilled: 0, events: [{ type: "INTENT_CREATED" }],
}), "DATA_GAP_zero_fills");
expect("healthy fills → OK", reviewerClassify({
  totalOrderFilled: 2,
  events: [{ type: "FILL_RESULT", averageFillPrice: 65000, filledQuantity: 1, side: "BUY" }],
}), "OK_has_fills");

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
