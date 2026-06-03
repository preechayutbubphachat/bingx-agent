const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "..", "public", "assets", "trading-agent-hq", "sheets");
const FRAME = 256;
const COLS = 18;
const ROWS = 4;

const sources = [
  { agentId: "grid_bot", relPath: "TradingAgentHQ/02-Grid_Bot/Grid_bot_sprite-anim.png", sourceCols: 18 },
  { agentId: "trend_bot", relPath: "TradingAgentHQ/01-Trend Bot/trend_bot_sprite-anim.png", sourceCols: 18 },
  { agentId: "risk_manager", relPath: "TradingAgentHQ/03-Risk_Manager/Risk_Manager_bot_sprite-anim.png", sourceCols: 15 },
  { agentId: "news_analyst", relPath: "TradingAgentHQ/04-News_Analyst/News_Analyst_bot_sprite-anim.png", sourceCols: 19, gridLeft: 10, cellW: 138.9 },
  { agentId: "market_regime", relPath: "TradingAgentHQ/05-Market_Regime/Market_Regime_bot_sprite-anim.png", sourceCols: 18, gridLeft: 20, cellW: 103.3 },
  { agentId: "memory_brain", relPath: "TradingAgentHQ/06-Memory_Second Brain/Memory_Second-Brain_bot_sprite-anim.png", sourceCols: 20 },
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

function removeEdgeFragments(rgba, width, height) {
  const seen = new Uint8Array(width * height);
  const components = [];
  const stack = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (seen[start] || rgba[start * 4 + 3] === 0) continue;

      let area = 0;
      let left = x;
      let right = x;
      let top = y;
      let bottom = y;
      const pixels = [];

      seen[start] = 1;
      stack.push(start);

      while (stack.length > 0) {
        const idx = stack.pop();
        const px = idx % width;
        const py = Math.floor(idx / width);
        area += 1;
        left = Math.min(left, px);
        right = Math.max(right, px);
        top = Math.min(top, py);
        bottom = Math.max(bottom, py);
        pixels.push(idx);

        const neighbors = [
          px > 0 ? idx - 1 : -1,
          px < width - 1 ? idx + 1 : -1,
          py > 0 ? idx - width : -1,
          py < height - 1 ? idx + width : -1,
        ];

        for (const next of neighbors) {
          if (next < 0 || seen[next] || rgba[next * 4 + 3] === 0) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }

      components.push({ area, left, right, top, bottom, pixels });
    }
  }

  if (components.length <= 1) return rgba;

  const largest = components.reduce((best, item) => (item.area > best.area ? item : best), components[0]);
  const minUsefulArea = Math.max(12, largest.area * 0.045);
  const cleaned = Buffer.from(rgba);

  for (const component of components) {
    const touchesSide = component.left === 0 || component.right === width - 1;
    const componentWidth = component.right - component.left + 1;
    const tiny = component.area < minUsefulArea;
    const narrowEdgeSliver = touchesSide && componentWidth <= Math.max(8, width * 0.18) && component.area < largest.area * 0.38;

    if (tiny || narrowEdgeSliver) {
      for (const idx of component.pixels) {
        cleaned[idx * 4 + 3] = 0;
      }
    }
  }

  return cleaned;
}

async function detectHorizontalGrid(sourcePath, sourceCols, fallbackWidth) {
  const raw = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = raw.info.width;
  const height = raw.info.height;
  const channels = raw.info.channels;
  const rowHeight = Math.floor(height / ROWS);
  const projection = new Array(width).fill(0);

  for (let y = 0; y < rowHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const r = raw.data[i];
      const g = raw.data[i + 1];
      const b = raw.data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const isChecker = max >= 225 && max - min <= 28 && r >= 225 && g >= 225 && b >= 225;
      if (!isChecker) projection[x] += 1;
    }
  }

  const smoothed = projection.map((_, x) => {
    let total = 0;
    for (let offset = -3; offset <= 3; offset += 1) {
      total += projection[Math.max(0, Math.min(width - 1, x + offset))];
    }
    return total;
  });

  const threshold = rowHeight * 0.06;
  const centers = [];
  let start = -1;

  for (let x = 0; x < width; x += 1) {
    if (smoothed[x] > threshold && start < 0) {
      start = x;
    }
    if ((smoothed[x] <= threshold || x === width - 1) && start >= 0) {
      const end = x;
      if (end - start > 4) centers.push((start + end) / 2);
      start = -1;
    }
  }

  if (centers.length === sourceCols && sourceCols > 1) {
    const cellW = (centers[centers.length - 1] - centers[0]) / (sourceCols - 1);
    return {
      left: Math.max(0, centers[0] - cellW / 2),
      cellW,
    };
  }

  return { left: 0, cellW: fallbackWidth / sourceCols };
}

async function extractFrame(source, col, row, cellW, cellH) {
  const left = Math.round(source.gridLeft + col * cellW);
  const top = Math.round(row * cellH);
  const right = Math.round(source.gridLeft + (col + 1) * cellW);
  const width = Math.max(1, Math.min(right - left, source.width - left));
  const height = Math.max(1, Math.min(Math.round((row + 1) * cellH) - top, source.height - top));

  const raw = await sharp(source.path)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = removeEdgeFragments(
    transparentizeCheckerboard(raw),
    raw.info.width,
    raw.info.height,
  );
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

function mapOutputColumnToSourceColumn(outputCol, sourceCols) {
  if (sourceCols === COLS) return outputCol;
  return Math.min(sourceCols - 1, Math.round((outputCol / (COLS - 1)) * (sourceCols - 1)));
}

async function normalize({ agentId, relPath, sourceCols, gridLeft, cellW: manualCellW }) {
  const sourcePath = path.join(ROOT, relPath);
  const sourceMeta = await sharp(sourcePath).metadata();
  const grid = {
    ...(await detectHorizontalGrid(sourcePath, sourceCols, sourceMeta.width)),
    ...(typeof gridLeft === "number" ? { left: gridLeft } : {}),
    ...(typeof manualCellW === "number" ? { cellW: manualCellW } : {}),
  };
  const source = { path: sourcePath, width: sourceMeta.width, height: sourceMeta.height, gridLeft: grid.left };
  const cellW = grid.cellW;
  const cellH = source.height / ROWS;
  const composites = [];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const sourceCol = mapOutputColumnToSourceColumn(col, sourceCols);
      const frame = await extractFrame(source, sourceCol, row, cellW, cellH);
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
  console.log(`${agentId}: ${source.width}x${source.height} (${sourceCols} cols) -> ${outMeta.width}x${outMeta.height}`);
}

(async () => {
  for (const source of sources) {
    await normalize(source);
  }
})();
