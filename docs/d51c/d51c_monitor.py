#!/usr/bin/env python3
"""
D5.1-c runtime monitor — collector + regime-split analyzer (READ-ONLY).

ไม่แตะ trading logic / ไม่แตะ runtime ของระบบ / ไม่ส่ง order ใด ๆ
อ่านอย่างเดียวจาก GET /api/paper-performance แล้ว append ลง log ของตัวเอง (d51c_log.jsonl)

Usage:
  # เก็บ 1 ครั้ง (ให้ cron/loop เรียกทุก 15 นาที)
  python3 d51c_monitor.py collect --base http://localhost:3000 --log d51c_log.jsonl

  # สร้าง regime-split report
  python3 d51c_monitor.py report --log d51c_log.jsonl

หมายเหตุวิธีการ:
  fillResolution counters เป็น "ยอดสะสมรวมทุก regime" — การแยกต่อ regime จึงทำโดยดู
  DELTA ของ counter ระหว่าง snapshot ที่ติดกัน แล้ว attribute ให้ regime/priceVsGrid
  ที่ active ในช่วงนั้น (ดู caveat ใน report)
"""
import argparse, json, sys, time, urllib.request
from collections import defaultdict
from datetime import datetime, timezone

ENDPOINT = "/api/paper-performance"


def _get(base, timeout=15):
    url = base.rstrip("/") + ENDPOINT
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _dig(d, *path, default=None):
    cur = d
    for k in path:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


def collect(args):
    try:
        payload = _get(args.base)
    except Exception as e:
        print(f"[collect] FAILED: {e}", file=sys.stderr)
        sys.exit(1)
    pld = payload.get("paperLoopDiagnostics", {}) or {}
    fr = _dig(pld, "trendEvidenceDecisionSummary", "exactZoneComparisonSummary", default={}) or {}
    fill = fr.get("fillResolution", {}) or {}
    row = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "regime": pld.get("regime"),
        "canonicalRegime": _dig(pld, "canonicalMarketRegime", "regime"),
        "priceVsGrid": pld.get("priceVsGrid"),
        "dynamicGridStatus": _dig(pld, "dynamicGrid", "status"),
        "fillStatus": fill.get("status"),
        "totalResolvable": fill.get("totalResolvable"),
        "filled": fill.get("filled"),
        "missed": fill.get("missed"),
        "invalidationFirst": fill.get("invalidationFirst"),
        "missedFillRate": fill.get("missedFillRate"),
        "geometryReadyCount": fr.get("fillResolutionGeometryReadyCount"),
        "exactSamples": fr.get("exactSamples"),
        "closedCycles": _dig(pld, "dynamicGrid", "closedCycles",
                             default=_dig(payload, "edgeDiagnostics", "closedCycles", default=0)),
        "trendClosedTrades": payload.get("trendClosedTrades"),
    }
    with open(args.log, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"[collect] {row['checkedAt']} regime={row['canonicalRegime']} "
          f"priceVsGrid={row['priceVsGrid']} status={row['fillStatus']} "
          f"totalResolvable={row['totalResolvable']} missedFillRate={row['missedFillRate']}")


