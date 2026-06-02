const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "..", "public", "assets", "trading-agent-hq", "sheets");
const FRAME = 256;
const COLS = 18;
const ROWS = 4;

const sources = [
  ["grid_bot", "TradingAgentHQ/02-Grid_Bot/Grid_bot_sprite-anim.png"],
  ["trend_bot", "TradingAgentHQ/01-Trend Bot/trend_bot_sprite-anim.png"],
  ["risk_manager", "TradingAgentHQ/03-Risk_Manager/Risk_Manager_bot_sprite-anim.png"],
  ["news_analyst", "TradingAgentHQ/04-News_Analyst/News_Analyst_bot_sprite-anim.png"],
  ["market_regime", "TradingAgentHQ/05-Market_Regime/Market_Regime_bot_sprite-anim.png"],
  ["memory_brain", "TradingAgentHQ/06-Memory_Second Brain/Memory_Second-Brain_bot_sprite-anim.png"],
];

function transparentizeCheckerboard({ data, info }) {
  const output = Buffer.alloc(info.width * info.height * 4);

  for (let i = 0, o = 0; i < data.length; i += info.channels, o += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isChecker =
      max >= 225 &&
      max - min <= 28 &&
      r >= 225 &&
      g >= 225 &&
      b >= 225;

    output[o] = r;
    output[o + 1] = g;
    output[o + 2] = b;
    output[o + 3] = isChecker ? 0 : 255;
  }

  return output;
}

async function extractFrame(source, col, row, cellW, cellH) {
  const left = Math.round(col * cellW);
  const top = Math.round(row * cellH);
  const width = Math.max(1, Math.min(Math.round((col + 1) * cellW) - left, source.width - left));
  const height = Math.max(1, Math.min(Math.round((row + 1) * cellH) - top, source.height - top));

  const raw = await sharp(source.path)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = transparentizeCheckerboard(raw);
  const cleaned = sharp(rgba, {
    raw: { width: raw.info.width, height: raw.info.height, channels: 4 },
  }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 });

  const meta = await cleaned.metadata();
  const scale = Math.min(220 / Math.max(meta.width ?? width, 1), 230 / Math.max(meta.height ?? height, 1), 1.8);
  const resized = await cleaned
    .resize({
      width: Math.max(1, Math.round((meta.width ?? width) * scale)),
      height: Math.max(1, Math.round((meta.height ?? height) * scale)),
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  return {
    input: resized,
    left: Math.round((FRAME - (resizedMeta.width ?? FRAME)) / 2),
    top: Math.max(0, FRAME - (resizedMeta.height ?? FRAME) - 6),
  };
}

async function normalize([agentId, relPath]) {
  const sourcePath = path.join(ROOT, relPath);
  const sourceMeta = await sharp(sourcePath).metadata();
  const source = { path: sourcePath, width: sourceMeta.width, height: sourceMeta.height };
  const cellW = source.width / COLS;
  const cellH = source.height / ROWS;
  const composites = [];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const frame = await extractFrame(source, col, row, cellW, cellH);
      composites.push({
        input: frame.input,
        left: col * FRAME + frame.left,
        top: row * FRAME + frame.top,
      });
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${agentId}_sheet_anim.webp`);
  await sharp({
    create: {
      width: COLS * FRAME,
      height: ROWS * FRAME,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ quality: 92, effort: 6, lossless: false })
    .toFile(outPath);

  const outMeta = await sharp(outPath).metadata();
  console.log(`${agentId}: ${source.width}x${source.height} -> ${outMeta.width}x${outMeta.height}`);
}

(async () => {
  for (const source of sources) {
    await normalize(source);
  }
})();
