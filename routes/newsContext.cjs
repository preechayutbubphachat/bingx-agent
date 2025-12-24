const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const OUT_PATH = path.join(process.cwd(), "news_context.json");

// score แบบง่าย/เร็ว: important/negative เยอะ = เสี่ยงสูง
function scoreRisk(items) {
    const important = items.filter(x => x.is_important).length;
    const negative = items.filter(x => x.sentiment === "negative").length;

    if (important >= 2 || negative >= 4) return "HIGH";
    if (important >= 1 || negative >= 2) return "MED";
    return "LOW";
}

async function fetchCryptoPanic({ token, currencies = "BTC" }) {
    const url =
        "https://cryptopanic.com/api/developer/v2/posts/?" +
        `auth_token=${encodeURIComponent(token)}` +
        "&public=true" +
        `&currencies=${encodeURIComponent(currencies)}` +
        "&filter=rising";

    console.log("[CryptoPanic] URL:", url);

    const res = await fetch(url, {
        headers: { "User-Agent": "bingx-agent/1.0" }
    });

    if (!res.ok) throw new Error(`CryptoPanic HTTP ${res.status}`);
    const data = await res.json();

    const items = (data?.results || []).slice(0, 12).map(p => ({
        title: p.title,
        source: p.domain || "cryptopanic",
        published_at: p.published_at,
        is_important: Boolean(p.important),
        sentiment: p.negative ? "negative" : p.positive ? "positive" : "mixed",
    }));

    return items;
    // return null;
}


async function buildNewsContext(req, res) {
    try {
        let macro = {
            source: "forexfactory",
            overall_risk_level: "MED",
            events: [],
            notes: ["macro fetch skipped"]
        };

        try {
            macro = await buildMacroOverlay();
        } catch (e) {
            // soft-fail: macro พังได้ แต่ news_context ยังต้องถูกสร้าง
            macro = {
                source: "forexfactory",
                overall_risk_level: "MED",
                events: [],
                notes: [`macro fetch failed: ${e.message}`]
            };
        }

        const token = process.env.CRYPTOPANIC_TOKEN;
        if (!token) {
            return res.status(400).json({
                ok: false,
                error: "Missing CRYPTOPANIC_TOKEN in .env"
            });
        }

        const symbol = (req.query.symbol || "BTC-USDT").toString();
        const currency = symbol.toUpperCase().includes("ETH") ? "ETH" : "BTC";

        const headlines = await fetchCryptoPanic({ token, currencies: currency });

        const risk = scoreRisk(headlines);
        const hasHotNews = risk !== "LOW";

        const payload = {
            generated_at: new Date().toISOString(),
            symbol,
            source: "cryptopanic",
            has_hot_news: hasHotNews,
            risk_level: risk,
            crypto_news_headlines: headlines,
            macro, // ✅ รวม macro เข้าไฟล์เดียว
            notes: [
                "ใช้ข่าวเป็น risk overlay เท่านั้น ห้ามใช้แทนราคา/แท่งเทียนจาก market_snapshot.json"
            ],
        };

        fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf-8");

        return res.json({
            ok: true,
            message: "news_context.json created",
            file: OUT_PATH,
            preview: {
                has_hot_news: payload.has_hot_news,
                risk_level: payload.risk_level,
                macro_risk: payload.macro?.overall_risk_level ?? null,
                macro_events: (payload.macro?.events ?? []).map(e => e.key),
            }
        });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
    }
}

function classifyWindowFromDateText(dateText) {
    // เราจะทำแบบ "best-effort" เพราะ ForexFactory DOM/format เปลี่ยนได้
    // ถ้า parse ไม่ได้ จะคืน UNKNOWN แล้วค่อย map เป็น MED แบบ conservative
    const t = (dateText || "").toLowerCase();
    if (!t) return "UNKNOWN";
    if (t.includes("today")) return "TODAY";
    if (t.includes("tomorrow")) return "TOMORROW";
    // ถ้าเห็นวันในสัปดาห์ ให้ถือว่า THIS_WEEK
    if (/(mon|tue|wed|thu|fri|sat|sun)/i.test(dateText)) return "THIS_WEEK";
    return "UNKNOWN";
}

function riskFromWindow(win) {
    if (win === "TODAY" || win === "TOMORROW") return "HIGH";
    if (win === "THIS_WEEK") return "MED";
    if (win === "LATER") return "LOW";
    return "MED"; // UNKNOWN → conservative
}

async function buildMacroOverlay() {
    const url = "https://www.forexfactory.com/calendar";
    const res = await fetch(url, {
        headers: {
            "User-Agent": "bingx-agent/1.0",
            "Accept": "text/html",
        }
    });
    if (!res.ok) throw new Error(`ForexFactory HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // ⚠️ Selector อาจเปลี่ยนได้ตามเว็บ
    // เราใช้วิธี “กว้างๆ” คือกวาด text ทั้งหน้า แล้วหา keyword
    const pageText = $("body").text();

    const found = [];
    const keys = [
        { key: "FOMC", re: /FOMC|Fed Interest Rate|Federal Funds Rate/i },
        { key: "CPI", re: /CPI|Consumer Price Index/i },
        { key: "NFP", re: /Non[-\s]?Farm|NFP|Employment Change/i },
    ];

    // ถ้าพบ keyword ในหน้า ให้ถือว่า THIS_WEEK (อย่างน้อย)
    // ถ้าคุณอยากแม่นขึ้นทีหลัง เราค่อย refine ให้ไปดึง “วัน/เวลา” จาก row จริง
    for (const k of keys) {
        if (k.re.test(pageText)) {
            found.push({
                key: k.key,
                window: "THIS_WEEK",
                title: `${k.key} detected on calendar`
            });
        }
    }

    // ประเมิน overall risk
    let overall = "LOW";
    if (found.some(e => e.window === "TODAY" || e.window === "TOMORROW")) overall = "HIGH";
    else if (found.length > 0) overall = "MED";

    return {
        source: "forexfactory",
        overall_risk_level: overall,
        events: found,
        notes: [
            "Macro overlay ใช้เป็น risk overlay เท่านั้น",
            "เวอร์ชันแรกใช้ keyword detection (best-effort). ถ้าต้องการระบุ TODAY/TOMORROW แบบเป๊ะ จะทำ parser รายแถวเพิ่มได้"
        ]
    };
}


module.exports = { buildNewsContext };
