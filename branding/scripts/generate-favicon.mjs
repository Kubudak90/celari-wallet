// branding/scripts/generate-favicon.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const SRC = resolve(ROOT, "branding/exports/favicon-source.svg");
const OUT = resolve(ROOT, "branding/exports/favicon");
const SIZES = [16, 32, 48, 192, 512];

mkdirSync(OUT, { recursive: true });
const svgBuf = readFileSync(SRC);

for (const s of SIZES) {
  await sharp(svgBuf)
    .resize(s, s)
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT, `favicon-${s}.png`));
}
await sharp(svgBuf)
  .resize(180, 180)
  .png({ compressionLevel: 9 })
  .toFile(resolve(OUT, "apple-touch-icon.png"));

const icoBuf = await pngToIco([16, 32, 48].map((s) => resolve(OUT, `favicon-${s}.png`)));
writeFileSync(resolve(OUT, "favicon.ico"), icoBuf);

console.log("generate-favicon: wrote", SIZES.length, "PNGs + apple-touch-icon + favicon.ico");
