/**
 * Generate calendar icon PNGs and app icon (.icns) for GiMeet.
 *
 * Creates tray PNG files in src/assets/:
 *   tray-icon-dark.png, tray-icon-dark@2x.png          (macOS 18/36)
 *   tray-icon-light.png, tray-icon-light@2x.png
 *   tray-icon-win-{dark,light}-{16,32}.png             (Windows notification area)
 *
 * Creates app icon in build/:
 *   icon.icns (macOS app icon from 1024x1024 calendar icon)
 *
 * Usage:
 *   bun scripts/generate-calendar-tray-icons.mjs
 *   node scripts/generate-calendar-tray-icons.mjs
 */

import sharp from "sharp";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "src", "assets");
const BUILD_DIR = join(__dirname, "..", "build");

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
  const pad = s * 0.02;
  const iw = s - pad * 2; // inner width
  const ih = s - pad * 2; // inner height

  // Calendar body (rounded rectangle)
  const bodyW = iw * 0.88;
  const bodyH = ih * 0.90;
  const bodyX = (iw - bodyW) / 2;
  const bodyY = ih * 0.05;
  const r = Math.max(s * 0.06, 1); // corner radius

  // Header strip (top portion of calendar)
  const headerH = bodyH * 0.32;

  // Binding rings (positioned at top edge of body)
  const ringR = Math.max(s * 0.032, 0.6);
  const ring1X = bodyX + bodyW * 0.28;
  const ring2X = bodyX + bodyW * 0.72;
  const ringY = bodyY;

  // Day number positioning
  const fontSize = Math.max(s * 0.38, 6);
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
 * App icon SVG for macOS .icns (1024x1024).
 * Same calendar style but with a colorful design for the Dock.
 */
function appIconSvg(size) {
  const s = size;
  const pad = s * 0.02;
  const iw = s - pad * 2;
  const ih = s - pad * 2;

  // Calendar body
  const bodyW = iw * 0.88;
  const bodyH = ih * 0.90;
  const bodyX = (iw - bodyW) / 2;
  const bodyY = ih * 0.05;
  const r = s * 0.1;

  // Header strip
  const headerH = bodyH * 0.32;

  // Binding rings
  const ringR = Math.max(s * 0.03, 3);
  const ring1X = bodyX + bodyW * 0.28;
  const ring2X = bodyX + bodyW * 0.72;
  const ringY = bodyY;

  // Day number
  const fontSize = s * 0.42;
  const numX = bodyX + bodyW / 2;
  const numBaseline = bodyY + headerH + (bodyH - headerH) / 2 + fontSize * 0.36;

  // macOS-style background with rounded corners
  const bgR = s * 0.225; // ~22.5% radius matches macOS icon guidelines

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <!-- Rounded square background -->
  <rect width="${s}" height="${s}" rx="${bgR}" fill="#1D1D1F"/>

  <g transform="translate(${pad}, ${pad})">
    <!-- Binding rings -->
    <circle cx="${ring1X}" cy="${ringY}" r="${ringR}" fill="#FFFFFF"/>
    <circle cx="${ring2X}" cy="${ringY}" r="${ringR}" fill="#FFFFFF"/>

    <!-- Calendar body -->
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${r}" fill="#FFFFFF"/>

    <!-- Header strip -->
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${headerH}" rx="${r}" ry="${r}" fill="#4285F4"/>
    <rect x="${bodyX}" y="${bodyY + headerH - r}" width="${bodyW}" height="${r}" fill="#4285F4"/>

    <!-- Day number -->
    <text x="${numX}" y="${numBaseline}"
          font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="700"
          fill="#1D1D1F"
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
 * Generate macOS .icns file from a 1024x1024 PNG using iconutil.
 * Creates a temporary .iconset directory with all required sizes.
 */
async function generateIcns(png1024Buffer, outputPath) {
  const iconsetDir = join(BUILD_DIR, "AppIcon.iconset");
  if (existsSync(iconsetDir)) {
    rmSync(iconsetDir, { recursive: true, force: true });
  }
  mkdirSync(iconsetDir, { recursive: true });

  // iconutil requires these sizes in the iconset
  const sizes = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];

  // Resize the 1024 source to each required size
  for (const [size, filename] of sizes) {
    const resized = await sharp(png1024Buffer)
      .resize(size, size)
      .png()
      .toBuffer();
    writeFileSync(join(iconsetDir, filename), resized);
  }

  // Convert iconset to .icns
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${outputPath}"`, {
      stdio: "pipe",
    });
  } finally {
    // Clean up temporary iconset
    rmSync(iconsetDir, { recursive: true, force: true });
  }
}