def _load(log):
    rows = []
    try:
        with open(log, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    except FileNotFoundError:
        print(f"[report] log not found: {log}", file=sys.stderr)
        sys.exit(1)
    rows.sort(key=lambda r: r.get("checkedAt") or "")
    return rows


def _num(v):
    return v if isinstance(v, (int, float)) else 0


def report(args):
    rows = _load(args.log)
    if not rows:
        print("[report] no rows"); return
    latest = rows[-1]

    # --- delta attribution: counters เป็น cumulative -> ดู delta ต่อช่วง ---
    # bucket key = (canonicalRegime, priceVsGrid)
    buckets = defaultdict(lambda: {"dTotal": 0, "dMissed": 0, "dFilled": 0, "dInval": 0,
                                   "grids": set(), "rows": 0})
    prev = None
    for r in rows:
        if prev is not None:
            dT = _num(r.get("totalResolvable")) - _num(prev.get("totalResolvable"))
            dM = _num(r.get("missed")) - _num(prev.get("missed"))
            dF = _num(r.get("filled")) - _num(prev.get("filled"))
            dI = _num(r.get("invalidationFirst")) - _num(prev.get("invalidationFirst"))
            # นับเฉพาะ delta ที่เป็นบวก (counter เพิ่ม) แล้ว attribute ให้ regime ณ snapshot ปลายช่วง
            if dT > 0:
                key = (r.get("canonicalRegime") or "UNKNOWN", r.get("priceVsGrid") or "UNKNOWN")
                b = buckets[key]
                b["dTotal"] += dT; b["dMissed"] += max(dM, 0); b["dFilled"] += max(dF, 0)
                b["dInval"] += max(dI, 0); b["rows"] += 1
                if r.get("dynamicGridStatus"):
                    b["grids"].add(r["dynamicGridStatus"])
        prev = r

    # ถ้ามี snapshot เดียว (ยังไม่มี delta) -> รายงานจากค่า cumulative ปัจจุบันเป็น baseline
    single = len(rows) == 1 or not buckets

    print("=" * 72)
    print("D5.1-c REGIME-SPLIT REPORT")
    print(f"snapshots={len(rows)}  window={rows[0].get('checkedAt')} -> {latest.get('checkedAt')}")
    print(f"latest cumulative: status={latest.get('fillStatus')} "
          f"totalResolvable={latest.get('totalResolvable')} missed={latest.get('missed')} "
          f"filled={latest.get('filled')} missedFillRate={latest.get('missedFillRate')}")
    print(f"closedCycles={latest.get('closedCycles')} trendClosedTrades={latest.get('trendClosedTrades')}")
    print("=" * 72)

    if single:
        print("ยังมี snapshot เดียว/ยังไม่มี delta — regime-split ยังทำไม่ได้")
        print("เก็บเพิ่มให้ counter ขยับก่อน แล้วค่อยรัน report ใหม่")
        _verdict([], latest)
        return

    print(f"{'canonicalRegime':<16}{'priceVsGrid':<14}{'ΔresolvableΣ':>12}"
          f"{'Δmissed':>9}{'Δfilled':>9}{'missedFillRate':>16}  gridStatus")
    print("-" * 88)
    table = []
    for (regime, pvg), b in sorted(buckets.items(), key=lambda kv: -kv[1]["dTotal"]):
        rate = (b["dMissed"] / b["dTotal"]) if b["dTotal"] else None
        table.append((regime, pvg, b["dTotal"], b["dMissed"], b["dFilled"], rate))
        rate_s = f"{rate:.2f}" if rate is not None else "—"
        print(f"{regime:<16}{pvg:<14}{b['dTotal']:>12}{b['dMissed']:>9}{b['dFilled']:>9}"
              f"{rate_s:>16}  {','.join(sorted(b['grids'])) or '—'}")
    print("-" * 88)
    _verdict(table, latest)


def _verdict(table, latest):
    print()
    print("VERDICT")
    total_resolved = sum(t[2] for t in table)
    regimes_hi = [t for t in table if t[5] is not None and t[5] >= 0.8 and t[2] >= 3]
    regimes_lo = [t for t in table if t[5] is not None and t[5] < 0.5 and t[2] >= 3]
    distinct_regimes = len({t[0] for t in table if t[2] > 0})
    has_range = any(t[0] == "RANGE" for t in table if t[2] > 0)

    print(f"  resolved(Δ-attributed) = {total_resolved}  distinctRegimes = {distinct_regimes}  "
          f"RANGEsubset = {'yes' if has_range else 'no'}")

    if total_resolved < 30:
        gate = "D5_1C_DOCS_ONLY_WAIT_MORE_SAMPLE"
    elif distinct_regimes < 2:
        gate = "D5_1C_SINGLE_REGIME_SAMPLE"
    elif not has_range:
        gate = "D5_1C_MISSING_RANGE_SUBSET"
    else:
        gate = "EVALUATE_D5_1C_UI_STATE_MACHINE"
    print(f"  gate -> {gate}")

    if not table:
        concl = "UNDETERMINED (single snapshot / no delta yet)"
    elif len(regimes_hi) >= 2:
        concl = "CROSS_REGIME_ISSUE — missedFillRate สูงในหลาย regime → ปัญหา reachability จริง"
    elif regimes_hi and regimes_lo:
        concl = ("REGIME_ARTIFACT — สูงเฉพาะบาง regime (เช่น DOWNTREND/BELOW_GRID) "
                 "แต่ต่ำใน RANGE/INSIDE_GRID → artifact ของ regime/บริบทราคา")
    elif regimes_hi and distinct_regimes == 1:
        concl = "SINGLE_REGIME_HIGH — สูง แต่ยัง regime เดียว สรุป artifact/cross ไม่ได้"
    else:
        concl = "INSUFFICIENT — ยังแยกไม่ชัด เก็บเพิ่ม"
    print(f"  missedFillRate -> {concl}")
    print("  NOTE: ไม่เสนอ trading logic change. M-0B/Phase 2-B BLOCKED. live/order/exchange OFF.")
    print("  CAVEAT: regime ที่ attribute คือ regime ณ snapshot ที่ counter ขยับ (ตอน resolve)")
    print("          ซึ่งคร่อมช่วง capture->resolve (~3ชม.) จึงเป็น approximation ไม่ใช่ regime ตอน capture เป๊ะ")


def main():
    p = argparse.ArgumentParser(description="D5.1-c read-only runtime monitor")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("collect"); c.add_argument("--base", required=True); c.add_argument("--log", default="d51c_log.jsonl")
    r = sub.add_parser("report"); r.add_argument("--log", default="d51c_log.jsonl")
    args = p.parse_args()
    if args.cmd == "collect":
        collect(args)
    elif args.cmd == "report":
        report(args)


if __name__ == "__main__":
    main()
