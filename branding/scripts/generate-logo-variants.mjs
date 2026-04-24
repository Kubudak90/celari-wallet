// branding/scripts/generate-logo-variants.mjs
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const OUT = resolve(ROOT, "branding/exports/app-icon");
const SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

const THEMES = [
  { name: "dark",  src: resolve(ROOT, "branding/exports/app-icon-dark-1024.png") },
  { name: "light", src: resolve(ROOT, "branding/exports/app-icon-light-1024.png") },
];

mkdirSync(OUT, { recursive: true });

for (const { name, src } of THEMES) {
  const srcBuf = readFileSync(src);
  for (const size of SIZES) {
    const out = resolve(OUT, `${name}-${size}.png`);
    await sharp(srcBuf)
      .resize(size, size, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toFile(out);
  }
}
console.log(`generate-logo-variants: ${SIZES.length * THEMES.length} sizes (${THEMES.map(t => t.name).join(" + ")})`);
