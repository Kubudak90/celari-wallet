// design-tokens/accessibility.mjs
//
// WCAG 2.1 contrast audit for the Celari color tokens.
//
// For every canonical foreground/background pair (in both dark and
// light palettes), compute the contrast ratio and check it against:
//   AA  body text:  >= 4.5
//   AA  large/UI:   >= 3.0
//   AAA body text:  >= 7.0
//
// Exits non-zero if any pair flagged AA-required falls below 4.5
// (or 3.0 for pairs marked as `large`).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const tokens = JSON.parse(
  readFileSync(resolve(ROOT, "design-tokens/tokens.json"), "utf8"),
);

// --- color helpers -----------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// sRGB → relative luminance per WCAG 2.1
function relativeLuminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [bright, dark] = lA >= lB ? [lA, lB] : [lB, lA];
  return (bright + 0.05) / (dark + 0.05);
}

// --- token resolution --------------------------------------------------------

function resolveColor(path, mode) {
  const segments = path.split(".");
  let node = tokens.color;
  for (const s of segments) node = node[s];
  if ("$value" in node) return node.$value;
  return mode === "dark" ? node.$dark : node.$light;
}

// --- audit pairs -------------------------------------------------------------

// Each entry is { fg, bg, label, level, large? }
//   level: "AA" (must pass) or "info" (advisory)
//   large: true → 3:1 threshold instead of 4.5:1
const PAIRS = [
  { fg: "text.primary",   bg: "bg.base",     label: "primary on base",      level: "AA" },
  { fg: "text.primary",   bg: "bg.elevated", label: "primary on elevated",  level: "AA" },
  { fg: "text.primary",   bg: "bg.raised",   label: "primary on raised",    level: "AA" },
  { fg: "text.secondary", bg: "bg.base",     label: "secondary on base",    level: "AA" },
  { fg: "text.secondary", bg: "bg.elevated", label: "secondary on elev.",   level: "AA" },
  { fg: "text.muted",     bg: "bg.base",     label: "muted on base",        level: "info" },
  // Gold is theme-agnostic but its contrast on light backgrounds is poor.
  // We audit gold on dark as AA (it's the brand's primary palette);
  // on light, gold.deep is the FG variant that passes AA.
  { fg: "gold.primary",   bg: "bg.base",     label: "gold on base",         level: "AA",   large: true, modes: ["dark"] },
  { fg: "gold.primary",   bg: "bg.elevated", label: "gold on elevated",     level: "AA",   large: true, modes: ["dark"] },
  { fg: "gold.soft",      bg: "bg.base",     label: "gold-soft on base",    level: "AA",   large: true, modes: ["dark"] },
  { fg: "gold.deep",      bg: "bg.base",     label: "gold-deep on base",    level: "AA",   large: true, modes: ["light"] },
  { fg: "gold.primary",   bg: "bg.base",     label: "gold on base (info)",  level: "info", large: true, modes: ["light"] },
  { fg: "status.up",      bg: "bg.base",     label: "status-up on base",    level: "AA", large: true },
  { fg: "status.down",    bg: "bg.base",     label: "status-down on base",  level: "AA", large: true },
  { fg: "border.subtle",  bg: "bg.base",     label: "border on base",       level: "info", large: true },
];

let failed = 0;
const rows = [];

for (const mode of ["dark", "light"]) {
  for (const p of PAIRS) {
    if (p.modes && !p.modes.includes(mode)) continue;
    const fg = resolveColor(p.fg, mode);
    const bg = resolveColor(p.bg, mode);
    const ratio = contrast(fg, bg);
    const threshold = p.large ? 3.0 : 4.5;
    const passes = ratio >= threshold;
    const required = p.level === "AA";
    const status = passes ? "PASS" : required ? "FAIL" : "warn";
    if (!passes && required) failed++;
    rows.push({
      mode,
      pair: p.label,
      fg,
      bg,
      ratio: ratio.toFixed(2),
      threshold: threshold.toFixed(1),
      status,
    });
  }
}

// --- report ------------------------------------------------------------------

const W = {
  mode: 6, pair: 30, fg: 9, bg: 9, ratio: 6, threshold: 5, status: 6,
};
const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad("mode", W.mode) + pad("pair", W.pair) +
  pad("fg", W.fg) + pad("bg", W.bg) +
  pad("ratio", W.ratio) + pad("min", W.threshold) +
  pad("status", W.status),
);
console.log("-".repeat(W.mode + W.pair + W.fg + W.bg + W.ratio + W.threshold + W.status));
for (const r of rows) {
  console.log(
    pad(r.mode, W.mode) + pad(r.pair, W.pair) +
    pad(r.fg, W.fg) + pad(r.bg, W.bg) +
    pad(r.ratio, W.ratio) + pad(r.threshold, W.threshold) +
    pad(r.status, W.status),
  );
}
console.log();

if (failed > 0) {
  console.error(`accessibility: ${failed} pair(s) failed WCAG AA`);
  process.exit(1);
} else {
  console.log("accessibility: all required pairs pass WCAG AA");
}
