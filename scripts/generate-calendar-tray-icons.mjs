/**
 * Generate calendar tray icon PNGs for GiMeet.
 *
 * Creates 8 PNG files:
 *   Active:   tray-icon-dark.png, tray-icon-dark@2x.png
 *             tray-icon-light.png, tray-icon-light@2x.png
 *   Inactive: tray-icon-inactive-dark.png, tray-icon-inactive-dark@2x.png
 *             tray-icon-inactive-light.png, tray-icon-inactive-light@2x.png
 *
 * Usage:
 *   bun scripts/generate-calendar-tray-icons.mjs
 *   node scripts/generate-calendar-tray-icons.mjs
 */

import sharp from "sharp";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "src", "assets");

if (!existsSync(ASSETS_DIR)) {
  mkdirSync(ASSETS_DIR, { recursive: true });
}

/**
 * Calendar SVG optimized for macOS menu bar.
 * Renders at any size — designed for 18px (1x) and 36px (2x).
 */
function calendarSvg(opts) {
  const { fill, numberColor, size } = opts;
  const s = size;
  const pad = s * 0.05;
  const iw = s - pad * 2; // inner width
  const ih = s - pad * 2; // inner height

  // Calendar body (rounded rectangle)
  const bodyW = iw * 0.82;
  const bodyH = ih * 0.84;
  const bodyX = (iw - bodyW) / 2;
  const bodyY = ih * 0.1;
  const r = Math.max(s * 0.06, 1); // corner radius

  // Header strip (top portion of calendar)
  const headerH = bodyH * 0.32;

  // Binding rings (positioned at top edge of body)
  const ringR = Math.max(s * 0.032, 0.6);
  const ring1X = bodyX + bodyW * 0.28;
  const ring2X = bodyX + bodyW * 0.72;
  const ringY = bodyY;

  // Day number positioning
  const fontSize = Math.max(s * 0.36, 6);
  const numX = bodyX + bodyW / 2;
  const numBaseline = bodyY + headerH + (bodyH - headerH) / 2 + fontSize * 0.36;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <g transform="translate(${pad}, ${pad})">
    <!-- Binding rings -->
    <circle cx="${ring1X}" cy="${ringY}" r="${ringR}" fill="${fill}"/>
    <circle cx="${ring2X}" cy="${ringY}" r="${ringR}" fill="${fill}"/>

    <!-- Calendar body -->
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${r}" fill="${fill}"/>

    <!-- Header strip (subtle differentiation from body) -->
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${headerH}" rx="${r}" ry="${r}" fill="${numberColor}" opacity="0.2"/>
    <rect x="${bodyX}" y="${bodyY + headerH - r}" width="${bodyW}" height="${r}" fill="${numberColor}" opacity="0.2"/>

    <!-- Day number -->
    <text x="${numX}" y="${numBaseline}"
          font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="700"
          fill="${numberColor}"
          text-anchor="middle">31</text>
  </g>
</svg>`;
}

/**
 * Convert SVG buffer to PNG at target size using sharp.
 */
async function svgToPng(svgString, size) {
  return sharp(Buffer.from(svgString)).resize(size, size).png().toBuffer();
}

/**
 * Apply inactive effect: multiply all alpha values by the given factor.
 * Processes raw RGBA pixel data directly.
 */
async function createInactiveVariant(pngBuffer, opacity = 0.4) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const factor = Math.round(opacity * 255);
  const raw = Buffer.from(data);
  for (let i = 3; i < raw.length; i += 4) {
    raw[i] = Math.round((raw[i] / 255) * factor);
  }

  return sharp(raw, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// --- Icon definitions ---

const ICONS = [
  // Active — dark theme (white calendar, dark number)
  {
    name: "tray-icon-dark.png",
    size: 18,
    fill: "#FFFFFF",
    numberColor: "#1D1D1F",
    inactive: false,
  },
  {
    name: "tray-icon-dark@2x.png",
    size: 36,
    fill: "#FFFFFF",
    numberColor: "#1D1D1F",
    inactive: false,
  },
  // Active — light theme (dark calendar, white number)
  {
    name: "tray-icon-light.png",
    size: 18,
    fill: "#1D1D1F",
    numberColor: "#FFFFFF",
    inactive: false,
  },
  {
    name: "tray-icon-light@2x.png",
    size: 36,
    fill: "#1D1D1F",
    numberColor: "#FFFFFF",
    inactive: false,
  },
  // Inactive — dark theme (dimmed white calendar)
  {
    name: "tray-icon-inactive-dark.png",
    size: 18,
    fill: "#FFFFFF",
    numberColor: "#1D1D1F",
    inactive: true,
  },
  {
    name: "tray-icon-inactive-dark@2x.png",
    size: 36,
    fill: "#FFFFFF",
    numberColor: "#1D1D1F",
    inactive: true,
  },
  // Inactive — light theme (dimmed dark calendar)
  {
    name: "tray-icon-inactive-light.png",
    size: 18,
    fill: "#1D1D1F",
    numberColor: "#FFFFFF",
    inactive: true,
  },
  {
    name: "tray-icon-inactive-light@2x.png",
    size: 36,
    fill: "#1D1D1F",
    numberColor: "#FFFFFF",
    inactive: true,
  },
];

// --- Main ---

console.log("Generating calendar tray icons...\n");

for (const icon of ICONS) {
  const svg = calendarSvg({
    fill: icon.fill,
    numberColor: icon.numberColor,
    size: icon.size,
  });

  try {
    let png = await svgToPng(svg, icon.size);

    if (icon.inactive) {
      png = await createInactiveVariant(png, 0.4);
    }

    const outPath = join(ASSETS_DIR, icon.name);
    writeFileSync(outPath, png);
    console.log(`  OK: ${icon.name} (${icon.size}x${icon.size})`);
  } catch (err) {
    console.error(`  FAIL: ${icon.name}: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("\nDone. 8 icons generated.");
