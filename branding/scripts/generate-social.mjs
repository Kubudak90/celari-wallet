// branding/scripts/generate-social.mjs
//
// Generates social-media + store-listing banner assets by compositing
// `logo-lockup.svg` onto sized dark canvases.
//
// Outputs (under branding/exports/social/):
//   twitter-banner.png        1500×500   X / Twitter header
//   discord-banner.png         960×540   Discord server banner
//   chrome-marquee.png        1400×560   Chrome Web Store marquee promo
//   chrome-small-tile.png      440×280   Chrome Web Store small tile
//   chrome-screenshot.png     1280×800   Chrome Web Store screenshot slot
//   appstore-hero.png         3000×2000  App Store / Play Store feature hero

import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const LOCKUP = resolve(ROOT, "branding/exports/logo-lockup.svg");
const OUT = resolve(ROOT, "branding/exports/social");

mkdirSync(OUT, { recursive: true });

// Renders the gold lockup at a given pixel width.
async function lockup(widthPx) {
  return sharp(readFileSync(LOCKUP), { density: 400 })
    .resize(widthPx, null, { fit: "inside" })
    .png()
    .toBuffer();
}

// Optional faint gold ring backdrop (subtle radial décor).
function ringSvg(cx, cy, radii, opacity = 0.16) {
  const circles = radii
    .map(
      (r) =>
        `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="#D4A853" stroke-width="1" fill="none" opacity="${opacity}"/>`,
    )
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cx * 2}" height="${cy * 2}">${circles}</svg>`,
  );
}

const banners = [
  {
    name: "twitter-banner.png",
    width: 1500,
    height: 500,
    lockupWidth: 520,
  },
  {
    name: "discord-banner.png",
    width: 960,
    height: 540,
    lockupWidth: 380,
  },
  {
    name: "chrome-marquee.png",
    width: 1400,
    height: 560,
    lockupWidth: 540,
  },
  {
    name: "chrome-small-tile.png",
    width: 440,
    height: 280,
    lockupWidth: 280,
  },
  {
    name: "chrome-screenshot.png",
    width: 1280,
    height: 800,
    lockupWidth: 600,
  },
  {
    name: "appstore-hero.png",
    width: 3000,
    height: 2000,
    lockupWidth: 1200,
  },
];

for (const b of banners) {
  const lockupBuf = await lockup(b.lockupWidth);
  const ringBuf = ringSvg(
    Math.round(b.width / 2),
    Math.round(b.height / 2),
    [Math.min(b.width, b.height) * 0.38, Math.min(b.width, b.height) * 0.5, Math.min(b.width, b.height) * 0.62],
  );
  await sharp({
    create: {
      width: b.width,
      height: b.height,
      channels: 4,
      background: { r: 10, g: 10, b: 11, alpha: 1 },
    },
  })
    .composite([
      { input: ringBuf, gravity: "center" },
      { input: lockupBuf, gravity: "center" },
    ])
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT, b.name));
}

console.log(`generate-social: wrote ${banners.length} banners to ${OUT}`);
