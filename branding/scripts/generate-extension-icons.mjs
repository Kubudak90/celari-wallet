// branding/scripts/generate-extension-icons.mjs
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const SRC = resolve(ROOT, "branding/exports/app-icon-dark-1024.png");
const OUT = resolve(ROOT, "branding/exports/extension");
const SIZES = [16, 32, 48, 128];

mkdirSync(OUT, { recursive: true });
const src = readFileSync(SRC);
for (const s of SIZES) {
  await sharp(src).resize(s, s).png({ compressionLevel: 9 }).toFile(resolve(OUT, `icon-${s}.png`));
}
console.log("generate-extension-icons: wrote", SIZES.length, "PNGs");
