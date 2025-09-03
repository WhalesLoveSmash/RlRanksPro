// tools/make-icons.mjs
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

const root = process.cwd();
const iconsDir = path.join(root, "sitefrontend", "icons");
const svgPath = path.join(iconsDir, "spark.svg");

await fs.mkdir(iconsDir, { recursive: true });

// If you haven't created spark.svg yet, we'll drop in a simple placeholder.
const placeholderSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFE780"/>
      <stop offset="55%" stop-color="#FFC62A"/>
      <stop offset="100%" stop-color="#FF9F00"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="#0B1322"/>
  <g transform="translate(512 512)">
    <path d="M0 -300 L60 -30 L300 0 L60 30 L0 300 L-60 30 L-300 0 L-60 -30 Z" fill="url(#g)" filter="url(#f)"/>
  </g>
  <filter id="f">
    <feGaussianBlur in="SourceGraphic" stdDeviation="1.5"/>
  </filter>
</svg>`;

try {
  await fs.access(svgPath);
} catch {
  await fs.writeFile(svgPath, placeholderSVG, "utf8");
  console.log("Created placeholder icons/spark.svg (replace with your real SVG whenever).");
}

async function make(size) {
  const out = path.join(iconsDir, `spark-${size}.png`);
  await sharp(svgPath).resize(size, size, { fit: "contain", background: "#0B1322" }).png({ compressionLevel: 9 }).toFile(out);
  console.log("✔ Wrote", path.relative(root, out));
}

await make(192);
await make(512);

console.log("All done. Add /icons/spark-192.png and /icons/spark-512.png to git and deploy.");
