// tools/make-icons.cjs
// Usage: node tools/make-icons.cjs
// Creates sitefrontend/icons/spark.svg (if missing) and renders PNGs.

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const sharp = require("sharp");

const ICON_DIR = path.join("sitefrontend", "icons");
const SVG_PATH = path.join(ICON_DIR, "spark.svg");
const PNG_192 = path.join(ICON_DIR, "spark-192.png");
const PNG_512 = path.join(ICON_DIR, "spark-512.png");
// optional maskable (safe for Android adaptive masks)
const PNG_MASKABLE_512 = path.join(ICON_DIR, "spark-maskable-512.png");

// Minimal brand mark that matches the app’s glow vibe.
const SVG_CONTENT = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#0B1322"/>
  <g filter="url(#g0)"><circle cx="256" cy="256" r="160" fill="#101E35"/></g>
  <path d="M128 256l80 80 176-176" stroke="#6BD38A" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
  <g filter="url(#g1)"><circle cx="384" cy="160" r="14" fill="#FFD36A"/></g>
  <path d="M136 252l72 72 160-160" stroke="url(#lg)" stroke-width="14" stroke-linecap="round"/>
  <defs>
    <linearGradient id="lg" x1="136" y1="252" x2="368" y2="164" gradientUnits="userSpaceOnUse">
      <stop stop-color="#6BD38A"/><stop offset="1" stop-color="#6AA7FF"/>
    </linearGradient>
    <filter id="g0" x="56" y="56" width="400" height="400"><feGaussianBlur stdDeviation="24"/></filter>
    <filter id="g1" x="350" y="126" width="68" height="68"><feGaussianBlur stdDeviation="8"/></filter>
  </defs>
</svg>
`.trim();

async function ensureIconSources() {
  await fsp.mkdir(ICON_DIR, { recursive: true });
  try {
    await fsp.access(SVG_PATH, fs.constants.F_OK);
    console.log(`✓ Found ${SVG_PATH}`);
  } catch {
    await fsp.writeFile(SVG_PATH, SVG_CONTENT, "utf8");
    console.log(`+ Wrote ${SVG_PATH}`);
  }
}

async function makePngs() {
  // Standard 192 + 512
  await sharp(SVG_PATH).resize(192, 192).png().toFile(PNG_192);
  console.log(`+ Wrote ${PNG_192}`);
  await sharp(SVG_PATH).resize(512, 512).png().toFile(PNG_512);
  console.log(`+ Wrote ${PNG_512}`);

  // Maskable 512 with safe padding (so Android adaptive icons don’t clip it)
  const PAD = Math.round(512 * 0.12); // ~12% padding
  const buf = await sharp(SVG_PATH).resize(512 - PAD * 2, 512 - PAD * 2).png().toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 11, g: 19, b: 34, alpha: 1 } }
  })
  .composite([{ input: buf, left: PAD, top: PAD }])
  .png()
  .toFile(PNG_MASKABLE_512);
  console.log(`+ Wrote ${PNG_MASKABLE_512}`);
}

(async () => {
  try {
    await ensureIconSources();
    await makePngs();
    console.log("Done ✔︎");
  } catch (err) {
    console.error("Icon generation failed:", err);
    process.exit(1);
  }
})();
