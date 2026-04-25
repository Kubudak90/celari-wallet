// branding/scripts/generate-press-kit.mjs
//
// Bundles the canonical Celari brand assets (logo SVGs + PNG sizes +
// app icons + brand color reference) into a single zip suitable for
// press / partner distribution.
//
// Output: branding/exports/celari-press-kit.zip

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import AdmZip from "adm-zip";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const EXPORTS = resolve(ROOT, "branding/exports");
const TMP = resolve(ROOT, "branding/exports/.press-kit-staging");
const OUT_ZIP = resolve(EXPORTS, "celari-press-kit.zip");

mkdirSync(TMP, { recursive: true });

// 1. Copy SVG sources verbatim
const svgs = [
  "logo-mark.svg",
  "logo-mark-mono-dark.svg",
  "logo-mark-mono-light.svg",
  "logo-lockup.svg",
  "logo-lockup-mono-dark.svg",
  "wordmark.svg",
];
for (const f of svgs) {
  const src = resolve(EXPORTS, f);
  const dst = resolve(TMP, "svg", f);
  mkdirSync(resolve(TMP, "svg"), { recursive: true });
  writeFileSync(dst, readFileSync(src));
}

// 2. Render PNG sizes for each variant
const pngSizes = [256, 512, 1024];
const pngTargets = [
  { name: "logo-mark", svg: "logo-mark.svg" },
  { name: "logo-mark-mono-dark", svg: "logo-mark-mono-dark.svg" },
  { name: "logo-mark-mono-light", svg: "logo-mark-mono-light.svg" },
  { name: "logo-lockup", svg: "logo-lockup.svg" },
  { name: "logo-lockup-mono-dark", svg: "logo-lockup-mono-dark.svg" },
];
mkdirSync(resolve(TMP, "png"), { recursive: true });
for (const t of pngTargets) {
  const src = readFileSync(resolve(EXPORTS, t.svg));
  for (const size of pngSizes) {
    await sharp(src, { density: 400 })
      .resize(size, null, { fit: "inside" })
      .png({ compressionLevel: 9 })
      .toFile(resolve(TMP, "png", `${t.name}-${size}.png`));
  }
}

// 3. App icon masters
mkdirSync(resolve(TMP, "app-icon"), { recursive: true });
for (const variant of ["dark", "light"]) {
  writeFileSync(
    resolve(TMP, "app-icon", `app-icon-${variant}-1024.png`),
    readFileSync(resolve(EXPORTS, `app-icon-${variant}-1024.png`)),
  );
}

// 4. Brand color reference (text)
const colors = `Celari Brand Colors

DARK PALETTE
  bg.base       #0A0A0B
  bg.elevated   #141416
  bg.raised     #1C1C1F
  border.subtle #26262A
  text.primary  #FFFFFF
  text.secondary #A8A8B0
  text.muted    #6B6B73
  status.up     #34D399
  status.down   #F87171

LIGHT PALETTE
  bg.base       #F7F6F1
  bg.elevated   #FFFFFF
  bg.raised     #ECEBE5
  border.subtle #E0DFD9
  text.primary  #0A0A0B
  text.secondary #525258
  text.muted    #8A8A92
  status.up     #059669
  status.down   #DC2626

GOLD (THEME-AGNOSTIC)
  primary       #D4A853
  soft          #B8924A
  glow          #E8C878
  deep          #8A6F38

TYPOGRAPHY
  Wordmark      Outfit Light (300), tracking 0.3em
  Body / UI     Inter (400/500/600)
  Numeric       SF Pro Rounded (system)

SOURCE OF TRUTH
  design-tokens/tokens.json
  Run \`npm run tokens\` to regenerate platform outputs.
`;
writeFileSync(resolve(TMP, "BRAND-COLORS.txt"), colors);

// 5. Quick README
const readme = `Celari Press Kit

Contents:
  /svg/         Original logo + wordmark SVG sources (vector, scalable)
  /png/         Rasterized 256/512/1024 PNGs for each variant
  /app-icon/    1024×1024 app icon masters (dark / light)
  BRAND-COLORS.txt   Color + typography reference

Permitted uses:
  - Press, partner integration, app store listings, social media
  - Articles, videos, presentations referencing Celari
  - Documentation and tutorials covering Celari Wallet

Not permitted:
  - Implying endorsement or partnership without prior written approval
  - Modifying the logo geometry, colors, or wordmark spacing
  - Using on backgrounds that obscure the mark (use the mono variants
    where contrast is poor)

Contact:
  https://celariwallet.com
`;
writeFileSync(resolve(TMP, "README.txt"), readme);

// 6. Zip the staging directory
const zip = new AdmZip();
zip.addLocalFolder(TMP, "celari-press-kit");
zip.writeZip(OUT_ZIP);

console.log(`generate-press-kit: wrote ${OUT_ZIP}`);
