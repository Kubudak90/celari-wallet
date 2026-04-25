// branding/scripts/render-masters.mjs
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const OUT_DIR = resolve(ROOT, "branding/exports");
mkdirSync(OUT_DIR, { recursive: true });

const SIZE = 1024;
const CORNER = 225; // ~22% of 1024

async function makeMask() {
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
        `<rect width="${SIZE}" height="${SIZE}" rx="${CORNER}" ry="${CORNER}" fill="white"/>` +
        `</svg>`,
    ),
  )
    .png()
    .toBuffer();
}

async function renderIcon({ markPath, bg, outPath }) {
  const markSvg = readFileSync(markPath);
  const markPng = await sharp(markSvg, { density: 300 }).resize(SIZE, SIZE).png().toBuffer();

  const combined = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: bg },
  })
    .composite([{ input: markPng }])
    .png()
    .toBuffer();

  const mask = await makeMask();

  await sharp(combined)
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

await renderIcon({
  markPath: resolve(ROOT, "branding/exports/logo-mark.svg"),
  bg: { r: 10, g: 10, b: 11, alpha: 1 },
  outPath: resolve(OUT_DIR, "app-icon-dark-1024.png"),
});

await renderIcon({
  markPath: resolve(ROOT, "branding/exports/logo-mark-mono-dark.svg"),
  bg: { r: 247, g: 246, b: 241, alpha: 1 },
  outPath: resolve(OUT_DIR, "app-icon-light-1024.png"),
});

// iOS 18 tinted variant: single-tone white mark on opaque black.
// iOS extracts luminance and blends with the user's accent color.
// Background must NOT be transparent (system applies its own gradient).
await renderIcon({
  markPath: resolve(ROOT, "branding/exports/logo-mark-mono-light.svg"),
  bg: { r: 0, g: 0, b: 0, alpha: 1 },
  outPath: resolve(OUT_DIR, "app-icon-tinted-1024.png"),
});

console.log("render-masters: wrote app-icon-{dark,light,tinted}-1024.png");
