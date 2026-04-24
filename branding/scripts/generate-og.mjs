// branding/scripts/generate-og.mjs
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const LOGO = resolve(ROOT, "branding/exports/logo-lockup.svg");
const OUT = resolve(ROOT, "branding/exports/og-dark.png");

mkdirSync(dirname(OUT), { recursive: true });

const logoPng = await sharp(readFileSync(LOGO), { density: 300 })
  .resize(600, null, { fit: "inside" })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 4,
    background: { r: 10, g: 10, b: 11, alpha: 1 },
  },
})
  .composite([{ input: logoPng, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log("generate-og: wrote og-dark.png 1200x630");
