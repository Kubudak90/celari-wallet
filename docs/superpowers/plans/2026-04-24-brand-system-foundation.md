# Brand System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Celari brand foundation — a `tokens.json` source of truth with build scripts that emit per-platform outputs, a Pencil master document with all brand and screen frames, and exported logo/icon/image assets ready for iOS, website, and extension rebrands.

**Architecture:**
- `design-tokens/tokens.json` (W3C DTCG format) is the single source of truth for colors, radius, motion, typography.
- `design-tokens/build.mjs` emits: website CSS vars, extension CSS vars, iOS `Tokens.swift`, `Assets.xcassets` color sets, and a human preview HTML.
- `branding/celari-brand-system.pen` is the visual master; exports land under `branding/exports/`.
- `branding/scripts/*.mjs` resize/re-encode exported masters into platform-specific sizes (AppIcon variants, favicons, extension icons, OG image, extension icon copy).
- Old assets move to `backup-before-fixes/branding-v1/` before anything replaces them.

**Tech Stack:** Node 22+ (ESM), `sharp` (already in devDependencies), `jest` + `ts-jest` (existing), Pencil MCP (via desktop app).

**Prerequisites (manual, before Task 0):**
1. Pencil desktop app must be running AND the in-app MCP bridge enabled (Settings → MCP); required for Task 8+.
2. Clean working tree (commit or stash in-flight changes on `main`).
3. `node --version` ≥ 22, `npm --version` ≥ 10.

**Convention note for tests:** all tests use `execFileSync("node", ["<script>"], { cwd: ROOT, stdio: "inherit" })` — never `exec` / `execSync` with a concatenated string. This avoids shell interpretation and satisfies this repo's security hook.

---

## File Structure

Created by this plan:

```
design-tokens/
  tokens.json                          # source of truth
  build.mjs                            # orchestrator (CSS + Swift + xcassets + preview)
  README.md                            # usage + schema notes
  test/
    build.test.ts                      # exercises each output target

branding/
  celari-brand-system.pen              # Pencil master (4 pages)
  exports/                             # committed outputs from Pencil
    logo-mark.svg
    logo-mark-mono-dark.svg
    logo-mark-mono-light.svg
    logo-lockup.svg
    logo-lockup-mono-dark.svg
    wordmark.svg
    app-icon-dark-1024.png
    app-icon-light-1024.png
    favicon-source.svg
    hero-phone-home.png
    tokens-preview.html                # generated
    icons/
      feature-shield-lock.svg
      feature-fingerprint.svg
      feature-eye-off.svg
      feature-zero-trace.svg
      action-send.svg
      action-receive.svg
      action-swap.svg
      action-buy.svg
    app-icon/     # generated: dark-20…1024
    favicon/      # generated: favicon-16…512, apple-touch-icon, favicon.ico
    extension/    # generated: icon-16/32/48/128
    og-dark.png   # generated: 1200×630
  scripts/
    generate-logo-variants.mjs
    generate-favicon.mjs
    generate-extension-icons.mjs
    generate-og.mjs
    copy-to-extension.mjs
    test/
      logo-variants.test.ts
      favicon.test.ts
      extension-icons.test.ts
      og.test.ts
      copy-to-extension.test.ts

backup-before-fixes/branding-v1/       # old assets archived

# Modified
package.json                           # adds "tokens" and "brand:export" scripts, png-to-ico dep
.gitignore                             # ignores generated iOS token file
ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift   # regenerated
ios/CelariWallet/CelariWallet/Assets.xcassets/Colors/            # regenerated color sets
website/src/styles/tokens.css          # regenerated
extension/public/styles/tokens.css     # regenerated
extension/public/icons/icon-{16,32,48,128}.png  # replaced via copy-to-extension.mjs
```

---

## Task 0: Pre-flight

**Files:** (verification only)

- [ ] **Step 1: Verify clean tree**

Run: `git status`
Expected: working tree clean on `main`, or only unrelated untracked files. If dirty, stash or commit before proceeding.

- [ ] **Step 2: Verify Node version**

Run: `node --version`
Expected: `v22.x` or higher.

- [ ] **Step 3: Verify sharp is installed**

Run: `node --input-type=commonjs -e "require('sharp'); console.log('ok')"`
Expected: `ok`. If module missing: `npm install`.

- [ ] **Step 4: Confirm Pencil desktop + MCP bridge (only needed at Task 8+)**

Open Pencil.app, Settings → MCP → ensure the bridge shows "connected" or equivalent. You will need an open `.pen` document to run MCP read/design calls.

---

## Task 1: Backup existing brand assets

**Files:**
- Move: `branding/celari-brand-system.html`, `branding/celari-logo-*.png`, `branding/twitter-banner.png` → `backup-before-fixes/branding-v1/branding/`
- Move: `logo/*` → `backup-before-fixes/branding-v1/logo/`
- Modify: `.gitignore`

- [ ] **Step 1: Create backup directory**

Run:
```bash
mkdir -p backup-before-fixes/branding-v1/branding backup-before-fixes/branding-v1/logo
```

- [ ] **Step 2: Move old `branding/` assets**

```bash
git mv branding/celari-brand-system.html backup-before-fixes/branding-v1/branding/
git mv branding/celari-logo-1000.png backup-before-fixes/branding-v1/branding/
git mv branding/celari-logo-400.png backup-before-fixes/branding-v1/branding/
git mv branding/celari-logo-new.png backup-before-fixes/branding-v1/branding/
git mv branding/twitter-banner.png backup-before-fixes/branding-v1/branding/
```

- [ ] **Step 3: Move old `logo/` assets**

```bash
git mv logo/celari_app_icon.png backup-before-fixes/branding-v1/logo/
git mv logo/celari_ext_icon_128.png backup-before-fixes/branding-v1/logo/
git mv logo/celari_favicon_64.png backup-before-fixes/branding-v1/logo/
git mv logo/celari_logo_dark.png backup-before-fixes/branding-v1/logo/
git mv logo/celari_logo_light.png backup-before-fixes/branding-v1/logo/
git mv logo/celari_logo_transparent.png backup-before-fixes/branding-v1/logo/
git mv logo/celari_mark.png backup-before-fixes/branding-v1/logo/
git mv logo/celari_source_icon.png backup-before-fixes/branding-v1/logo/
git mv logo/celari_source_logo.png backup-before-fixes/branding-v1/logo/
git mv logo/celari-export.html backup-before-fixes/branding-v1/logo/
git mv logo/celari-logo-generator.html backup-before-fixes/branding-v1/logo/
git mv logo/generate_variants.py backup-before-fixes/branding-v1/logo/
git mv logo/website-preview-full.png backup-before-fixes/branding-v1/logo/
git mv logo/website-preview-hero.png backup-before-fixes/branding-v1/logo/
```

- [ ] **Step 4: Update `.gitignore`**

Append to `.gitignore`:

```
# Generated brand tokens (rebuilt via npm run tokens)
ios/CelariWallet/CelariWallet/Resources/Generated/
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore backup-before-fixes/ branding/ logo/
git commit -m "chore(brand): archive v1 branding assets before rebrand"
```

---

## Task 2: Create `tokens.json` source of truth

**Files:**
- Create: `design-tokens/tokens.json`

- [ ] **Step 1: Create directory**

```bash
mkdir -p design-tokens/test
```

