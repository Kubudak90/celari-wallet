// branding/scripts/generate-logo-variants.mjs
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const SRC = resolve(ROOT, "branding/exports/app-icon-dark-1024.png");
const OUT = resolve(ROOT, "branding/exports/app-icon");
const SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

mkdirSync(OUT, { recursive: true });
const srcBuf = readFileSync(SRC);

for (const size of SIZES) {
  const out = resolve(OUT, `dark-${size}.png`);
  await sharp(srcBuf).resize(size, size, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(out);
}
console.log(`generate-logo-variants: ${SIZES.length} sizes written to ${OUT}`);