/**
 * Aura icon SVG for the About dialog (128x128).
 * Calendar icon centered with a colored radial glow behind it.
 */
function auraIconSvg(size) {
  const s = size;
  const pad = s * 0.08;
  const iw = s - pad * 2;
  const ih = s - pad * 2;

  // Calendar body
  const bodyW = iw * 0.78;
  const bodyH = ih * 0.80;
  const bodyX = (iw - bodyW) / 2;
  const bodyY = ih * 0.10;
  const bodyR = s * 0.08;

  // Header strip
  const headerH = bodyH * 0.30;

  // Binding rings
  const ringR = Math.max(s * 0.028, 2);
  const ring1X = bodyX + bodyW * 0.28;
  const ring2X = bodyX + bodyW * 0.72;
  const ringY = bodyY;

  // Day number
  const fontSize = s * 0.34;
  const numX = bodyX + bodyW / 2;
  const numBaseline = bodyY + headerH + (bodyH - headerH) / 2 + fontSize * 0.36;

  const cx = s / 2;
  const cy = s / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="aura-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#4285F4" stop-opacity="0.25"/>
      <stop offset="35%" stop-color="#4285F4" stop-opacity="0.12"/>
      <stop offset="65%" stop-color="#34A853" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#1D1D1F" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- Background -->
  <rect width="${s}" height="${s}" rx="${s * 0.225}" fill="#1D1D1F"/>
  <!-- Aura glow circle -->
  <circle cx="${cx}" cy="${cy}" r="${s * 0.42}" fill="url(#aura-glow)"/>
  <!-- Calendar icon -->
  <g transform="translate(${pad}, ${pad})">
    <!-- Binding rings -->
    <circle cx="${ring1X}" cy="${ringY}" r="${ringR}" fill="#FFFFFF"/>
    <circle cx="${ring2X}" cy="${ringY}" r="${ringR}" fill="#FFFFFF"/>
    <!-- Calendar body -->
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${bodyR}" fill="#FFFFFF"/>
    <!-- Header strip -->
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${headerH}" rx="${bodyR}" ry="${bodyR}" fill="#4285F4"/>
    <rect x="${bodyX}" y="${bodyY + headerH - bodyR}" width="${bodyW}" height="${bodyR}" fill="#4285F4"/>
    <!-- Day number -->
    <text x="${numX}" y="${numBaseline}"
          font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="700"
          fill="#1D1D1F"
          text-anchor="middle">31</text>
  </g>
</svg>`;
}

// --- Tray icon definitions (active only) ---

const ICONS = [
  // Dark theme (white calendar, dark number) — macOS menu bar 18/36
  { name: "tray-icon-dark.png", size: 18, fill: "#FFFFFF", numberColor: "#1D1D1F" },
  { name: "tray-icon-dark@2x.png", size: 36, fill: "#FFFFFF", numberColor: "#1D1D1F" },
  // Light theme (dark calendar, white number) — macOS menu bar 18/36
  { name: "tray-icon-light.png", size: 18, fill: "#1D1D1F", numberColor: "#FFFFFF" },
  { name: "tray-icon-light@2x.png", size: 36, fill: "#1D1D1F", numberColor: "#FFFFFF" },
  // Windows notification area — 16×16 and 32×32 (no template images)
  { name: "tray-icon-win-dark-16.png", size: 16, fill: "#FFFFFF", numberColor: "#1D1D1F" },
  { name: "tray-icon-win-dark-32.png", size: 32, fill: "#FFFFFF", numberColor: "#1D1D1F" },
  { name: "tray-icon-win-light-16.png", size: 16, fill: "#1D1D1F", numberColor: "#FFFFFF" },
  { name: "tray-icon-win-light-32.png", size: 32, fill: "#1D1D1F", numberColor: "#FFFFFF" },
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
    const png = await svgToPng(svg, icon.size);
    const outPath = join(ASSETS_DIR, icon.name);
    writeFileSync(outPath, png);
    console.log(`  OK: ${icon.name} (${icon.size}x${icon.size})`);
  } catch (err) {
    console.error(`  FAIL: ${icon.name}: ${err.message}`);
    process.exitCode = 1;
  }
}

/**
 * Pack PNG buffers into a multi-size .ico (PNG-compressed entries, Vista+).
 * @param {{ size: number, data: Buffer }[]} images
 */
function encodeIco(images) {
  const count = images.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const entries = images.map((img) => {
    const entry = { size: img.size, data: img.data, offset };
    offset += img.data.length;
    return entry;
  });

  const buf = Buffer.alloc(offset);
  buf.writeUInt16LE(0, 0); // reserved
  buf.writeUInt16LE(1, 2); // type = icon
  buf.writeUInt16LE(count, 4);

  let entryOffset = 6;
  for (const e of entries) {
    const dim = e.size >= 256 ? 0 : e.size;
    buf.writeUInt8(dim, entryOffset); // width
    buf.writeUInt8(dim, entryOffset + 1); // height
    buf.writeUInt8(0, entryOffset + 2); // color palette
    buf.writeUInt8(0, entryOffset + 3); // reserved
    buf.writeUInt16LE(1, entryOffset + 4); // color planes
    buf.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    buf.writeUInt32LE(e.data.length, entryOffset + 8);
    buf.writeUInt32LE(e.offset, entryOffset + 12);
    e.data.copy(buf, e.offset);
    entryOffset += 16;
  }
  return buf;
}

console.log("\nGenerating app icons (icon.icns / icon.ico)...\n");

try {
  const appSvg = appIconSvg(1024);
  const png1024 = await svgToPng(appSvg, 1024);

  // macOS .icns (requires iconutil — skip gracefully on non-mac hosts)
  if (process.platform === "darwin") {
    const icnsPath = join(BUILD_DIR, "icon.icns");
    await generateIcns(png1024, icnsPath);
    console.log("  OK: build/icon.icns (1024x1024 source)");
  } else {
    console.log("  SKIP: build/icon.icns (iconutil is macOS-only)");
  }

  // Windows .ico — multi-size PNG entries via sharp on any OS
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoImages = [];
  for (const size of icoSizes) {
    const data = await sharp(png1024).resize(size, size).png().toBuffer();
    icoImages.push({ size, data });
  }
  const icoPath = join(BUILD_DIR, "icon.ico");
  writeFileSync(icoPath, encodeIco(icoImages));
  console.log(`  OK: build/icon.ico (${icoSizes.join("/")})`);
} catch (err) {
  console.error(`  FAIL: app icons: ${err.message}`);
  process.exitCode = 1;
}

console.log("\nGenerating about dialog aura icon...\n");

try {
  const auraSvg = auraIconSvg(128);
  const outPath = join(ASSETS_DIR, "about-icon.svg");
  writeFileSync(outPath, auraSvg);
  console.log("  OK: about-icon.svg (128x128)");
} catch (err) {
  console.error(`  FAIL: about-icon.svg: ${err.message}`);
  process.exitCode = 1;
}

console.log(
  "\nDone. tray icons (mac 18/36 + win 16/32) + app icons generated.",
);