- [ ] **Step 2: Write `design-tokens/tokens.json`**

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "bg": {
      "base":     { "$dark": "#0A0A0B", "$light": "#F7F6F1" },
      "elevated": { "$dark": "#141416", "$light": "#FFFFFF" },
      "raised":   { "$dark": "#1C1C1F", "$light": "#ECEBE5" }
    },
    "border": {
      "subtle": { "$dark": "#26262A", "$light": "#E0DFD9" }
    },
    "gold": {
      "primary": { "$value": "#D4A853" },
      "soft":    { "$value": "#B8924A" },
      "glow":    { "$value": "#E8C878" },
      "deep":    { "$value": "#8A6F38" }
    },
    "text": {
      "primary":   { "$dark": "#FFFFFF", "$light": "#0A0A0B" },
      "secondary": { "$dark": "#A8A8B0", "$light": "#525258" },
      "muted":     { "$dark": "#6B6B73", "$light": "#8A8A92" }
    },
    "status": {
      "up":   { "$dark": "#34D399", "$light": "#059669" },
      "down": { "$dark": "#F87171", "$light": "#DC2626" }
    },
    "logo": {
      "mono-dark": { "$value": "#141416" }
    }
  },
  "radius": {
    "card":   { "$value": "16px" },
    "button": { "$value": "12px" },
    "chip":   { "$value": "8px" }
  },
  "motion": {
    "duration": {
      "fast": { "$value": "150ms" },
      "base": { "$value": "200ms" },
      "slow": { "$value": "300ms" }
    },
    "easing": {
      "standard": { "$value": "cubic-bezier(0.4, 0, 0.2, 1)" }
    }
  },
  "font": {
    "family": {
      "wordmark": { "$value": "Outfit, system-ui, sans-serif" },
      "body":     { "$value": "Inter, system-ui, sans-serif" }
    },
    "weight": {
      "thin":     { "$value": 100 },
      "light":    { "$value": 300 },
      "regular":  { "$value": 400 },
      "medium":   { "$value": 500 },
      "semibold": { "$value": 600 }
    }
  },
  "shadow": {
    "gold-glow-dark":  { "$value": "0 0 40px rgba(212, 168, 83, 0.12)" },
    "gold-glow-light": { "$value": "0 0 24px rgba(212, 168, 83, 0.18)" }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add design-tokens/tokens.json
git commit -m "feat(tokens): add Celari design tokens source of truth"
```

---

## Task 3: Implement CSS output (TDD)

**Files:**
- Create: `design-tokens/build.mjs`
- Create: `design-tokens/test/build.test.ts`

- [ ] **Step 1: Write the failing test**

Create `design-tokens/test/build.test.ts`:

```typescript
import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const WEBSITE_CSS = resolve(ROOT, "website/src/styles/tokens.css");
const EXTENSION_CSS = resolve(ROOT, "extension/public/styles/tokens.css");

describe("design-tokens/build.mjs — CSS output", () => {
  beforeAll(() => {
    execFileSync("node", ["design-tokens/build.mjs"], { cwd: ROOT, stdio: "inherit" });
  });

  test("writes website tokens.css", () => {
    expect(existsSync(WEBSITE_CSS)).toBe(true);
  });

  test("writes extension tokens.css", () => {
    expect(existsSync(EXTENSION_CSS)).toBe(true);
  });

  test("website css contains dark :root with bg-base and gold-primary", () => {
    const css = readFileSync(WEBSITE_CSS, "utf8");
    expect(css).toMatch(/:root\s*\{[\s\S]*--color-bg-base:\s*#0A0A0B/i);
    expect(css).toMatch(/--color-gold-primary:\s*#D4A853/i);
  });

  test("website css contains light theme override", () => {
    const css = readFileSync(WEBSITE_CSS, "utf8");
    expect(css).toMatch(/\[data-theme="light"\]\s*\{[\s\S]*--color-bg-base:\s*#F7F6F1/i);
  });

  test("website css contains radius, motion, font, shadow tokens", () => {
    const css = readFileSync(WEBSITE_CSS, "utf8");
    expect(css).toMatch(/--radius-card:\s*16px/);
    expect(css).toMatch(/--motion-duration-base:\s*200ms/);
    expect(css).toMatch(/--font-family-wordmark:\s*Outfit/);
    expect(css).toMatch(/--shadow-gold-glow-dark:/);
  });

  test("extension css has identical content to website css", () => {
    const a = readFileSync(WEBSITE_CSS, "utf8");
    const b = readFileSync(EXTENSION_CSS, "utf8");
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_NO_WARNINGS=1 npx jest design-tokens/test/build.test.ts`
Expected: FAIL with `ENOENT` or similar — `design-tokens/build.mjs` does not exist.

- [ ] **Step 3: Create `design-tokens/build.mjs` with CSS generator**

```javascript
#!/usr/bin/env node
/**
 * Reads design-tokens/tokens.json and emits per-platform outputs.
 *  - website/src/styles/tokens.css
 *  - extension/public/styles/tokens.css
 *  - ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift          (Task 4)
 *  - ios/CelariWallet/CelariWallet/Assets.xcassets/Colors/*.colorset/        (Task 5)
 *  - branding/exports/tokens-preview.html                                    (Task 6)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const TOKENS = JSON.parse(readFileSync(resolve(ROOT, "design-tokens/tokens.json"), "utf8"));

function* walk(obj, path = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !("$value" in v) && !("$dark" in v) && !("$light" in v)) {
      yield* walk(v, [...path, k]);
    } else {
      yield { path: [...path, k], leaf: v };
    }
  }
}
const kebab = (parts) => parts.join("-").replace(/_/g, "-");
const write = (p, content) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};

function buildCss() {
  const darkLines = [];
  const lightLines = [];
  const themeAgnostic = [];

  for (const group of Object.keys(TOKENS)) {
    if (group.startsWith("$")) continue;
    for (const { path, leaf } of walk(TOKENS[group])) {
      const name = `--${group}-${kebab(path)}`;
      if ("$dark" in leaf) {
        darkLines.push(`  ${name}: ${leaf.$dark};`);
        lightLines.push(`  ${name}: ${leaf.$light};`);
      } else if ("$value" in leaf) {
        themeAgnostic.push(`  ${name}: ${leaf.$value};`);
      }
    }
  }

  return [
    "/* Generated by design-tokens/build.mjs. Do not edit directly. */",
    ":root {",
    ...themeAgnostic,
    ...darkLines,
    "}",
    "",
    '[data-theme="light"] {',
    ...lightLines,
    "}",
    "",
  ].join("\n");
}

const css = buildCss();
write(resolve(ROOT, "website/src/styles/tokens.css"), css);
write(resolve(ROOT, "extension/public/styles/tokens.css"), css);

console.log("tokens: wrote CSS outputs");
```

- [ ] **Step 4: Run test to verify CSS tests pass**

Run: `NODE_NO_WARNINGS=1 npx jest design-tokens/test/build.test.ts`
Expected: 6 CSS tests pass.

- [ ] **Step 5: Sanity-check output**

Run: `head -30 website/src/styles/tokens.css`
Expected: a `:root { ... }` block with `--radius-card: 16px`, `--color-bg-base: #0A0A0B`, then `[data-theme="light"] { ... }` with `--color-bg-base: #F7F6F1`.

- [ ] **Step 6: Commit**

```bash
git add design-tokens/build.mjs design-tokens/test/build.test.ts \
        website/src/styles/tokens.css extension/public/styles/tokens.css
git commit -m "feat(tokens): CSS generator for website and extension"
```

---

## Task 4: Add Swift output to `build.mjs` (TDD)

**Files:**
- Modify: `design-tokens/build.mjs`
- Modify: `design-tokens/test/build.test.ts`
- Create: `ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift`

- [ ] **Step 1: Add failing Swift tests**

Append to `design-tokens/test/build.test.ts`:

```typescript
const IOS_SWIFT = resolve(ROOT, "ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift");

describe("design-tokens/build.mjs — Swift output", () => {
  test("writes Tokens.swift", () => {
    expect(existsSync(IOS_SWIFT)).toBe(true);
  });

  test("Tokens.swift exposes SwiftUI Color extensions for dark/light", () => {
    const swift = readFileSync(IOS_SWIFT, "utf8");
    expect(swift).toMatch(/import SwiftUI/);
    expect(swift).toMatch(/extension Color\s*\{/);
    expect(swift).toMatch(/static let celariBgBase\s*=\s*Color\(/);
    expect(swift).toMatch(
      /static let celariGoldPrimary\s*=\s*Color\(red:\s*0\.831,\s*green:\s*0\.659,\s*blue:\s*0\.325\)/,
    );
  });

  test("Tokens.swift defines radius + motion constants", () => {
    const swift = readFileSync(IOS_SWIFT, "utf8");
    expect(swift).toMatch(/enum CelariRadius\s*\{[\s\S]*static let card:\s*CGFloat\s*=\s*16/);
    expect(swift).toMatch(/enum CelariMotion\s*\{[\s\S]*static let base:\s*Double\s*=\s*0\.2/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_NO_WARNINGS=1 npx jest design-tokens/test/build.test.ts`
Expected: 3 Swift tests FAIL (file does not exist).

- [ ] **Step 3: Extend `build.mjs` with Swift generator**

Append before the final `console.log("tokens: wrote CSS outputs")` line (or, preferably, replace that line — the script will print multiple progress lines now). Add:

```javascript
function hexToRGB(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return { r: +r.toFixed(3), g: +g.toFixed(3), b: +b.toFixed(3) };
}
function camel(parts) {
  return parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("")
    .replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
}

function buildSwift() {
  const colorLines = [];
  for (const { path, leaf } of walk(TOKENS.color)) {
    const name = camel(["celari", ...path]);
    if ("$value" in leaf) {
      const { r, g, b } = hexToRGB(leaf.$value);
      colorLines.push(`  static let ${name} = Color(red: ${r}, green: ${g}, blue: ${b})`);
    } else if ("$dark" in leaf) {
      const d = hexToRGB(leaf.$dark);
      const l = hexToRGB(leaf.$light);
      colorLines.push(
        `  static let ${name} = Color(uiColor: UIColor { trait in`,
        `    trait.userInterfaceStyle == .dark`,
        `      ? UIColor(red: ${d.r}, green: ${d.g}, blue: ${d.b}, alpha: 1)`,
        `      : UIColor(red: ${l.r}, green: ${l.g}, blue: ${l.b}, alpha: 1)`,
        `  })`,
      );
    }
  }

  const radiusLines = Object.entries(TOKENS.radius).map(
    ([k, v]) => `  static let ${k}: CGFloat = ${parseFloat(v.$value)}`,
  );
  const motionLines = Object.entries(TOKENS.motion.duration).map(
    ([k, v]) => `  static let ${k}: Double = ${parseFloat(v.$value) / 1000}`,
  );

  return [
    "// Generated by design-tokens/build.mjs. Do not edit directly.",
    "import SwiftUI",
    "import UIKit",
    "",
    "extension Color {",
    ...colorLines,
    "}",
    "",
    "enum CelariRadius {",
    ...radiusLines,
    "}",
    "",
    "enum CelariMotion {",
    ...motionLines,
    "}",
    "",
  ].join("\n");
}

write(resolve(ROOT, "ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift"), buildSwift());
console.log("tokens: wrote Swift output");
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `NODE_NO_WARNINGS=1 npx jest design-tokens/test/build.test.ts`
Expected: 9 tests passing (6 CSS + 3 Swift).

- [ ] **Step 5: Sanity-check the Swift file**

Run: `head -30 ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift`
Expected: `import SwiftUI` header, `extension Color`, a mix of `Color(red:...)` (static gold) and `Color(uiColor: UIColor { trait in ... })` (dynamic theme colors), then `enum CelariRadius` and `enum CelariMotion`.

- [ ] **Step 6: Commit**

Note: `Resources/Generated/` is gitignored (Task 1 Step 4), so the `.swift` file is intentionally not tracked — CI rebuilds it via `npm run tokens`.

```bash
git add design-tokens/build.mjs design-tokens/test/build.test.ts
git commit -m "feat(tokens): Swift generator for iOS Color extensions"
```

---

## Task 5: Add Assets.xcassets color set output (TDD)

**Files:**
- Modify: `design-tokens/build.mjs`
- Modify: `design-tokens/test/build.test.ts`
- Create: `ios/CelariWallet/CelariWallet/Assets.xcassets/Colors/Contents.json`
- Create: `ios/CelariWallet/CelariWallet/Assets.xcassets/Colors/<Name>.colorset/Contents.json` (one per color token)

- [ ] **Step 1: Add failing color set tests**

Append to `design-tokens/test/build.test.ts`:

```typescript
const COLORS_DIR = resolve(ROOT, "ios/CelariWallet/CelariWallet/Assets.xcassets/Colors");

describe("design-tokens/build.mjs — xcassets output", () => {
  test("Colors/ has a Contents.json group manifest", () => {
    const manifest = JSON.parse(readFileSync(resolve(COLORS_DIR, "Contents.json"), "utf8"));
    expect(manifest.info.author).toBe("xcode");
    expect(manifest.properties?.["provides-namespace"]).toBe(true);
  });

  test("BgBase.colorset has universal + dark appearances", () => {
    const p = resolve(COLORS_DIR, "BgBase.colorset/Contents.json");
    const cs = JSON.parse(readFileSync(p, "utf8"));
    expect(cs.colors).toHaveLength(2);
    const hasDark = cs.colors.some(
      (c: any) => c.appearances?.[0]?.appearance === "luminosity" && c.appearances?.[0]?.value === "dark",
    );
    expect(hasDark).toBe(true);
  });

  test("GoldPrimary.colorset is theme-agnostic (single color entry)", () => {
    const p = resolve(COLORS_DIR, "GoldPrimary.colorset/Contents.json");
    const cs = JSON.parse(readFileSync(p, "utf8"));
    expect(cs.colors).toHaveLength(1);
    expect(cs.colors[0].color.components.red).toMatch(/^0\.8[0-9]+$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_NO_WARNINGS=1 npx jest design-tokens/test/build.test.ts`
Expected: 3 xcassets tests FAIL.

- [ ] **Step 3: Extend `build.mjs` with xcassets generator**

Append before `console.log("tokens: wrote Swift output")` or after (order doesn't matter). Add:

```javascript
function xcassetsColor(rgb) {
  return {
    "color-space": "srgb",
    components: {
      red:   rgb.r.toFixed(3),
      green: rgb.g.toFixed(3),
      blue:  rgb.b.toFixed(3),
      alpha: "1.000",
    },
  };
}
function pascal(parts) {
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("")
    .replace(/[-_]([a-zA-Z])/g, (_, c) => c.toUpperCase());
}

function writeColorset(dir, tokenPath, leaf) {
  const name = pascal(tokenPath);
  const entryDir = resolve(dir, `${name}.colorset`);
  let colors;
  if ("$value" in leaf) {
    colors = [{ idiom: "universal", color: xcassetsColor(hexToRGB(leaf.$value)) }];
  } else {
    colors = [
      { idiom: "universal", color: xcassetsColor(hexToRGB(leaf.$light)) },
      {
        idiom: "universal",
        appearances: [{ appearance: "luminosity", value: "dark" }],
        color: xcassetsColor(hexToRGB(leaf.$dark)),
      },
    ];
  }
  write(
    resolve(entryDir, "Contents.json"),
    JSON.stringify({ colors, info: { author: "xcode", version: 1 } }, null, 2),
  );
}

const xcassetsColorsDir = resolve(
  ROOT,
  "ios/CelariWallet/CelariWallet/Assets.xcassets/Colors",
);

write(
  resolve(xcassetsColorsDir, "Contents.json"),
  JSON.stringify(
    { info: { author: "xcode", version: 1 }, properties: { "provides-namespace": true } },
    null,
    2,
  ),
);

for (const { path, leaf } of walk(TOKENS.color)) {
  writeColorset(xcassetsColorsDir, path, leaf);
}

console.log("tokens: wrote xcassets output");
```

- [ ] **Step 4: Run tests**

Run: `NODE_NO_WARNINGS=1 npx jest design-tokens/test/build.test.ts`
Expected: 12 tests passing.

- [ ] **Step 5: Commit**

```bash
git add design-tokens/build.mjs design-tokens/test/build.test.ts \
        ios/CelariWallet/CelariWallet/Assets.xcassets/Colors/
git commit -m "feat(tokens): Assets.xcassets color set generator"
```

---

## Task 6: Add tokens-preview.html output (TDD)

**Files:**
- Modify: `design-tokens/build.mjs`
- Modify: `design-tokens/test/build.test.ts`
- Create: `branding/exports/tokens-preview.html`

- [ ] **Step 1: Add failing preview test**

Append to `design-tokens/test/build.test.ts`:

```typescript
const PREVIEW = resolve(ROOT, "branding/exports/tokens-preview.html");

describe("design-tokens/build.mjs — preview output", () => {
  test("writes tokens-preview.html with swatches and type specimen", () => {
    const html = readFileSync(PREVIEW, "utf8");
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toMatch(/bg-base/);
    expect(html).toMatch(/gold-primary/);
    expect(html).toMatch(/Outfit/);
    expect(html).toMatch(/Inter/);
    expect(html).toMatch(/class="theme-dark"/);
    expect(html).toMatch(/class="theme-light"/);
  });
});
```

- [ ] **Step 2: Run test — fails**

Run: `NODE_NO_WARNINGS=1 npx jest design-tokens/test/build.test.ts`
Expected: 1 preview test FAIL.

- [ ] **Step 3: Extend `build.mjs` with preview generator**

Append to `build.mjs`:

```javascript
function swatch(name, hex) {
  return `<div class="swatch"><div class="chip" style="background:${hex}"></div><code>${name}</code><code>${hex}</code></div>`;
}
function buildPreview() {
  const darkSwatches = [];
  const lightSwatches = [];
  for (const { path, leaf } of walk(TOKENS.color)) {
    const name = ["color", ...path].join("-");
    if ("$value" in leaf) {
      darkSwatches.push(swatch(name, leaf.$value));
      lightSwatches.push(swatch(name, leaf.$value));
    } else {
      darkSwatches.push(swatch(name, leaf.$dark));
      lightSwatches.push(swatch(name, leaf.$light));
    }
  }
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Celari Tokens Preview</title>
<style>
  body { margin: 0; font-family: Inter, system-ui, sans-serif; }
  .theme-dark  { background: #0A0A0B; color: #fff; padding: 32px; }
  .theme-light { background: #F7F6F1; color: #0A0A0B; padding: 32px; }
  .swatch { display: inline-flex; align-items: center; gap: 8px; margin: 6px 12px 6px 0; }
  .chip { width: 28px; height: 28px; border-radius: 6px; border: 1px solid rgba(127,127,127,0.25); }
  code { font-size: 11px; font-family: ui-monospace, monospace; }
  h1 { font-family: Outfit, sans-serif; font-weight: 300; letter-spacing: 0.3em; margin: 0 0 16px; }
</style></head>
<body>
  <div class="theme-dark">
    <h1>CELARI — Dark</h1>
    ${darkSwatches.join("")}
  </div>
  <div class="theme-light">
    <h1>CELARI — Light</h1>
    ${lightSwatches.join("")}
  </div>
</body>
</html>`;
}

write(resolve(ROOT, "branding/exports/tokens-preview.html"), buildPreview());
console.log("tokens: wrote preview");
```

- [ ] **Step 4: Run tests — all pass**

Run: `NODE_NO_WARNINGS=1 npx jest design-tokens/test/build.test.ts`
Expected: 13 tests passing.

- [ ] **Step 5: Commit**

```bash
git add design-tokens/build.mjs design-tokens/test/build.test.ts branding/exports/tokens-preview.html
git commit -m "feat(tokens): preview HTML with palette swatches and type specimen"
```

---

## Task 7: Add root npm scripts + token README

**Files:**
- Modify: `package.json`
- Create: `design-tokens/README.md`

- [ ] **Step 1: Add scripts to `package.json`**

Open `package.json`, inside `"scripts"` (preserve all existing entries), add:

```json
"tokens": "node design-tokens/build.mjs",
"brand:export": "npm run tokens && node branding/scripts/generate-logo-variants.mjs && node branding/scripts/generate-favicon.mjs && node branding/scripts/generate-extension-icons.mjs && node branding/scripts/generate-og.mjs && node branding/scripts/copy-to-extension.mjs"
```

- [ ] **Step 2: Write `design-tokens/README.md`**

```markdown
# Celari Design Tokens

Single source of truth for Celari colors, radius, motion, typography, and shadows.

## Edit

1. Change values in `tokens.json` (W3C DTCG format).
2. From repo root, run `npm run tokens`.
3. Commit `tokens.json`. Per-platform outputs regenerate on demand.

## Outputs (auto-generated)

| Path | Consumer |
|---|---|
| `website/src/styles/tokens.css` | Next.js website, imported by `globals.css` |
| `extension/public/styles/tokens.css` | Chrome extension popup + sidepanel |
| `ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift` | SwiftUI Color + constants (gitignored — built in CI) |
| `ios/CelariWallet/CelariWallet/Assets.xcassets/Colors/` | SwiftUI `Color("…")` Asset Catalog lookups |
| `branding/exports/tokens-preview.html` | Visual swatch grid |

## Token naming conventions

- `{group}/{…sub}/{leaf}` → kebab in CSS (`--color-bg-base`), camel in Swift (`celariBgBase`), pascal in xcassets (`BgBase.colorset`).
- `$dark` + `$light` for dual-theme. `$value` for theme-agnostic (e.g., gold tones).
```

- [ ] **Step 3: Verify `npm run tokens`**

Run: `npm run tokens`
Expected output contains:
```
tokens: wrote CSS outputs
tokens: wrote Swift output
tokens: wrote xcassets output
tokens: wrote preview
```

- [ ] **Step 4: Re-run tests**

Run: `NODE_NO_WARNINGS=1 npx jest design-tokens/test/build.test.ts`
Expected: 13 passing.

- [ ] **Step 5: Commit**

```bash
git add package.json design-tokens/README.md
git commit -m "feat(tokens): add npm run tokens + brand:export scripts"
```

---

## Task 8: Initialize Pencil master document

**Files:**
- Create: `branding/celari-brand-system.pen`

Pencil work uses the `mcp__pencil__*` tools. Pencil desktop must be running with the MCP bridge connected (Settings → MCP).

- [ ] **Step 1: Confirm Pencil MCP is reachable**

Invoke: `mcp__pencil__get_editor_state({ include_schema: true })`
Expected: a JSON response describing the active editor (if any). If the tool returns a WebSocket error, open Pencil, enable MCP, and open a blank document before retrying.

- [ ] **Step 2: List available guidelines**

Invoke: `mcp__pencil__get_guidelines({})`
Read the returned list and note the `guide` names that cover mobile UI, web UI, iconography, and color palettes. Load each guide you intend to use with `mcp__pencil__get_guidelines({ category: "guide", name: "<name>" })` and review before designing.

- [ ] **Step 3: Open a new document**

Invoke: `mcp__pencil__open_document({ filePathOrTemplate: "new" })`
In Pencil's UI, save the new file as `branding/celari-brand-system.pen` via File → Save.

Verify file exists:
```bash
ls -la branding/celari-brand-system.pen
```

- [ ] **Step 4: Create 4 top-level page frames**

Invoke `mcp__pencil__batch_design` once with the following operations string. These create the four container pages shown in the spec.

```
p1=I(document,{type:"frame",name:"01 Brand System",layout:"vertical",x:0,y:0,width:1600,height:2400,fill:{color:"#0A0A0B"}})
p2=I(document,{type:"frame",name:"02 iOS Screens",layout:"horizontal",x:1700,y:0,width:3200,height:2000,fill:{color:"#0A0A0B"}})
p3=I(document,{type:"frame",name:"03 Website",layout:"vertical",x:0,y:2500,width:1600,height:3200,fill:{color:"#0A0A0B"}})
p4=I(document,{type:"frame",name:"04 Extension",layout:"horizontal",x:1700,y:2100,width:2600,height:2000,fill:{color:"#0A0A0B"}})
```

(The `I(document, ...)` form inserts children into the document root.)

- [ ] **Step 5: Verify the 4 frames exist**

Invoke: `mcp__pencil__batch_get({ filePath: "branding/celari-brand-system.pen", patterns: [{ type: "frame" }], readDepth: 1 })`
Expected: 4 frames with names `01 Brand System`, `02 iOS Screens`, `03 Website`, `04 Extension`. Record the returned `id` values — you'll use them as parent references in Tasks 9–12. Replace the `p1`, `p2`, etc. bindings in later operations with the actual node IDs the tool returns (bindings do not persist across calls).

- [ ] **Step 6: Commit**

```bash
git add branding/celari-brand-system.pen
git commit -m "chore(brand): initialize Pencil master document (4 pages)"
```

---

## Task 9: Draw Page 1 — Brand System Foundation

**Files:**
- Modify: `branding/celari-brand-system.pen` (inside the `01 Brand System` frame)

Populates the Brand System page with: logo lockup, variants grid, dark + light palette swatches, typography specimen, feature/action/tab-bar icons. Each sub-step is one `batch_design` call (≤25 ops), broken up by section. Replace `<p1>` with the actual node ID from Task 8 Step 5 in every operation.

- [ ] **Step 1: Draw logo lockup hero**

Invoke `mcp__pencil__batch_design` with:

```
m=I(<p1>,{type:"frame",name:"Lockup Hero",layout:"vertical",x:400,y:60,width:800,height:520,fill:{color:"transparent"}})
mark=I(m,{type:"frame",name:"Mark",width:360,height:360,x:220,y:0})
cArc=I(mark,{type:"path",name:"C-arc",geometry:"M100,60 A130,130 0 1,0 100,300 L130,260 A100,100 0 1,1 130,100 Z",fill:{type:"linearGradient",stops:[{offset:0,color:"#E8C878"},{offset:1,color:"#B8924A"}]}})
leaf=I(mark,{type:"path",name:"Leaf",geometry:"M200,160 Q260,140 280,200 Q260,260 200,240 Z",fill:{type:"linearGradient",stops:[{offset:0,color:"#E8C878"},{offset:1,color:"#B8924A"}]}})
w=I(m,{type:"text",name:"Wordmark",content:"CELARI",x:150,y:380,width:500,fontFamily:"Outfit",fontWeight:300,fontSize:72,letterSpacing:0.3,color:"#FFFFFF",textAlign:"center"})
tg=I(m,{type:"text",name:"Tagline",content:"PRIVACY FIRST WALLET",x:150,y:470,width:500,fontFamily:"Outfit",fontWeight:300,fontSize:16,letterSpacing:0.35,color:"#D4A853",textAlign:"center"})
```

**Iteration note:** the SVG path geometry is an approximation. Export the page to PNG in Pencil's UI and compare with reference image 1. If the C or leaf shape needs adjustment, issue a corrective `batch_design` with `U(<markId>/<nodeId>, { geometry: "..." })` or `R(<path>, { ... })` — target ≥95% visual fidelity.

- [ ] **Step 2: Draw variants grid**

Below the lockup (y ≈ 640) draw a horizontal row with 5 cells: Symbol / Wordmark / Lockup / App Icon Dark / App Icon Light. Each cell is a 160×220 frame containing the scaled-down variant + caption (Inter 12, color `#6B6B73`).

For the App Icon Dark cell: a 160×160 rounded-rect frame (border-radius 36) filled `#0A0A0B`, with a copy of the logo mark centered inside. For the App Icon Light cell: same rect filled `#F7F6F1`, mark recolored to `#141416` (use a `C` copy operation and then `U(newNode/cArc, { fill: { color: "#141416" } })` to recolor).

Use 1–2 `batch_design` calls. Cap at 25 ops per call.

- [ ] **Step 3: Draw color swatch grid — dark palette row**

At y ≈ 900 draw a horizontal row of color cells. For each color token in `tokens.json` (walk all leaves under `color.*`), insert a cell:

```
cell<n>=I(<p1>,{type:"frame",name:"swatch-<group>-<path>",layout:"vertical",x:<x>,y:900,width:96,height:120,fill:{color:"transparent"}})
chip<n>=I(cell<n>,{type:"rectangle",x:0,y:0,width:96,height:80,fill:{color:"<dark or $value>"},cornerRadius:8})
lbl<n>=I(cell<n>,{type:"text",content:"<group>-<path>",x:0,y:86,width:96,fontFamily:"Inter",fontWeight:500,fontSize:10,color:"#FFFFFF",textAlign:"center"})
hex<n>=I(cell<n>,{type:"text",content:"<hex>",x:0,y:102,width:96,fontFamily:"ui-monospace",fontSize:10,color:"#A8A8B0",textAlign:"center"})
```

With ~14 tokens, this fits in one batch (4 ops per cell = ~56 ops — split across 3 batch calls).

- [ ] **Step 4: Draw color swatch grid — light palette row**

At y ≈ 1100 repeat Step 3 using each token's `$light` (or `$value` when shared). For light swatches, label color = `#0A0A0B`, hex color = `#525258`.

- [ ] **Step 5: Draw typography specimen**

At y ≈ 1300 insert text specimens (one `batch_design` call):

```
t1=I(<p1>,{type:"text",content:"CELARI",x:80,y:1320,fontFamily:"Outfit",fontWeight:300,fontSize:96,letterSpacing:0.3,color:"#FFFFFF"})
c1=I(<p1>,{type:"text",content:"Wordmark — Outfit Light, 0.3em tracking",x:80,y:1420,fontFamily:"Inter",fontSize:12,color:"#6B6B73"})
t2=I(<p1>,{type:"text",content:"Your crypto. Your privacy.",x:80,y:1460,fontFamily:"Inter",fontWeight:600,fontSize:48,color:"#FFFFFF"})
c2=I(<p1>,{type:"text",content:"H1 — Inter SemiBold 48",x:80,y:1520,fontFamily:"Inter",fontSize:12,color:"#6B6B73"})
t3=I(<p1>,{type:"text",content:"Celari Wallet is built from the ground up to protect your identity and your assets.",x:80,y:1560,width:1000,fontFamily:"Inter",fontWeight:400,fontSize:18,color:"#A8A8B0"})
c3=I(<p1>,{type:"text",content:"Body — Inter Regular 18",x:80,y:1620,fontFamily:"Inter",fontSize:12,color:"#6B6B73"})
```

- [ ] **Step 6: Draw feature icons row**

At y ≈ 1700 draw 4 icons at 48×48 with stroke `#D4A853` stroke-width 1.5. Each icon is a group of `path` nodes:

- `feat-shield-lock` — shield outline + keyhole circle with a small rectangle.
- `feat-fingerprint` — concentric arcs approximating a fingerprint.
- `feat-eye-off` — eye shape + diagonal slash line.
- `feat-zero-trace` — a single circle (O).

Below each icon a caption (Inter 12, color `#A8A8B0`): `SELF-CUSTODY`, `PASSKEY LOGIN`, `NO TRACKING`, `ZERO TRACE`.

Use 1 `batch_design` call per icon (5–10 ops each) — total 4 calls for this step.

- [ ] **Step 7: Draw quick action + tab-bar icon rows**

At y ≈ 1900 draw 4 quick-action icons (send ↑, receive ↓, swap ⇄, buy +) at 24×24, stroke `#D4A853` stroke-width 1.5. At y ≈ 2100 draw 5 tab-bar icons (home, assets, activity, discover, settings). Each row uses 1–2 `batch_design` calls.

- [ ] **Step 8: Visual QA**

Export the frame as PNG from Pencil's UI and overlay visually against reference image 1. List any drifts and correct them with additional `batch_design` calls using `U()` / `R()`.

- [ ] **Step 9: Commit**

```bash
git add branding/celari-brand-system.pen
git commit -m "feat(brand): Pencil Page 1 — brand system foundation"
```

---

## Task 10: Draw Page 2 — iOS Screens

**Files:**
- Modify: `branding/celari-brand-system.pen` (inside `02 iOS Screens`)

Create 7 iPhone-sized frames (390×844) side by side, each one labeled.

- [ ] **Step 1: Create 7 empty phone frames**

One `batch_design` call inside `<p2>`:

```
f1=I(<p2>,{type:"frame",name:"Onboarding",x:0,y:60,width:390,height:844,cornerRadius:48,fill:{color:"#0A0A0B"}})
l1=I(<p2>,{type:"text",content:"Onboarding",x:0,y:24,width:390,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
f2=I(<p2>,{type:"frame",name:"Home",x:450,y:60,width:390,height:844,cornerRadius:48,fill:{color:"#0A0A0B"}})
l2=I(<p2>,{type:"text",content:"Home",x:450,y:24,width:390,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
f3=I(<p2>,{type:"frame",name:"Send",x:900,y:60,width:390,height:844,cornerRadius:48,fill:{color:"#0A0A0B"}})
l3=I(<p2>,{type:"text",content:"Send",x:900,y:24,width:390,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
f4=I(<p2>,{type:"frame",name:"Receive",x:1350,y:60,width:390,height:844,cornerRadius:48,fill:{color:"#0A0A0B"}})
l4=I(<p2>,{type:"text",content:"Receive",x:1350,y:24,width:390,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
f5=I(<p2>,{type:"frame",name:"Swap Placeholder",x:1800,y:60,width:390,height:844,cornerRadius:48,fill:{color:"#0A0A0B"}})
l5=I(<p2>,{type:"text",content:"Swap Placeholder",x:1800,y:24,width:390,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
f6=I(<p2>,{type:"frame",name:"Settings",x:2250,y:60,width:390,height:844,cornerRadius:48,fill:{color:"#0A0A0B"}})
l6=I(<p2>,{type:"text",content:"Settings",x:2250,y:24,width:390,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
f7=I(<p2>,{type:"frame",name:"Tab Bar Detail",x:2700,y:60,width:390,height:844,cornerRadius:48,fill:{color:"#0A0A0B"}})
l7=I(<p2>,{type:"text",content:"Tab Bar Detail",x:2700,y:24,width:390,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
```

After this call, inspect the returned node IDs for `f1`–`f7` and record them — they're the parents for the next sub-steps.

- [ ] **Step 2: Populate `Onboarding` (f1)**

Top: logo lockup (copy from Page 1 `Lockup Hero` using `C(<lockupId>, <f1>, { x: 55, y: 180, width: 280, height: 180 })`). Middle: hero headline:

```
h=I(<f1>,{type:"text",content:"Your crypto.\nYour privacy.\nAlways.",x:40,y:400,width:310,fontFamily:"Inter",fontWeight:600,fontSize:32,lineHeight:1.1,color:"#FFFFFF",textAlign:"center"})
```

Three feature rows (at y ≈ 540, 590, 640), each: small gold feature icon + single line of copy (Inter 14, `#A8A8B0`).

Bottom CTA: gold PrimaryButton at y ≈ 740:

```
btn=I(<f1>,{type:"frame",name:"PrimaryButton",x:24,y:740,width:342,height:52,cornerRadius:12,fill:{type:"linearGradient",stops:[{offset:0,color:"#E8C878"},{offset:1,color:"#B8924A"}]}})
btnT=I(btn,{type:"text",content:"Get Started",x:0,y:16,width:342,fontFamily:"Inter",fontWeight:500,fontSize:16,color:"#0A0A0B",textAlign:"center"})
```

- [ ] **Step 3: Populate `Home` (f2)**

Replicate reference image 2 (iPhone 1 of 3). Draw in 2–3 batches (status bar + header; balance + quick actions; accounts + assets + tab bar). Key nodes:

- Status bar: time "9:41" left, status icons right, height 44.
- Header at y ≈ 54: mini Celari lockup centered, `scan` icon top-right.
- "Total Balance" + eye-off icon at y ≈ 130 (Inter 14 `#A8A8B0`).
- `$12,458.73` text at y ≈ 160 (Inter SemiBold 36 `#FFFFFF`).
- Pill at y ≈ 210: `▲ 2.35% Today` — green arrow icon + text `#34D399` + ` Today` `#A8A8B0`.
- Quick actions row at y ≈ 260 (four 64×64 rounded squares with icons: Send ↑, Receive ↓, Swap ⇄, Buy +, stroke gold, fill `#141416`, each with caption below).
- `Accounts` card header + `+` icon at y ≈ 360. Two rows below: `Main Wallet — $8,732.21 — 6 Assets` and `Savings — $3,726.52 — 3 Assets`. Use the CelariLogoView mini-mark on the left of each row.
- `Assets` card header at y ≈ 520. Rows for Ethereum / Bitcoin / Solana: colored token icon + name + ticker + right-aligned amount + $ + ±% (green/red).
- `View all assets` text link (Inter 14 `#D4A853`, with chevron).
- Bottom tab bar (y ≈ 780): 5 icons + labels, Home active with gold underline and icon, others `#6B6B73`.

- [ ] **Step 4: Populate `Send` (f3)**

Match reference image 2 (iPhone 2 of 3). Break into batches: header, You send, To, Network, Estimated fee, Summary, CTA.

- Header: back arrow (left), title "Send" (center), spacer (right).
- `You send` card (`#141416` fill, 16 radius, 24 padding): label, amount text `1.25` big (Inter SemiBold 40), token pill right `ETH ▼`, sub-line `$3,583.42` Inter 14 `#A8A8B0`.
- `To` card: label + input placeholder `Address, ENS or .celari` + scan icon; recents row with 3 letter avatars + "Add new" circular button.
- `Network` card: Ethereum logo + name + `Balance: 2.738 ETH` + chevron.
- `Estimated fee` card: `$1.42` + `0.000492 ETH` below, right chevron.
- Summary card: rows for `You send / Estimated fee / Total`.
- `Review Transaction` PrimaryButton bottom.

- [ ] **Step 5: Populate `Receive` (f4)**

Match reference image 2 (iPhone 3 of 3):

- Header: back arrow + "Receive" center.
- Card with header `Receive with` + Celari lockup (small).
- QR placeholder: 280×280 rounded rect, filled `#FFFFFF`. Inside, draw a 21×21 grid of 12×12 rectangles — alternating `#000000` / `#FFFFFF` randomly or in a fixed pattern. At the center, the gold Celari mark (~60px) over a white square.
- Gold `Share address` outline button.
- Card `Your Celari ID` with `@user.celari` text + copy icon.
- Info line: `Others can send you crypto using your Celari ID or scan the QR code.` (Inter 12, `#6B6B73`).
- Section header `Receive crypto`.
- Two rows: `From another wallet — Share your address` and `From exchange — Transfer from exchange` (icon + title + subtitle + chevron).

- [ ] **Step 6: Populate `Swap Placeholder` (f5)**

- Header: back + "Swap".
- Center content at y ≈ 330: 80×80 gold circle (hollow, 2px stroke) containing a Swap ⇄ icon.
- Heading at y ≈ 440 (Inter SemiBold 24 `#FFFFFF` centered): `Swap is coming soon`.
- Body at y ≈ 480 (Inter 16 `#A8A8B0` centered, width 300): `Trade assets privately, without giving up control.`
- Optional outline button at y ≈ 600: `Notify me` (Inter 16 `#D4A853`, 1.5px gold border, 12 radius).

This is the template for `Discover Placeholder` and `Buy Placeholder` too — document that in a `note` node inside the frame.

- [ ] **Step 7: Populate `Settings` (f6)**

Sections:
- Profile header (y ≈ 80): Celari mark avatar + `@user.celari` + email line.
- `Appearance` section: 3-option segmented picker `System / Dark / Light`. Segmented track `#1C1C1F`, active pill `#D4A853` text `#0A0A0B`.
- `Security` section: Face ID toggle, Change passcode row, Guardian setup row.
- `Network` section: current network row, Manage networks row.
- `About` section: Version row, Terms, Privacy.
- Each section header Inter SemiBold 14 `#A8A8B0`, uppercase.

- [ ] **Step 8: Populate `Tab Bar Detail` (f7)**

Scaled-up tab bar: 5 icons evenly spaced with labels (Inter Medium 10). Show the active state for Home (gold icon + 2px gold underline) and inactive for the others (color `#6B6B73`).

- [ ] **Step 9: Visual QA + commit**

Export Page 2 as PNG, compare to reference image 2. Adjust with corrective `batch_design` calls as needed.

```bash
git add branding/celari-brand-system.pen
git commit -m "feat(brand): Pencil Page 2 — iOS screen mockups"
```

---

## Task 11: Draw Page 3 — Website

**Files:**
- Modify: `branding/celari-brand-system.pen` (inside `03 Website`)

Single 1440-wide vertical canvas, sections stacked top-to-bottom.

- [ ] **Step 1: Draw header (y 0–80)**

One `batch_design` call inside `<p3>`:

```
hdr=I(<p3>,{type:"frame",name:"Header",x:0,y:0,width:1440,height:80,fill:{color:"transparent"}})
logo=C(<lockupMiniId>,hdr,{x:80,y:24,width:140,height:32})
nav=I(hdr,{type:"frame",name:"Nav",layout:"horizontal",gap:40,x:500,y:30,width:500,height:20,fill:{color:"transparent"}})
n1=I(nav,{type:"text",content:"Features",fontFamily:"Inter",fontSize:14,color:"#A8A8B0"})
n2=I(nav,{type:"text",content:"Security",fontFamily:"Inter",fontSize:14,color:"#A8A8B0"})
n3=I(nav,{type:"text",content:"How It Works",fontFamily:"Inter",fontSize:14,color:"#A8A8B0"})
n4=I(nav,{type:"text",content:"Roadmap",fontFamily:"Inter",fontSize:14,color:"#A8A8B0"})
n5=I(nav,{type:"text",content:"Docs",fontFamily:"Inter",fontSize:14,color:"#A8A8B0"})
dl=I(hdr,{type:"frame",name:"DownloadBtn",x:1220,y:20,width:140,height:40,cornerRadius:20,fill:{type:"linearGradient",stops:[{offset:0,color:"#E8C878"},{offset:1,color:"#B8924A"}]}})
dlT=I(dl,{type:"text",content:"Download ↗",x:0,y:11,width:140,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#0A0A0B",textAlign:"center"})
```

Use the actual `lockupMiniId` returned from an earlier copy or a fresh mini-variant created with the mark + wordmark at header scale.

- [ ] **Step 2: Draw hero (y 80–720)**

Left column content (x ≈ 80, width ≈ 640):

```
h1A=I(<p3>,{type:"text",content:"Your crypto.",x:80,y:180,fontFamily:"Inter",fontWeight:600,fontSize:72,color:"#FFFFFF"})
h1B=I(<p3>,{type:"text",content:"Your privacy.",x:80,y:260,fontFamily:"Inter",fontWeight:600,fontSize:72,fill:{type:"linearGradient",stops:[{offset:0,color:"#E8C878"},{offset:1,color:"#B8924A"}]}})
h1C=I(<p3>,{type:"text",content:"Always.",x:80,y:340,fontFamily:"Inter",fontWeight:600,fontSize:72,color:"#FFFFFF"})
sub=I(<p3>,{type:"text",content:"Celari Wallet is a privacy-first, non-custodial wallet built for the new internet.",x:80,y:430,width:560,fontFamily:"Inter",fontSize:18,lineHeight:1.5,color:"#A8A8B0"})
cta1=I(<p3>,{type:"frame",name:"DownloadIOS",x:80,y:520,width:210,height:52,cornerRadius:12,fill:{type:"linearGradient",stops:[{offset:0,color:"#E8C878"},{offset:1,color:"#B8924A"}]}})
cta1T=I(cta1,{type:"text",content:"Download for iOS",x:0,y:16,width:210,fontFamily:"Inter",fontWeight:500,fontSize:16,color:"#0A0A0B",textAlign:"center"})
cta2=I(<p3>,{type:"frame",name:"DownloadAndroid",x:308,y:520,width:230,height:52,cornerRadius:12,fill:{color:"transparent"},stroke:{color:"#D4A853",width:1.5}})
cta2T=I(cta2,{type:"text",content:"Download for Android",x:0,y:16,width:230,fontFamily:"Inter",fontWeight:500,fontSize:16,color:"#D4A853",textAlign:"center"})
badge=I(<p3>,{type:"text",content:"🛡  Privacy by design. Built on zero-knowledge principles.",x:80,y:620,fontFamily:"Inter",fontSize:14,color:"#D4A853"})
```

Right column: iPhone mockup — `C(<f2>, <p3>, { x: 760, y: 120, width: 400, height: 820 })` to clone the Home frame from Page 2 and scale. Surround it with 3 concentric gold ellipse rings (stroke 1, opacity 0.15), centered at the phone center, radii 300/420/540.

- [ ] **Step 3: Draw features strip (y 720–920)**

Dark card spanning x 80 to x 1360. Four equal columns with vertical hairline dividers.

Each column: outline icon (reused from Page 1) + title (Inter SemiBold 18 `#FFFFFF`) + 2-line body (Inter 14 `#A8A8B0`). Titles: `Self-Custody / Passkey Login / No Tracking / Zero Trace`.

- [ ] **Step 4: Draw privacy section (y 960–1480)**

Left column (x 80, width 520): eyebrow `PRIVACY FIRST` (Outfit Light 14, letterSpacing 0.3em, `#D4A853`), H2 `Built for a private\nfinancial future.` (Inter SemiBold 56 `#FFFFFF`), body paragraph (Inter 16 `#A8A8B0`).

Right column: phone orbit illustration — clone a scaled Home frame centered, surrounded by 4 floating circular icons at cardinal positions (fingerprint, key, eye-off, leaf). Each floating icon is a 72×72 circle with `#141416` fill and gold icon inside. Add faint radial gold rings behind.

- [ ] **Step 5: Draw footer (y 1500–1800)**

Minimal: left column logo + tagline; three columns `Product / Company / Legal` each with 3–4 link-style text nodes; social icons row; `© 2026 Celari` at the bottom.

- [ ] **Step 6: Visual QA + commit**

Export Page 3 as PNG, compare to reference image 3. Adjust. Commit:

```bash
git add branding/celari-brand-system.pen
git commit -m "feat(brand): Pencil Page 3 — website landing mockup"
```

---

## Task 12: Draw Page 4 — Extension

**Files:**
- Modify: `branding/celari-brand-system.pen` (inside `04 Extension`)

5 frames side-by-side inside `<p4>`: `Popup Unlocked` (360×600), `Popup Locked` (360×600), `Onboarding` (360×600), `Sidepanel` (400×700), `Settings Modal` (360×500).

- [ ] **Step 1: Create the 5 empty frames + labels**

```
pe1=I(<p4>,{type:"frame",name:"Popup Unlocked",x:0,y:60,width:360,height:600,cornerRadius:16,fill:{color:"#0A0A0B"}})
pl1=I(<p4>,{type:"text",content:"Popup Unlocked",x:0,y:24,width:360,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
pe2=I(<p4>,{type:"frame",name:"Popup Locked",x:420,y:60,width:360,height:600,cornerRadius:16,fill:{color:"#0A0A0B"}})
pl2=I(<p4>,{type:"text",content:"Popup Locked",x:420,y:24,width:360,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
pe3=I(<p4>,{type:"frame",name:"Onboarding",x:840,y:60,width:360,height:600,cornerRadius:16,fill:{color:"#0A0A0B"}})
pl3=I(<p4>,{type:"text",content:"Onboarding",x:840,y:24,width:360,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
pe4=I(<p4>,{type:"frame",name:"Sidepanel",x:1260,y:60,width:400,height:700,cornerRadius:16,fill:{color:"#0A0A0B"}})
pl4=I(<p4>,{type:"text",content:"Sidepanel",x:1260,y:24,width:400,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
pe5=I(<p4>,{type:"frame",name:"Settings Modal",x:1720,y:60,width:360,height:500,cornerRadius:16,fill:{color:"#141416"}})
pl5=I(<p4>,{type:"text",content:"Settings Modal",x:1720,y:24,width:360,fontFamily:"Inter",fontWeight:500,fontSize:14,color:"#A8A8B0",textAlign:"center"})
```

- [ ] **Step 2: Populate `Popup Unlocked` (pe1)**

Compressed iOS Home:
- Header: mini lockup + settings icon.
- `$12,458.73` (Inter 28 `#FFFFFF`), `▲ 2.35%` pill smaller.
- Row of 4 quick-action circles.
- Top 3 asset rows compact.
- `View all` link.
- Footer bar: `Locked/Unlocked` chip + Face ID icon + connection dot.

- [ ] **Step 3: Populate `Popup Locked` (pe2)**

Centered Celari lockup y ≈ 180, heading `Unlock with passkey` (Inter SemiBold 20), gold PrimaryButton `Unlock` 40px below, `Use Face ID` secondary text link at the bottom.

- [ ] **Step 4: Populate `Onboarding` (pe3)**

Logo y ≈ 140, headline `Welcome to Celari`, PrimaryButton `Create account`, outline button `Restore account` below, fine-print about passkey privacy at the bottom.

- [ ] **Step 5: Populate `Sidepanel` (pe4)**

Full dashboard analogue: header + full balance + quick actions + Accounts cards + full assets list + Recent activity preview list (last 5 tx) + footer bar.

- [ ] **Step 6: Populate `Settings Modal` (pe5)**

Rows: Network (with chevron), Appearance (System/Dark/Light segmented), About (version text), Disconnect (destructive red row).

- [ ] **Step 7: Visual QA + commit**

```bash
git add branding/celari-brand-system.pen
git commit -m "feat(brand): Pencil Page 4 — extension mockups"
```

---

## Task 13: Export brand assets from Pencil

**Files:**
- Create: contents of `branding/exports/` (SVGs + 1024 PNGs + hero phone PNG)

Exports happen via the Pencil desktop app (File → Export) or via `mcp__pencil__export_nodes` if surfaced in the running session. Produce files at these exact paths.

- [ ] **Step 1: Export logo vectors as SVG**

Select each source node on Page 1 and export:

- `branding/exports/logo-mark.svg` — gold C+leaf only
- `branding/exports/logo-mark-mono-dark.svg` — same geometry, all fills `#141416`
- `branding/exports/logo-mark-mono-light.svg` — same geometry, all fills `#F7F6F1`
- `branding/exports/logo-lockup.svg` — mark + CELARI wordmark + tagline
- `branding/exports/logo-lockup-mono-dark.svg` — lockup with all fills `#141416`
- `branding/exports/wordmark.svg` — `CELARI` wordmark only, outlined (so no font dependency)

Verify each:

```bash
for f in branding/exports/logo-*.svg branding/exports/wordmark.svg; do
  head -1 "$f"
done
```

Expected: each starts with `<?xml` or `<svg`.

- [ ] **Step 2: Export app icon masters as 1024×1024 PNG**

- `branding/exports/app-icon-dark-1024.png` — gold-on-dark, 22% corner radius baked in
- `branding/exports/app-icon-light-1024.png` — mono-dark-on-light

Verify:

```bash
node --input-type=commonjs -e "const sharp=require('sharp'); Promise.all(['dark','light'].map(t=>sharp(\`branding/exports/app-icon-\${t}-1024.png\`).metadata())).then(m=>console.log(m.map(x=>\`\${x.width}x\${x.height}\`)))"
```

Expected: `[ '1024x1024', '1024x1024' ]`.

- [ ] **Step 3: Export favicon source**

- `branding/exports/favicon-source.svg` — simplified mark tuned for 16×16 legibility (slightly thicker leaf, bolder C arc). A separate node in Page 1 designed for this purpose; don't reuse the full mark.

- [ ] **Step 4: Export feature + action icon SVGs**

From the icon rows on Page 1, export each icon as SVG into `branding/exports/icons/`:

- `feature-shield-lock.svg`
- `feature-fingerprint.svg`
- `feature-eye-off.svg`
- `feature-zero-trace.svg`
- `action-send.svg`
- `action-receive.svg`
- `action-swap.svg`
- `action-buy.svg`

After export, normalize fills to `currentColor` so consumers can retint with CSS/Swift:

```bash
cd branding/exports/icons
for f in *.svg; do
  node --input-type=commonjs -e "let fs=require('fs'); let s=fs.readFileSync('$f','utf8'); s=s.replace(/#D4A853/gi,'currentColor').replace(/#E8C878/gi,'currentColor').replace(/#B8924A/gi,'currentColor'); fs.writeFileSync('$f', s);"
done
cd -
```

Verify no hex gold references remain:

```bash
grep -Ei "#D4A853|#E8C878|#B8924A" branding/exports/icons/*.svg || echo "clean"
```

Expected: `clean`.

- [ ] **Step 5: Export hero phone mockup**

- `branding/exports/hero-phone-home.png` — 960×1920 PNG composition of the iPhone frame + Home screen + gold radial rings (pulled from Page 3 hero).

Verify metadata:

```bash
node --input-type=commonjs -e "const sharp=require('sharp'); sharp('branding/exports/hero-phone-home.png').metadata().then(m=>console.log(m.width+'x'+m.height))"
```

Expected: `960x1920`.

- [ ] **Step 6: Verify full exports directory**

```bash
find branding/exports -maxdepth 2 -type f | sort
```

Expected: 6 logo SVGs, `wordmark.svg`, 2 `app-icon-*-1024.png`, `favicon-source.svg`, `hero-phone-home.png`, `tokens-preview.html`, `icons/*.svg` (8 files).

- [ ] **Step 7: Commit**

```bash
git add branding/exports/
git commit -m "feat(brand): export logo, icons, and app-icon masters from Pencil"
```

---

## Task 14: Implement `generate-logo-variants.mjs` (TDD)

**Files:**
- Create: `branding/scripts/generate-logo-variants.mjs`
- Create: `branding/scripts/test/logo-variants.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// branding/scripts/test/logo-variants.test.ts
import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const OUT = resolve(ROOT, "branding/exports/app-icon");
const SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

describe("generate-logo-variants.mjs", () => {
  beforeAll(() => {
    execFileSync("node", ["branding/scripts/generate-logo-variants.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test.each(SIZES)("writes dark-%ipx.png", (size) => {
    const p = resolve(OUT, `dark-${size}.png`);
    expect(existsSync(p)).toBe(true);
    expect(statSync(p).size).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run test — fails**

Run: `NODE_NO_WARNINGS=1 npx jest branding/scripts/test/logo-variants.test.ts`
Expected: FAIL (script not found).

- [ ] **Step 3: Implement the script**

```javascript
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
```

- [ ] **Step 4: Run test — passes**

Run: `NODE_NO_WARNINGS=1 npx jest branding/scripts/test/logo-variants.test.ts`
Expected: 13 sizes PASS.

- [ ] **Step 5: Commit**

```bash
git add branding/scripts/generate-logo-variants.mjs \
        branding/scripts/test/logo-variants.test.ts \
        branding/exports/app-icon/
git commit -m "feat(brand): generate iOS AppIcon size variants"
```

---

## Task 15: Implement `generate-favicon.mjs` (TDD)

**Files:**
- Create: `branding/scripts/generate-favicon.mjs`
- Create: `branding/scripts/test/favicon.test.ts`
- Modify: `package.json` (add `png-to-ico`)

- [ ] **Step 1: Write failing test**

```typescript
// branding/scripts/test/favicon.test.ts
import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const OUT = resolve(ROOT, "branding/exports/favicon");
const SIZES = [16, 32, 48, 192, 512];

describe("generate-favicon.mjs", () => {
  beforeAll(() => {
    execFileSync("node", ["branding/scripts/generate-favicon.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test.each(SIZES)("writes favicon-%ipx.png", (s) => {
    expect(existsSync(resolve(OUT, `favicon-${s}.png`))).toBe(true);
  });

  test("writes favicon.ico", () => {
    expect(existsSync(resolve(OUT, "favicon.ico"))).toBe(true);
  });

  test("writes apple-touch-icon.png (180px)", () => {
    expect(existsSync(resolve(OUT, "apple-touch-icon.png"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, fails**

Run: `NODE_NO_WARNINGS=1 npx jest branding/scripts/test/favicon.test.ts`
Expected: FAIL.

- [ ] **Step 3: Install `png-to-ico`**

Run:
```bash
npm install --save-dev png-to-ico
```

(Sharp can't write multi-size `.ico`; this tiny package stitches PNGs together.)

- [ ] **Step 4: Implement script**

```javascript
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
```

- [ ] **Step 5: Run test — passes**

Run: `NODE_NO_WARNINGS=1 npx jest branding/scripts/test/favicon.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add branding/scripts/generate-favicon.mjs branding/scripts/test/favicon.test.ts \
        branding/exports/favicon/ package.json package-lock.json
git commit -m "feat(brand): generate favicon sizes + .ico"
```

---

## Task 16: Implement `generate-extension-icons.mjs` (TDD)

**Files:**
- Create: `branding/scripts/generate-extension-icons.mjs`
- Create: `branding/scripts/test/extension-icons.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// branding/scripts/test/extension-icons.test.ts
import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const OUT = resolve(ROOT, "branding/exports/extension");

describe("generate-extension-icons.mjs", () => {
  beforeAll(() => {
    execFileSync("node", ["branding/scripts/generate-extension-icons.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test.each([16, 32, 48, 128])("writes icon-%ipx.png", (s) => {
    expect(existsSync(resolve(OUT, `icon-${s}.png`))).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `NODE_NO_WARNINGS=1 npx jest branding/scripts/test/extension-icons.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement script**

```javascript
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
```

- [ ] **Step 4: Run — passes**

Run: `NODE_NO_WARNINGS=1 npx jest branding/scripts/test/extension-icons.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add branding/scripts/generate-extension-icons.mjs \
        branding/scripts/test/extension-icons.test.ts \
        branding/exports/extension/
git commit -m "feat(brand): generate Chrome extension icon sizes"
```

---

## Task 17: Implement `generate-og.mjs` (TDD)

**Files:**
- Create: `branding/scripts/generate-og.mjs`
- Create: `branding/scripts/test/og.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// branding/scripts/test/og.test.ts
import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(__dirname, "../../..");
const OUT = resolve(ROOT, "branding/exports/og-dark.png");

describe("generate-og.mjs", () => {
  beforeAll(() => {
    execFileSync("node", ["branding/scripts/generate-og.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test("writes og-dark.png at 1200x630", async () => {
    expect(existsSync(OUT)).toBe(true);
    const meta = await sharp(OUT).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `NODE_NO_WARNINGS=1 npx jest branding/scripts/test/og.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement script**

```javascript
// branding/scripts/generate-og.mjs
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const LOGO = resolve(ROOT, "branding/exports/logo-lockup.svg");
const OUT = resolve(ROOT, "branding/exports/og-dark.png");

mkdirSync(dirname(OUT), { recursive: true });

const logoPng = await sharp(readFileSync(LOGO))
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
```

- [ ] **Step 4: Run — passes**

Run: `NODE_NO_WARNINGS=1 npx jest branding/scripts/test/og.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add branding/scripts/generate-og.mjs branding/scripts/test/og.test.ts branding/exports/og-dark.png
git commit -m "feat(brand): generate 1200x630 OG image"
```

---

## Task 18: Implement `copy-to-extension.mjs` (TDD)

**Files:**
- Create: `branding/scripts/copy-to-extension.mjs`
- Create: `branding/scripts/test/copy-to-extension.test.ts`
- Modify: `extension/public/icons/icon-{16,32,48,128}.png`

- [ ] **Step 1: Write failing test**

```typescript
// branding/scripts/test/copy-to-extension.test.ts
import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const DEST = resolve(ROOT, "extension/public/icons");

describe("copy-to-extension.mjs", () => {
  beforeAll(() => {
    execFileSync("node", ["branding/scripts/generate-extension-icons.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    execFileSync("node", ["branding/scripts/copy-to-extension.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test.each([16, 32, 48, 128])("extension/public/icons/icon-%ipx.png exists", (s) => {
    const p = resolve(DEST, `icon-${s}.png`);
    expect(existsSync(p)).toBe(true);
    expect(statSync(p).size).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `NODE_NO_WARNINGS=1 npx jest branding/scripts/test/copy-to-extension.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement script**

```javascript
// branding/scripts/copy-to-extension.mjs
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const SRC = resolve(ROOT, "branding/exports/extension");
const DEST = resolve(ROOT, "extension/public/icons");

mkdirSync(DEST, { recursive: true });
for (const s of [16, 32, 48, 128]) {
  copyFileSync(resolve(SRC, `icon-${s}.png`), resolve(DEST, `icon-${s}.png`));
}
console.log("copy-to-extension: copied 4 icons to extension/public/icons/");
```

- [ ] **Step 4: Run — passes**

Run: `NODE_NO_WARNINGS=1 npx jest branding/scripts/test/copy-to-extension.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add branding/scripts/copy-to-extension.mjs \
        branding/scripts/test/copy-to-extension.test.ts \
        extension/public/icons/
git commit -m "feat(brand): copy-to-extension script places icons under extension/public/"
```

---

## Task 19: Full pipeline verification

**Files:** verification only (no changes expected).

- [ ] **Step 1: Clear generated artifacts**

```bash
rm -rf ios/CelariWallet/CelariWallet/Resources/Generated/
rm -rf branding/exports/app-icon branding/exports/favicon branding/exports/extension
rm -f  branding/exports/og-dark.png branding/exports/tokens-preview.html
# Masters exported from Pencil remain: logo-*.svg, wordmark.svg, app-icon-*-1024.png,
# favicon-source.svg, hero-phone-home.png, icons/*.svg
```

- [ ] **Step 2: Run full brand export**

Run: `npm run brand:export`
Expected output includes these lines (order may vary):
```
tokens: wrote CSS outputs
tokens: wrote Swift output
tokens: wrote xcassets output
tokens: wrote preview
generate-logo-variants: 13 sizes written to ...
generate-favicon: wrote 5 PNGs + apple-touch-icon + favicon.ico
generate-extension-icons: wrote 4 PNGs
generate-og: wrote og-dark.png 1200x630
copy-to-extension: copied 4 icons to extension/public/icons/
```

- [ ] **Step 3: Run full test suite for tokens + brand scripts**

Run: `NODE_NO_WARNINGS=1 npx jest design-tokens/test branding/scripts/test`
Expected: all suites PASS.

- [ ] **Step 4: Verify all outputs on disk**

```bash
find branding/exports -type f | sort
ls ios/CelariWallet/CelariWallet/Assets.xcassets/Colors/
ls ios/CelariWallet/CelariWallet/Resources/Generated/
ls website/src/styles/tokens.css extension/public/styles/tokens.css
ls extension/public/icons/
```
Expected: every path exists; no orphaned/missing entries.

- [ ] **Step 5: iOS sanity check**

If the repo uses xcodegen, regenerate the project so Xcode picks up new resource groups:

```bash
cd ios/CelariWallet && xcodegen generate && cd -
```

Smoke-check destinations load (not a real build):

```bash
xcodebuild -showdestinations -project ios/CelariWallet/CelariWallet.xcodeproj 2>&1 | head -5
```

Expected: at least one destination listed, no red errors.

- [ ] **Step 6: Visual preview**

Run: `open branding/exports/tokens-preview.html`
Expected: palette swatches visible in dark and light sections.

- [ ] **Step 7: Commit any remaining generated assets**

```bash
git status
git add branding/exports/ ios/CelariWallet/CelariWallet/Assets.xcassets/Colors/ \
        website/src/styles/tokens.css extension/public/styles/tokens.css \
        extension/public/icons/
git diff --cached --stat
git commit -m "chore(brand): initial full brand:export run — all outputs present"
```

If nothing is staged (prior tasks already committed everything), skip this step.

---

## Task 20: Mark foundation complete in the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-celari-rebrand-design.md`

- [ ] **Step 1: Append implementation-status section**

Add at the end of the spec file:

```markdown

---

## Implementation Status

- [x] **Brand System Foundation** (plan: `2026-04-24-brand-system-foundation.md`) — tokens pipeline, Pencil master, brand asset exports.
- [ ] iOS Rebrand — plan to be written.
- [ ] Website Rebrand — plan to be written.
- [ ] Extension Rebrand — plan to be written.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-24-celari-rebrand-design.md
git commit -m "docs(rebrand): mark brand system foundation complete"
```

---

## Success Criteria (for this plan)

1. `npm run tokens` regenerates all 5 token outputs from `tokens.json` without error.
2. `npm run brand:export` runs end-to-end and produces every file listed in Task 19 Step 2.
3. `NODE_NO_WARNINGS=1 npx jest design-tokens/test branding/scripts/test` passes.
4. `branding/celari-brand-system.pen` contains 4 populated pages, each visually matching its reference image to ≥95% fidelity.
5. `branding/exports/` contains the 6 logo SVGs, the wordmark SVG, 2 app-icon 1024 PNGs, favicon-source SVG, hero-phone-home PNG, favicon set, extension icon set, app-icon size set, og-dark.png, and tokens-preview.html.
6. Old branding/logo assets are archived under `backup-before-fixes/branding-v1/` and removed from their previous paths.
7. No regressions: `yarn build` (Aztec contracts path) and `yarn test` still succeed.
