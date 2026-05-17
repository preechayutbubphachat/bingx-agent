// scripts/dedupe-buildSeriesMeta.cjs
const fs = require("fs");

const FILE = "app/api/plan-status/route.ts";
const src = fs.readFileSync(FILE, "utf8");

const needle = "function buildSeriesMeta(";
let idxs = [];
let i = 0;
while (true) {
    const p = src.indexOf(needle, i);
    if (p === -1) break;
    idxs.push(p);
    i = p + needle.length;
}

if (idxs.length <= 1) {
    console.log("OK: buildSeriesMeta occurs", idxs.length, "time(s). Nothing to do.");
    process.exit(0);
}

// เราจะ "เก็บตัวสุดท้าย" แล้วลบตัวก่อนหน้า (ส่วนใหญ่เป็นของเก่าที่หลงเหลือ)
const keepAt = idxs[idxs.length - 1];
const removeRanges = [];

function findFunctionBlockEnd(code, startIndex) {
    // หา "{" ตัวแรกหลังชื่อฟังก์ชัน แล้วนับวงเล็บปีกกาให้ครบ
    const braceStart = code.indexOf("{", startIndex);
    if (braceStart === -1) return null;

    let depth = 0;
    for (let k = braceStart; k < code.length; k++) {
        const ch = code[k];
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) {
                // รวมถึง newline หลังปีกกาปิด ถ้ามี
                let end = k + 1;
                if (code[end] === "\r" && code[end + 1] === "\n") end += 2;
                else if (code[end] === "\n") end += 1;
                return end;
            }
        }
    }
    return null;
}

// เก็บทุกตัวที่อยู่ก่อน keepAt เป็นตัวที่จะลบ
for (let n = 0; n < idxs.length - 1; n++) {
    const start = idxs[n];

    // ขยาย start ย้อนกลับไปต้นบรรทัด (ลบคอมเมนต์หัวบล็อกติดๆ ไปด้วย)
    let s = start;
    while (s > 0 && src[s - 1] !== "\n") s--;

    const end = findFunctionBlockEnd(src, start);
    if (!end) {
        console.error("Failed to parse function block at index", start);
        process.exit(1);
    }
    removeRanges.push([s, end]);
}

// ลบจากหลังมาหน้า (กัน index เพี้ยน)
let out = src;
removeRanges.sort((a, b) => b[0] - a[0]).forEach(([s, e]) => {
    out = out.slice(0, s) + out.slice(e);
});

fs.writeFileSync(FILE, out, "utf8");
console.log("Removed", removeRanges.length, "duplicate buildSeriesMeta definition(s). Kept the last one at index", keepAt);

// sanity check
const countAfter = (out.match(/function buildSeriesMeta\(/g) || []).length;
console.log("Count after:", countAfter);
if (countAfter !== 1) {
    console.warn("Warning: expected exactly 1 buildSeriesMeta, got", countAfter);
}
