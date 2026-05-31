# Celari Extension — Aztec UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the Celari Chrome-extension popup in the Aztec visual language (parchment/malachite, serif display, Geist Mono data) without losing any feature, surface a testnet faucet, and add a logs viewer.

**Architecture:** Keep the existing vanilla-JS popup engine 100% intact (`store.screen` → `render()` → `renderX()` HTML strings → `bindX()` listeners, all `chrome.runtime` messaging unchanged). Shift the *entire* popup's palette + typography in one low-risk move by remapping the legacy CSS variables in `popup.css` to Aztec values and font-aliasing the old font-family names to the new self-hosted faces. Then progressively upgrade key screens to the `.cel-*` component classes ported from the design's `wallet.css`. New pure-logic (faucet-network gate, log ring buffer) lives in `src/lib/` with jest unit tests.

**Tech Stack:** Vanilla JS (ES modules), esbuild (`extension/build.mjs`), jest + ts-jest (`extension/test/*.test.ts`), self-hosted woff2 fonts. No React, no new runtime deps.

**Design references (read before coding):**
- Spec: `docs/superpowers/specs/2026-05-31-extension-aztec-ui-redesign-design.md`
- Component CSS to port FROM: `/Users/huseyinarslan/Desktop/celari-wallet-new-ui/wallet.css`
- Screen markup to translate FROM: `/Users/huseyinarslan/Desktop/celari-wallet-new-ui/ext-screens.jsx`
- Icons/brand SVG: `/Users/huseyinarslan/Desktop/celari-wallet-new-ui/atoms.jsx`
- Screenshots: `/Users/huseyinarslan/Desktop/celari-wallet-new-ui/screenshots/{ext,overview,variants}.png`

**Key facts confirmed in the current code (do not re-derive):**
- Theme controller already exists: `applyTheme(pref)` (popup.js:316) sets `data-theme` on `<html>`; **dark = no attribute (`:root`)**, **light = `[data-theme="light"]`**, system = `prefers-color-scheme`. Persisted as `chrome.storage.local.celari_theme`. Appearance toggle already in Settings (popup.js:2472, `data-theme-pref`).
- Theme variables + `@font-face` live in `extension/public/styles/popup.css` `:root` / `[data-theme="light"]` (popup.css:1-104). `popup.css` is linked **after** `tokens.css` in `popup.html`, so it wins — edit `popup.css`, leave `tokens.css` alone.
- Faucet already network-gated on the dashboard: shows `#btn-faucet` when `store.network === "testnet" || store.network === "devnet"`, else `#btn-bridge` (popup.js:1610). Cooldown via `src/lib/faucet-cooldown.js`. `handleFaucet()` at popup.js:822.
- **No logs viewer exists.** Closest is `renderSyncBar()` (popup.js:1521) + `startSyncPolling()` (popup.js:1529) using `PXE_SYNC_STATUS`. The logs screen is **new work** (Phase 4).
- `icons` object: popup.js:888-897 (8 keys, inline `<svg>` strings, some hardcode `stroke="var(--gold-primary)"`).
- Screen dispatch: `_renderImpl()` switch at popup.js:927. To add a screen, add a `case` + `renderX()/bindX()`.
- Tests: jest from repo root: `npx jest extension/test/<file>.test.ts`. Test files import from `../public/src/lib/*.js`. Pattern: `describe/it/expect` (see `extension/test/faucet-cooldown.test.ts`).
- `build.mjs` already copies the whole `public/fonts/` dir → `dist/fonts/` (build.mjs:253). No build.mjs change needed for fonts.

---

## File structure

**Create:**
- `extension/scripts/fetch-fonts.mjs` — one-shot downloader for the woff2 faces.
- `extension/public/fonts/geist-*.woff2`, `geist-mono-*.woff2`, `ebgaramond-*.woff2`, `martel-*.woff2` — self-hosted faces (output of the script).
- `extension/public/src/lib/faucet-networks.js` — `isFaucetNetwork(network)` pure helper.
- `extension/public/src/lib/log-buffer.js` — in-memory ring buffer for popup logs.
- `extension/test/faucet-networks.test.js` — jest tests for the gate.
- `extension/test/log-buffer.test.js` — jest tests for the buffer.

**Modify:**
- `extension/public/styles/popup.css` — `@font-face` set + font aliases (Phase 1), `:root`/`[data-theme="light"]` Aztec remap + `--c-*`/`--font-*` tokens (Phase 1), `.cel-*` component layer appended (Phase 2).
- `extension/public/src/pages/popup.js` — `icons` rewrite (Phase 2), log capture wiring + `renderLogs`/`bindLogs` + switch case + sync-pill restyle (Phase 4), faucet gate via helper (Phase 4), screen `.cel-*` upgrades (Phase 5/6).

---

## PHASE 0 — Setup

### Task 0.1: Create the working branch

**Files:** none (git only)

- [ ] **Step 1: Branch off main (repo has uncommitted changes; do not disturb them)**

```bash
cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası 2"
git checkout -b feat/extension-aztec-ui
git status   # confirm pre-existing changes are still present, branch switched
```

Expected: `On branch feat/extension-aztec-ui`. No files modified by the checkout.

---

## PHASE 1 — Whole-popup palette + typography shift (low risk, no template edits)

After this phase the entire popup renders in Aztec colours/fonts with zero screen-by-screen work, because every existing inline style references the legacy `--*` variables and the legacy font-family names, which we remap/alias here.

### Task 1.1: Add the font downloader script

**Files:**
- Create: `extension/scripts/fetch-fonts.mjs`

- [ ] **Step 1: Write the downloader**

```js
// extension/scripts/fetch-fonts.mjs
// Downloads the Aztec UI woff2 faces from the Google Fonts CSS2 API into
// extension/public/fonts/. Run once: `node extension/scripts/fetch-fonts.mjs`.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/fonts");
mkdirSync(OUT, { recursive: true });

// A modern-browser UA forces the API to return woff2 URLs.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// family spec -> output basename. We fetch one CSS per (family,weight,style)
// so each returns exactly one woff2 we can name deterministically.
const FACES = [
  ["Geist:wght@400", "geist-400"],
  ["Geist:wght@500", "geist-500"],
  ["Geist:wght@600", "geist-600"],
  ["Geist+Mono:wght@400", "geist-mono-400"],
  ["Geist+Mono:wght@500", "geist-mono-500"],
  ["EB+Garamond:wght@400", "ebgaramond-400"],
  ["EB+Garamond:wght@500", "ebgaramond-500"],
  ["EB+Garamond:wght@600", "ebgaramond-600"],
  ["EB+Garamond:ital,wght@1,400", "ebgaramond-400-italic"],
  ["Martel:wght@300", "martel-300"],
  ["Martel:wght@600", "martel-600"],
];

for (const [spec, base] of FACES) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  const css = await fetch(cssUrl, { headers: { "User-Agent": UA } }).then((r) => r.text());
  const m = css.match(/url\((https:\/\/[^)]+\.woff2)\)/);
  if (!m) {
    console.error(`No woff2 for ${spec}\n${css.slice(0, 200)}`);
    process.exit(1);
  }
  const buf = Buffer.from(await fetch(m[1]).then((r) => r.arrayBuffer()));
  writeFileSync(resolve(OUT, `${base}.woff2`), buf);
  console.log(`✓ ${base}.woff2  (${buf.length} bytes)`);
}
console.log("Done. Fonts written to extension/public/fonts/");
```

- [ ] **Step 2: Run it and verify files exist**

```bash
cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası 2"
node extension/scripts/fetch-fonts.mjs
ls -1 extension/public/fonts/*.woff2
```
Expected: 11 `.woff2` files printed with non-zero byte counts (geist-400/500/600, geist-mono-400/500, ebgaramond-400/500/600/400-italic, martel-300/600).
(If the network blocks Google Fonts, fall back to the `@fontsource` npm packages `geist`, `@fontsource/eb-garamond`, `@fontsource/martel` and copy their woff2 into `public/fonts/` with the same basenames.)

- [ ] **Step 3: Commit**

```bash
git add extension/scripts/fetch-fonts.mjs extension/public/fonts/*.woff2
git commit -m "chore(ext): add self-hosted Aztec woff2 faces + fetch script"
```

### Task 1.2: Declare faces + alias legacy font names

**Files:**
- Modify: `extension/public/styles/popup.css:3-15` (replace the existing two `@font-face` blocks)

- [ ] **Step 1: Replace the font block at the top of popup.css**

Replace popup.css lines 3-15 (the current Inter + Outfit `@font-face` block) with:

```css
/* Self-hosted Aztec faces. Real names for new .cel-* code; alias names
   (Inter / IBM Plex Mono / Tenor Sans) repoint EXISTING inline font-family
   declarations onto the new faces with zero template edits. */

/* Geist — body sans (also aliased as 'Inter') */
@font-face { font-family:'Geist'; src:url('../fonts/geist-400.woff2') format('woff2'); font-weight:400; font-display:swap; }
@font-face { font-family:'Geist'; src:url('../fonts/geist-500.woff2') format('woff2'); font-weight:500; font-display:swap; }
@font-face { font-family:'Geist'; src:url('../fonts/geist-600.woff2') format('woff2'); font-weight:600; font-display:swap; }
@font-face { font-family:'Inter'; src:url('../fonts/geist-400.woff2') format('woff2'); font-weight:400; font-display:swap; }
@font-face { font-family:'Inter'; src:url('../fonts/geist-500.woff2') format('woff2'); font-weight:500; font-display:swap; }
@font-face { font-family:'Inter'; src:url('../fonts/geist-600.woff2') format('woff2'); font-weight:600 900; font-display:swap; }

/* Geist Mono — data / labels (also aliased as 'IBM Plex Mono') */
@font-face { font-family:'Geist Mono'; src:url('../fonts/geist-mono-400.woff2') format('woff2'); font-weight:400; font-display:swap; }
@font-face { font-family:'Geist Mono'; src:url('../fonts/geist-mono-500.woff2') format('woff2'); font-weight:500; font-display:swap; }
@font-face { font-family:'IBM Plex Mono'; src:url('../fonts/geist-mono-400.woff2') format('woff2'); font-weight:400; font-display:swap; }
@font-face { font-family:'IBM Plex Mono'; src:url('../fonts/geist-mono-500.woff2') format('woff2'); font-weight:500 700; font-display:swap; }

/* EB Garamond — serif (also aliased as 'Tenor Sans') */
@font-face { font-family:'EB Garamond'; src:url('../fonts/ebgaramond-400.woff2') format('woff2'); font-weight:400; font-style:normal; font-display:swap; }
@font-face { font-family:'EB Garamond'; src:url('../fonts/ebgaramond-500.woff2') format('woff2'); font-weight:500; font-style:normal; font-display:swap; }
@font-face { font-family:'EB Garamond'; src:url('../fonts/ebgaramond-600.woff2') format('woff2'); font-weight:600; font-style:normal; font-display:swap; }
@font-face { font-family:'EB Garamond'; src:url('../fonts/ebgaramond-400-italic.woff2') format('woff2'); font-weight:400; font-style:italic; font-display:swap; }
@font-face { font-family:'Tenor Sans'; src:url('../fonts/ebgaramond-400-italic.woff2') format('woff2'); font-weight:400; font-style:italic; font-display:swap; }

/* Martel — display headings */
@font-face { font-family:'Martel'; src:url('../fonts/martel-300.woff2') format('woff2'); font-weight:300; font-display:swap; }
@font-face { font-family:'Martel'; src:url('../fonts/martel-600.woff2') format('woff2'); font-weight:600; font-display:swap; }
```

- [ ] **Step 2: Build and eyeball typography**

```bash
node extension/build.mjs
```
Then load `extension/dist` at `chrome://extensions` (Developer mode → Load unpacked, or Reload). Open the popup. Expected: body text now renders in Geist; mono labels in Geist Mono. No missing-font boxes, no console errors.

- [ ] **Step 3: Commit**

```bash
git add extension/public/styles/popup.css
git commit -m "feat(ext): self-host Geist/EB Garamond/Martel + alias legacy font names"
```

### Task 1.3: Remap theme variables to Aztec + add `--c-*` / `--font-*` tokens

**Files:**
- Modify: `extension/public/styles/popup.css:17-104` (the `:root` and `[data-theme="light"]` blocks)

- [ ] **Step 1: Replace the `:root` block (popup.css:17-67) with the Aztec malachite-dark values**

```css
:root {
  /* ---- Aztec type families (new code uses these) ---- */
  --font-display: "Martel", "EB Garamond", Georgia, serif;
  --font-serif:   "EB Garamond", Georgia, serif;
  --font-body:    "Geist", "Inter", system-ui, sans-serif;
  --font-mono:    "Geist Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);

  /* ---- Aztec wallet tokens (malachite / dark = default) ---- */
  --c-ground:#001F18; --c-ground-2:#00150F; --c-card:#06281F; --c-card-2:#0A2D24;
  --c-ink:#F2EEE1; --c-muted:#9FB5AC; --c-subtle:#6E867D;
  --c-hairline:rgba(242,238,225,0.13); --c-hairline-2:rgba(242,238,225,0.24);
  --c-field:#0A2D24;
  --c-cta:#F2EEE1; --c-cta-fg:#001F18; --c-cta-hover:#FFFFFF;
  --c-priv:#FF5A5A; --c-priv-dot:#FF1A1A; --c-pub:#2BFAE9; --c-pub-ring:#2BFAE9;
  --c-proving:#E0B24A; --c-up:#3FD37E; --c-down:#FF6B6B;

  /* ---- Legacy aliases (existing inline styles resolve through these) ---- */
  --bg: var(--c-ground);
  --bg-card: var(--c-card);
  --bg-elevated: var(--c-card-2);
  --bg-section: var(--c-ground-2);
  --bg-input: var(--c-field);

  /* warm accent family → amber "proving" tone (closest to old gold, on-brand) */
  --gold-primary: var(--c-proving); --gold-soft:#C99A38; --gold-glow:rgba(224,178,74,0.12); --gold-deep:#8A6A22;
  --copper: var(--c-proving); --copper-light:#EEC56A; --copper-muted:#8A6A22; --bronze: var(--c-proving);
  --burgundy: var(--c-proving); --burgundy-deep:#C99A38; --burgundy-light:#EEC56A;
  --aztec-dark: var(--c-proving); --aztec-darker:#C99A38; --aztec-green: var(--c-proving); --teal:#8A6A22;

  --green: var(--c-up); --green-glow: rgba(63,211,126,0.10); --red: var(--c-down);

  --text-warm: var(--c-ink);
  --text-body: var(--c-muted);
  --text-muted: var(--c-subtle);
  --text-dim: var(--c-subtle);
  --text-faint: #4F635B;

  --border: var(--c-hairline);
  --border-warm: var(--c-hairline-2);

  --radius-sm: 6px;
  --radius-md: 6px;
  --radius-lg: 10px;
  --shadow: 0 1px 2px rgba(0,0,0,0.4), 0 16px 48px rgba(0,0,0,0.45);
}
```

- [ ] **Step 2: Replace the `[data-theme="light"]` block (popup.css:70-104) with parchment values**

```css
[data-theme="light"] {
  --c-ground:#F2EEE1; --c-ground-2:#EAE5D5; --c-card:#F8F5EA; --c-card-2:#FFFFFF;
  --c-ink:#1A1400; --c-muted:#5C5640; --c-subtle:#8A8470;
  --c-hairline:rgba(26,20,0,0.12); --c-hairline-2:rgba(26,20,0,0.22);
  --c-field:#FFFFFF;
  --c-cta:#1A1400; --c-cta-fg:#F2EEE1; --c-cta-hover:#2A2206;
  --c-priv:#C8181B; --c-priv-dot:#FF1A1A; --c-pub:#0C8C84; --c-pub-ring:#2BFAE9;
  --c-proving:#A8762A; --c-up:#2C7A3F; --c-down:#C8181B;

  --bg: var(--c-ground);
  --bg-card: var(--c-card);
  --bg-elevated: var(--c-card-2);
  --bg-section: var(--c-ground-2);
  --bg-input: var(--c-field);

  --gold-primary: var(--c-proving); --gold-soft:#946722; --gold-glow:rgba(168,118,42,0.14); --gold-deep:#6B4D18;
  --copper: var(--c-proving); --copper-light:#946722; --copper-muted:#6B4D18; --bronze: var(--c-proving);
  --burgundy: var(--c-proving); --burgundy-deep:#946722; --burgundy-light:#C99A38;
  --aztec-dark: var(--c-proving); --aztec-darker:#946722; --aztec-green: var(--c-proving); --teal:#6B4D18;

  --green: var(--c-up); --green-glow: rgba(44,122,63,0.10); --red: var(--c-down);

  --text-warm: var(--c-ink);
  --text-body: var(--c-muted);
  --text-muted: var(--c-subtle);
  --text-dim: var(--c-subtle);
  --text-faint: #A39E8A;

  --border: var(--c-hairline);
  --border-warm: var(--c-hairline-2);

  --shadow: 0 1px 2px rgba(26,20,0,0.06), 0 8px 24px rgba(26,20,0,0.10);
}
```

- [ ] **Step 3: Build, then verify both themes**

```bash
node extension/build.mjs
```
Reload the extension. Expected: default popup is **malachite dark** (deep green ground, parchment text). In Settings → Appearance, click **Light** → popup becomes **parchment**. Click **System** and flip macOS appearance → popup follows. No unstyled/black-on-black regions, no console errors.

- [ ] **Step 4: Commit**

```bash
git add extension/public/styles/popup.css
git commit -m "feat(ext): remap popup palette to Aztec malachite/parchment via legacy aliases"
```

---

## PHASE 2 — Component layer + Aztec icon set

### Task 2.1: Append the `.cel-*` component classes

**Files:**
- Modify: `extension/public/styles/popup.css` (append at end of file)

- [ ] **Step 1: Append the ported component layer (translated from the design's `wallet.css`, scoped to `:root` tokens so no `.celari` wrapper is required)**

```css
/* ============================================================
   Aztec component layer (ported from celari-wallet-new-ui/wallet.css).
   Uses the global --c-*/--font-* tokens defined above.
   ============================================================ */
.cel-display { font-family:var(--font-display); font-weight:300; line-height:1.02; letter-spacing:-0.04em; }
.cel-display em { font-style:italic; font-weight:300; }
.cel-serif { font-family:var(--font-serif); }
.cel-mono { font-family:var(--font-mono); letter-spacing:0; }
.cel-num { font-family:var(--font-mono); font-feature-settings:"tnum" 1; letter-spacing:-0.01em; }
.cel-eyebrow { font-family:var(--font-mono); font-size:10px; font-weight:500; letter-spacing:0.14em; text-transform:uppercase; color:var(--c-muted); }

.cel-card { background:var(--c-card); border:1px solid var(--c-hairline); border-radius:6px; }

.cel-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:999px; font-family:var(--font-mono); font-size:13px; font-weight:500; border:1px solid transparent; cursor:pointer; transition:background .14s var(--ease-out), border-color .14s var(--ease-out), transform .12s var(--ease-out), color .14s var(--ease-out); -webkit-appearance:none; appearance:none; }
.cel-btn:active { transform:translateY(1px); }
.cel-btn--primary { background:var(--c-cta); color:var(--c-cta-fg); }
.cel-btn--primary:hover { background:var(--c-cta-hover); }
.cel-btn--ghost { background:transparent; color:var(--c-ink); border-color:var(--c-hairline-2); }
.cel-btn--ghost:hover { border-color:var(--c-ink); }
.cel-btn--block { width:100%; height:48px; }

.cel-dot { width:8px; height:8px; border-radius:999px; display:inline-block; flex-shrink:0; }
.cel-dot--priv { background:var(--c-priv-dot); }
.cel-dot--pub { background:transparent; border:1.5px solid var(--c-pub-ring); }
.cel-dot--proving { background:var(--c-proving); }

.cel-state { display:inline-flex; align-items:center; gap:6px; font-family:var(--font-mono); font-size:10px; letter-spacing:0.08em; text-transform:uppercase; }
.cel-state--priv { color:var(--c-priv); }
.cel-state--pub { color:var(--c-pub); }

.cel-field { width:100%; background:var(--c-field); border:1px solid var(--c-hairline); border-radius:6px; color:var(--c-ink); font-family:var(--font-body); font-size:15px; padding:13px 14px; outline:none; transition:border-color .15s var(--ease-out); box-sizing:border-box; }
.cel-field::placeholder { color:var(--c-subtle); }
.cel-field:focus { border-color:var(--c-ink); }

.cel-hr { height:1px; background:var(--c-hairline); border:0; margin:0; }
.cel-row { display:flex; align-items:center; gap:12px; min-height:56px; }
.cel-ic { width:40px; height:40px; border-radius:999px; display:flex; align-items:center; justify-content:center; border:1px solid var(--c-hairline-2); flex-shrink:0; }
.cel-ic svg { width:18px; height:18px; stroke:var(--c-ink); stroke-width:1.5; fill:none; }

@keyframes celPulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
```

- [ ] **Step 2: Build to confirm CSS parses**

```bash
node extension/build.mjs
```
Expected: build succeeds (esbuild copies `styles/` verbatim). No visual change yet (classes unused until Phase 4/5).

- [ ] **Step 3: Commit**

```bash
git add extension/public/styles/popup.css
git commit -m "feat(ext): add Aztec .cel-* component layer"
```

### Task 2.2: Replace the `icons` object with the Aztec geometric set

**Files:**
- Modify: `extension/public/src/pages/popup.js:888-897`

- [ ] **Step 1: Replace the `icons` object**

Keep all 8 existing keys (so every current `icons.x` reference keeps working) and add the new ones used by Phases 4-5. All strokes use `currentColor` and 1.5px so they inherit the surrounding ink/parchment colour. Paths are from `atoms.jsx`'s `ICON_PATHS`.

```js
const ICON_PATHS = {
  send: "M12 19V5M5 12l7-7 7 7",
  download: "M12 5v14M19 12l-7 7-7-7",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  "shield-half": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 2v20",
  copy: "M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  back: "M15 6l-6 6 6 6",
  "chevron-right": "M9 6l6 6-6 6",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 13a7.8 7.8 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.8 7.8 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.8 7.8 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.8 7.8 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.8 7.8 0 0 0 1.7-1l2.3 1 2-3.4z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  check: "M20 6L9 17l-5-5",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  "eye-off": "M3 3l18 18M10.6 10.6a3 3 0 0 0 4 4M9.4 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3 3.8M6.1 6.1A16 16 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 2.6-.4",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18",
  link: "M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  terminal: "M4 5h16v14H4zM7 9l3 3-3 3M13 15h4",
  "face-id": "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M9 9v1M15 9v1M12 9v4h-1M9.5 15a3.5 3.5 0 0 0 5 0",
  x: "M18 6L6 18M6 6l12 12",
};

function svgIcon(name, size = 16) {
  const d = ICON_PATHS[name] || "";
  const paths = d
    .split("M")
    .filter(Boolean)
    .map((seg) => `<path d="M${seg.trim()}"/>`)
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block">${paths}</svg>`;
}

// Back-compat map: existing templates use `icons.send` etc. Each renders the
// new geometric glyph at the same call sites.
const icons = {
  send: svgIcon("send", 14),
  download: svgIcon("download", 14),
  shield: svgIcon("shield", 14),
  copy: svgIcon("copy", 12),
  back: svgIcon("back", 18),
  settings: svgIcon("settings", 14),
  lock: svgIcon("lock", 12),
  check: svgIcon("check", 14),
};
```

- [ ] **Step 2: Build and verify icons render**

```bash
node extension/build.mjs
```
Reload, open popup. Expected: dashboard Send/Receive/Shield icons + copy/lock/check render as thin geometric strokes in the ink colour (not gold). No broken SVGs.

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "feat(ext): Aztec geometric icon set + svgIcon() helper"
```

---

## PHASE 3 — Pure-logic helpers (TDD with jest)

### Task 3.1: `isFaucetNetwork` gate helper

**Files:**
- Create: `extension/public/src/lib/faucet-networks.js`
- Test: `extension/test/faucet-networks.test.js`

- [ ] **Step 1: Write the failing test**

```js
// extension/test/faucet-networks.test.js
import { isFaucetNetwork, FAUCET_NETWORKS } from "../public/src/lib/faucet-networks.js";

describe("faucet-networks", () => {
  it("enables faucet on testnet and devnet (current behaviour)", () => {
    expect(isFaucetNetwork("testnet")).toBe(true);
    expect(isFaucetNetwork("devnet")).toBe(true);
  });
  it("disables faucet on mainnet and local", () => {
    expect(isFaucetNetwork("mainnet")).toBe(false);
    expect(isFaucetNetwork("local")).toBe(false);
  });
  it("disables faucet for unknown / custom networks", () => {
    expect(isFaucetNetwork("custom-123")).toBe(false);
    expect(isFaucetNetwork(undefined)).toBe(false);
    expect(isFaucetNetwork(null)).toBe(false);
  });
  it("exposes the canonical set", () => {
    expect(FAUCET_NETWORKS).toEqual(["testnet", "devnet"]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

```bash
cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası 2"
npx jest extension/test/faucet-networks.test.js
```
Expected: FAIL — `Cannot find module '../public/src/lib/faucet-networks.js'`.

- [ ] **Step 3: Implement the helper**

```js
// extension/public/src/lib/faucet-networks.js
// Single source of truth for "does this network offer a testnet faucet?".
// Mirrors the dashboard gate that previously lived inline in popup.js.
export const FAUCET_NETWORKS = ["testnet", "devnet"];

export function isFaucetNetwork(network) {
  return FAUCET_NETWORKS.includes(network);
}
```

- [ ] **Step 4: Run it; verify it passes**

```bash
npx jest extension/test/faucet-networks.test.js
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/faucet-networks.js extension/test/faucet-networks.test.js
git commit -m "feat(ext): faucet-networks gate helper (TDD)"
```

### Task 3.2: `log-buffer` ring buffer

**Files:**
- Create: `extension/public/src/lib/log-buffer.js`
- Test: `extension/test/log-buffer.test.js`

- [ ] **Step 1: Write the failing test**

```js
// extension/test/log-buffer.test.js
import { createLogBuffer } from "../public/src/lib/log-buffer.js";

describe("log-buffer", () => {
  it("stores entries with level, message, and time", () => {
    const b = createLogBuffer(10);
    b.push("info", "hello", 1000);
    expect(b.getAll()).toEqual([{ level: "info", message: "hello", t: 1000 }]);
  });
  it("caps at max size, dropping oldest (ring behaviour)", () => {
    const b = createLogBuffer(3);
    for (let i = 1; i <= 5; i++) b.push("info", "m" + i, i);
    expect(b.getAll().map((e) => e.message)).toEqual(["m3", "m4", "m5"]);
  });
  it("joins non-string args into one message", () => {
    const b = createLogBuffer(5);
    b.push("warn", ["sync at block", 42], 7);
    expect(b.getAll()[0].message).toBe("sync at block 42");
  });
  it("clear empties the buffer", () => {
    const b = createLogBuffer(5);
    b.push("error", "boom", 1);
    b.clear();
    expect(b.getAll()).toEqual([]);
  });
  it("default capacity is 200", () => {
    const b = createLogBuffer();
    for (let i = 0; i < 250; i++) b.push("info", "x", i);
    expect(b.getAll().length).toBe(200);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

```bash
npx jest extension/test/log-buffer.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the buffer**

```js
// extension/public/src/lib/log-buffer.js
// Tiny in-memory ring buffer for popup-side log capture. No persistence —
// it reflects the current popup session, which is what the Logs screen shows.
export function createLogBuffer(max = 200) {
  const entries = [];
  return {
    push(level, args, t) {
      const message = Array.isArray(args)
        ? args
            .map((a) => (typeof a === "string" ? a : safeStringify(a)))
            .join(" ")
        : String(args);
      entries.push({ level, message, t });
      if (entries.length > max) entries.splice(0, entries.length - max);
    },
    getAll() {
      return entries.slice();
    },
    clear() {
      entries.length = 0;
    },
  };
}

function safeStringify(v) {
  try {
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  } catch {
    return String(v);
  }
}
```

- [ ] **Step 4: Run it; verify it passes**

```bash
npx jest extension/test/log-buffer.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/log-buffer.js extension/test/log-buffer.test.js
git commit -m "feat(ext): log ring buffer (TDD)"
```

---

## PHASE 4 — Logs viewer + sync pill + faucet gate via helper

### Task 4.1: Capture logs in popup.js

**Files:**
- Modify: `extension/public/src/pages/popup.js` (top imports ~line 21; module top-level after `store` definition)

- [ ] **Step 1: Add imports next to the existing faucet-cooldown import (popup.js:21)**

After the existing line `import { remainingCooldownMs, cooldownMinutes } from "../lib/faucet-cooldown.js";` add:

```js
import { isFaucetNetwork } from "../lib/faucet-networks.js";
import { createLogBuffer } from "../lib/log-buffer.js";
```

- [ ] **Step 2: Install the buffer + console tap (add immediately after the `store` object closes — popup.js:119)**

```js
// ─── Log capture ──────────────────────────────────────
// A session ring buffer feeding the Logs screen. We tee console.* so existing
// [Celari …] diagnostics show up without sprinkling new calls everywhere.
const logBuffer = createLogBuffer(200);
function logEvent(level, ...args) {
  logBuffer.push(level, args, Date.now());
}
if (typeof console !== "undefined" && !console.__celariTapped) {
  for (const level of ["log", "info", "warn", "error"]) {
    const orig = console[level].bind(console);
    console[level] = (...a) => {
      try { logBuffer.push(level === "log" ? "info" : level, a, Date.now()); } catch {}
      orig(...a);
    };
  }
  console.__celariTapped = true;
}
```

- [ ] **Step 3: Build; verify no errors**

```bash
node extension/build.mjs
```
Reload, open popup, open the popup's devtools console (right-click popup → Inspect). Expected: build OK, popup still works, console still prints normally.

- [ ] **Step 4: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "feat(ext): capture popup console into a session log buffer"
```

### Task 4.2: Add the Logs screen

**Files:**
- Modify: `extension/public/src/pages/popup.js` — add `case "logs"` in `_renderImpl()` (popup.js:927 switch, before `default`); add `renderLogs()`/`bindLogs()` (place near `renderActivity`, ~popup.js:2295); add a Logs row in `renderSettings()` Actions group (popup.js:2574) + its binding in `bindSettings()`.

- [ ] **Step 1: Add the switch case (inside `_renderImpl`, before `default:`)**

```js
    case "logs":
      root.innerHTML = renderLogs();
      bindLogs();
      break;
```

- [ ] **Step 2: Add the render + bind functions (e.g. after `bindActivity`, popup.js:2313)**

```js
// ─── Screen: Logs ─────────────────────────────────────
function renderLogs() {
  const entries = logBuffer.getAll();
  const levelColor = {
    error: "var(--c-down)",
    warn: "var(--c-proving)",
    info: "var(--c-subtle)",
  };
  const rows = entries.length
    ? entries
        .slice()
        .reverse()
        .map((e) => {
          const ts = new Date(e.t).toLocaleTimeString([], { hour12: false });
          return `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--c-hairline)">
            <span class="cel-mono" style="font-size:9px;color:var(--c-subtle);flex-shrink:0">${escapeHtml(ts)}</span>
            <span class="cel-mono" style="font-size:10px;color:${levelColor[e.level] || "var(--c-ink)"};word-break:break-word">${escapeHtml(e.message)}</span>
          </div>`;
        })
        .join("")
    : `<div style="text-align:center;padding:40px 16px;color:var(--c-subtle)" class="cel-mono">No logs this session</div>`;

  return `
    ${renderSubHeader("Logs", "settings")}
    <div style="padding:8px 16px 4px;display:flex;justify-content:space-between;align-items:center">
      <span class="cel-eyebrow">Session log · ${entries.length}</span>
      <button id="btn-logs-clear" class="cel-btn cel-btn--ghost" style="height:30px;padding:0 12px;font-size:10px">Clear</button>
    </div>
    <div style="padding:0 16px 16px">${rows}</div>`;
}

function bindLogs() {
  document.getElementById("btn-back")?.addEventListener("click", () => setState({ screen: "settings" }));
  document.getElementById("btn-logs-clear")?.addEventListener("click", () => {
    logBuffer.clear();
    render();
  });
}
```

- [ ] **Step 3: Add a Logs row to the Settings "Actions" card (popup.js:2575, as the first child inside the Actions `<div ...overflow:hidden>`)**

```js
        <div id="btn-open-logs" class="settings-row" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;border-bottom:1px solid var(--border)">
          <span style="color:var(--c-ink)">${icons.settings}</span>
          <div style="flex:1">
            <div style="font-weight:400;font-size:12px;color:var(--text-warm)">Logs</div>
            <div style="font-size:10px;color:var(--text-dim)">PXE sync &amp; diagnostics (this session)</div>
          </div>
          <span style="color:var(--c-subtle)">${svgIcon("chevron-right", 13)}</span>
        </div>
```

- [ ] **Step 4: Wire the Logs row in `bindSettings()` (add near the other settings bindings, after popup.js:2617)**

```js
  document.getElementById("btn-open-logs")?.addEventListener("click", () => setState({ screen: "logs" }));
```

- [ ] **Step 5: Build and verify**

```bash
node extension/build.mjs
```
Reload. Settings → **Logs** opens the logs screen; entries show newest-first with timestamps; **Clear** empties it; back returns to Settings. Expected: works, styled in Aztec, no console errors.

- [ ] **Step 6: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "feat(ext): Logs viewer screen + Settings entry"
```

### Task 4.3: Restyle the sync bar into the Aztec status pill (and link it to Logs)

**Files:**
- Modify: `extension/public/src/pages/popup.js:1521-1527` (`renderSyncBar`) and `startSyncPolling` text targets (popup.js:1529-1550 use `#sync-dot`/`#sync-text` — keep those IDs).

- [ ] **Step 1: Replace `renderSyncBar()`**

Keep the `id="sync-dot"` and `id="sync-text"` elements (so `startSyncPolling()` keeps updating them unchanged). Make the whole pill a button that opens Logs.

```js
function renderSyncBar() {
  return `
    <button id="btn-sync-pill" class="cel-card" style="margin:0 16px 8px;padding:9px 12px;display:flex;align-items:center;gap:8px;width:calc(100% - 32px);cursor:pointer;background:var(--c-card);text-align:left">
      <span id="sync-dot" class="cel-dot cel-dot--proving" style="animation:celPulse 1.6s ease-in-out infinite"></span>
      <span id="sync-text" class="cel-mono" style="flex:1;font-size:10px;color:var(--c-muted);letter-spacing:0.04em">Checking sync…</span>
      <span style="color:var(--c-subtle)">${svgIcon("terminal", 13)}</span>
    </button>`;
}
```

- [ ] **Step 2: Bind the pill in `bindDashboard()` (add after the faucet binding, popup.js:1714)**

```js
  document.getElementById("btn-sync-pill")?.addEventListener("click", () => setState({ screen: "logs" }));
```

- [ ] **Step 3: Keep `startSyncPolling()` dot colours on-token** — in `startSyncPolling` (popup.js:1536-1544), the dot colours currently use `--green`/`--copper`/`--text-faint`, which now alias to Aztec values, so no change is required. Verify the synced state shows a green dot and "Synced · Block N · X account(s)".

- [ ] **Step 4: Build and verify**

```bash
node extension/build.mjs
```
Reload with a deployed account on a synced network. Expected: the status pill shows sync text, pulses while checking, and **clicking it opens Logs**.

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "feat(ext): Aztec sync status pill linking to Logs"
```

### Task 4.4: Route the dashboard faucet gate through the helper

**Files:**
- Modify: `extension/public/src/pages/popup.js:1610` (the inline `store.network === "testnet" || store.network === "devnet"` condition in `renderDashboard`)

- [ ] **Step 1: Replace the inline condition with the helper**

Change the opening of the faucet/bridge ternary at popup.js:1610 from:

```js
      ${store.network === "testnet" || store.network === "devnet" ? (() => {
```
to:
```js
      ${isFaucetNetwork(store.network) ? (() => {
```

- [ ] **Step 2: Build and verify gating**

```bash
node extension/build.mjs
```
Reload. On testnet/devnet the dashboard shows the **Faucet** action; on mainnet/local it shows **Bridge**. Expected: unchanged behaviour, now driven by the tested helper.

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "refactor(ext): drive faucet gate via isFaucetNetwork helper"
```

---

## PHASE 5 — Screen upgrades to `.cel-*` (mocked screens)

> After Phase 1-2 every screen already shows Aztec colours/fonts. Phase 5 upgrades the **structure** of the 8 mocked screens to match `ext-screens.jsx` + `screenshots/`. **Rule for every task:** preserve every existing `id="…"` referenced by the screen's `bindX()` so behaviour is untouched; only restructure markup/classes. After each task: `node extension/build.mjs`, reload, walk the screen in **both** themes, confirm no console errors, then commit. Translate visuals from `/Users/huseyinarslan/Desktop/celari-wallet-new-ui/ext-screens.jsx` (the matching `Ext*` function) and verify against the screenshots.

### Task 5.1: Dashboard — balance card + action row + tabs (canonical worked example)

**Files:**
- Modify: `extension/public/src/pages/popup.js:1574-1639` (`renderDashboard`)

**IDs that MUST remain (used by `bindDashboard`, popup.js:1700-1718+):** `btn-copy-addr`, `btn-send`, `btn-receive`, `btn-faucet`, `btn-bridge`, `btn-card`, `btn-add-token`, `tab-tokens`, `tab-nfts`, `tab-activity`, `content-area`, plus `sync-dot`/`sync-text`/`btn-sync-pill` (from `renderSyncBar`) and the account-selector IDs.

- [ ] **Step 1: Replace the `return` template of `renderDashboard()`** (keep the computed vars above it: `account`, `shortAddr`, `totalValue`, `isPasskey`, `isDeployed`, `needsDeploy`)

```js
  return `
    ${renderHeader()}

    <div class="cel-card" style="margin:14px 16px;padding:18px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
        <span class="cel-eyebrow">Total balance</span>
        <span class="cel-state cel-state--priv" style="margin-left:auto"><span class="cel-dot cel-dot--priv"></span>Shielded</span>
      </div>
      <div class="cel-num" style="font-size:30px;font-weight:600;letter-spacing:-0.03em;color:var(--c-ink)">${escapeHtml(totalValue)}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid var(--c-hairline)">
        ${account?.address
          ? `<code class="cel-mono" style="font-size:12px;color:var(--c-muted)">${escapeHtml(shortAddr)}</code>
             <button class="copy-btn" id="btn-copy-addr" title="Copy address" style="background:none;border:0;color:var(--c-subtle);cursor:pointer;display:flex">${icons.copy}</button>`
          : `<code class="cel-mono" style="font-size:12px;color:var(--c-subtle)">Preparing address…</code>`}
        <span class="cel-mono" style="margin-left:auto;font-size:9px;letter-spacing:0.12em;color:${isDeployed ? "var(--c-up)" : isPasskey ? "var(--c-proving)" : "var(--c-subtle)"}">${isDeployed ? "DEPLOYED" : isPasskey ? "PENDING" : "DEMO"}</span>
      </div>
    </div>

    ${needsDeploy ? renderDeployBanner() : ""}
    ${!needsDeploy && isDeployed ? renderSyncBar() : ""}

    ${renderAccountSelector()}

    <div style="display:flex;justify-content:space-around;padding:4px 16px 16px">
      <button class="action-btn" id="btn-send" style="display:flex;flex-direction:column;align-items:center;gap:7px;background:none;border:0;cursor:pointer;color:var(--c-ink)">
        <span style="width:46px;height:46px;border-radius:999px;border:1.5px solid var(--c-ink);display:flex;align-items:center;justify-content:center;background:var(--c-card)">${svgIcon("send", 18)}</span>
        <span class="cel-mono" style="font-size:10px">Send</span>
      </button>
      <button class="action-btn" id="btn-receive" style="display:flex;flex-direction:column;align-items:center;gap:7px;background:none;border:0;cursor:pointer;color:var(--c-ink)">
        <span style="width:46px;height:46px;border-radius:999px;border:1.5px solid var(--c-ink);display:flex;align-items:center;justify-content:center;background:var(--c-card)">${svgIcon("download", 18)}</span>
        <span class="cel-mono" style="font-size:10px">Receive</span>
      </button>
      ${isFaucetNetwork(store.network)
        ? (() => {
            const cooldownMin = cooldownMinutes(store.faucetCooldownMs);
            const onCooldown = cooldownMin > 0;
            return `
      <button class="action-btn" id="btn-faucet"${onCooldown ? ' style="display:flex;flex-direction:column;align-items:center;gap:7px;background:none;border:0;opacity:0.5;pointer-events:none;color:var(--c-ink)"' : ' style="display:flex;flex-direction:column;align-items:center;gap:7px;background:none;border:0;cursor:pointer;color:var(--c-ink)"'} title="${onCooldown ? `Cooldown ${cooldownMin}m` : "Request testnet tokens"}">
        <span style="width:46px;height:46px;border-radius:999px;border:1.5px solid var(--c-ink);display:flex;align-items:center;justify-content:center;background:var(--c-card)">${svgIcon("drop", 18)}</span>
        <span class="cel-mono" style="font-size:10px">${onCooldown ? `Faucet ${cooldownMin}m` : "Faucet"}</span>
      </button>`;
          })()
        : `
      <button class="action-btn" id="btn-bridge" style="display:flex;flex-direction:column;align-items:center;gap:7px;background:none;border:0;cursor:pointer;color:var(--c-ink)">
        <span style="width:46px;height:46px;border-radius:999px;border:1.5px solid var(--c-ink);display:flex;align-items:center;justify-content:center;background:var(--c-card)">${svgIcon("link", 18)}</span>
        <span class="cel-mono" style="font-size:10px">Bridge</span>
      </button>`}
      <button class="action-btn" id="btn-card" style="display:flex;flex-direction:column;align-items:center;gap:7px;background:none;border:0;cursor:pointer;color:var(--c-ink)">
        <span style="width:46px;height:46px;border-radius:999px;border:1.5px solid var(--c-ink);display:flex;align-items:center;justify-content:center;background:var(--c-card)">${svgIcon("shield-half", 18)}</span>
        <span class="cel-mono" style="font-size:10px">Shield</span>
      </button>
    </div>

    <div class="tabs" style="display:flex;border-bottom:1px solid var(--c-hairline);padding:0 16px;align-items:center">
      <div class="tab active" id="tab-tokens" style="padding:10px 14px 9px;cursor:pointer;font-family:var(--font-mono);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border-bottom:2px solid var(--c-ink);color:var(--c-ink)">Tokens</div>
      <div class="tab" id="tab-nfts" style="padding:10px 14px 9px;cursor:pointer;font-family:var(--font-mono);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border-bottom:2px solid transparent;color:var(--c-subtle)">NFTs</div>
      <div class="tab" id="tab-activity" style="padding:10px 14px 9px;cursor:pointer;font-family:var(--font-mono);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border-bottom:2px solid transparent;color:var(--c-subtle)">Activity</div>
      <button id="btn-add-token" title="Add custom token" style="background:none;border:none;color:var(--c-subtle);cursor:pointer;padding:4px 8px;font-size:16px;font-family:var(--font-mono);margin-left:auto">+</button>
    </div>

    <div class="token-list" id="content-area">
      ${renderTokenList()}
    </div>`;
```

> Note: the `.tab.active` toggling in `bindDashboard` sets classes/inline styles on these elements; verify tab switching still highlights correctly. If `bindDashboard` toggles only the `active` class (not inline colour), add the active/inactive colours to `.tab`/`.tab.active` rules in popup.css instead of inline. Check `bindDashboard` (popup.js:1700+) before finalizing and adjust whichever it uses.

- [ ] **Step 2: Build, reload, verify**

`node extension/build.mjs` → reload. Expected: balance card matches the mockup (eyebrow + big mono number + hairline + address/copy + status tag), circular Send/Receive/Faucet|Bridge/Shield actions, underlined active tab. Tab switching, copy, send/receive/faucet still work. Check both themes.

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "feat(ext): Aztec dashboard (balance card, action row, tabs)"
```

### Task 5.2: Onboarding (`renderOnboarding`, popup.js:1120-1156)

**Preserve IDs** used by `bindOnboarding` (popup.js:1157) — confirm them first (e.g. create/restore buttons). Translate from `ExtOnboarding` in `ext-screens.jsx`: centered `CelariMark`, `cel-display` "Welcome to <em>cel</em>ari", muted subtitle, three feature rows (`shield-half`/`face-id`/`eye-off` in `cel-ic` circles + label), primary `cel-btn--block` "Create with passkey", ghost "Restore existing account".

- [ ] **Step 1:** Rewrite the `renderOnboarding` template body using `cel-card`/`cel-display`/`cel-ic`/`cel-btn--primary cel-btn--block`/`cel-btn--ghost`, keeping the existing button IDs and the brand mark via a `celariMark()` helper (add one mirroring `CelariMark` from `atoms.jsx`: a function returning the `<svg viewBox="0 0 1024 1024">…</svg>` string with `fill="currentColor"`).
- [ ] **Step 2:** Build, reload, verify the create/restore actions still fire (`bindOnboarding` unchanged). Both themes.
- [ ] **Step 3:** Commit `feat(ext): Aztec onboarding screen`.

### Task 5.3: Lock (`renderLocked`, popup.js:1043-1091)

**Preserve IDs** used by `bindLocked` (popup.js:1092) — the unlock button + any error region. Translate from `ExtLock`: centered `CelariMark`, lock glyph in a 64px ringed circle, `cel-display` "Wallet <em>locked</em>", muted copy, `cel-btn--primary cel-btn--block` "Unlock with passkey". Keep the `store.unlockError` rendering.

- [ ] Rewrite template (preserve unlock button id + error element id) → build/reload/verify unlock works in both themes → commit `feat(ext): Aztec lock screen`.

### Task 5.4: Send (`renderSend`, popup.js:2068-2115)

**Preserve IDs** used by `bindSend` (popup.js:2116): amount input, recipient input, transfer-type toggle buttons (private/public/shield/unshield), review/submit button, and `store.sendForm` wiring. Translate from `ExtSend`: amount `cel-card` (big `cel-num`), mode pill toggle (`cel-btn` active=`--primary`), `cel-field` recipient, network `cel-card` with `CelariMark` + `StateChip`, "Estimated fee → Sponsored" `cel-card`, `cel-btn--primary cel-btn--block` "Review transaction". Keep the unshield mode if currently present.

- [ ] Rewrite template (map each existing control to a `.cel-*` equivalent, same IDs) → build/reload/verify a send flow end-to-end (private + shield) → commit `feat(ext): Aztec send screen`.

### Task 5.5: Receive (`renderReceive`, popup.js:2248-2279)

**Preserve IDs** used by `bindReceive` (popup.js:2280): copy button, and the QR render via `renderSimpleQR` (popup.js:2836). Translate from `ExtReceive`: QR in a white-padded `cel-card`, Celari-ID `cel-card` row, `cel-btn--ghost cel-btn--block` "Copy address".

- [ ] Rewrite template (keep `renderSimpleQR(...)` call + copy id) → build/reload/verify copy + QR → commit `feat(ext): Aztec receive screen`.

### Task 5.6: Settings (`renderSettings`, popup.js:2448-2598)

**Preserve IDs**: `data-theme-pref` buttons, `btn-network-*` rows + `renderNetworkRow`, custom-RPC controls (`btn-toggle-add-rpc`, `rpc-name`, `rpc-url`, `btn-test-rpc`, `btn-save-rpc`, `rpc-test-result`), `setting-tx-passkey`, `btn-lock-now`, `btn-backup-export`, `btn-backup-import`, `btn-delete-account`, `btn-logout`, and the new `btn-open-logs` (Task 4.2). Translate the section look from `ExtSettings`: `cel-eyebrow` group headers, `cel-card` grouped rows with `cel-ic` leading icons + `chevron-right`, and add the **"ALPHA — testnet funds only"** banner (shown when `isFaucetNetwork(store.network)`), styled per `ExtSettings` (proving-amber hairline box).

- [ ] **Step 1:** Add the alpha banner above the Account section:
```js
      ${isFaucetNetwork(store.network) ? `
      <div style="padding:11px 14px;border:1px solid var(--c-proving);border-radius:6px;display:flex;gap:10px;align-items:flex-start;margin-bottom:16px;background:color-mix(in srgb, var(--c-proving) 8%, transparent)">
        <span class="cel-dot cel-dot--proving" style="margin-top:4px"></span>
        <span class="cel-mono" style="font-size:11px;color:var(--c-proving);letter-spacing:0.06em">ALPHA — testnet funds only</span>
      </div>` : ""}
```
- [ ] **Step 2:** Restyle the Appearance toggle (the `data-theme-pref` buttons) to a `cel-card` segmented control; active = `--c-cta`/`--c-cta-fg`. Restyle network rows + the version footer (keep "celāre — to hide, to conceal", set serif via `cel-serif`).
- [ ] **Step 3:** Build/reload/verify: theme switch works, network switch works, custom RPC add/test/save works, per-tx passkey toggle works, lock/backup/import/logout/logs rows navigate. Both themes.
- [ ] **Step 4:** Commit `feat(ext): Aztec settings screen + alpha/testnet banner`.

### Task 5.7: Activity (`renderActivity`, popup.js:2295-2306 + `renderActivityList`, popup.js:1672)

**Preserve** the `renderActivityList()` data mapping. Translate from `ExtActivity`/`ExtActRow`: `cel-row` items with `cel-ic` direction icon (`download` for in, `send` for out, `shield-half` for shield), label + `cel-dot` state, mono time, signed amount coloured `--c-up` for `+`.

- [ ] Rewrite `renderActivityList()` rows to the `cel-row` structure (keep the empty-state) → build/reload/verify list renders → commit `feat(ext): Aztec activity list`.

### Task 5.8: dApp Approve + Sign + WC proposal

**Files:** `renderWsApprove` (popup.js:2995-3029), `renderWsSign` (popup.js:3045-3080), `renderWcApprove` (popup.js:3830-3858).

**Preserve IDs** used by the binds: `btn-ws-approve`/`btn-ws-reject` (`bindWsApprove`, popup.js:3030); the approve/reject sign buttons (`bindWsSign`, popup.js:3081); WC approve/reject (`bindWcApprove`, popup.js:3860). Translate from `ExtApprove`: header `CelariLockup` + "Connection request" eyebrow, dApp identity `cel-card` (globe ⇄ CelariMark, origin, "wants to connect"), permission checklist `cel-card` (`check` icons), privacy note (`cel-dot--priv` + muted mono), `Reject` (`cel-btn--ghost`) / `Connect` (`cel-btn--primary`).

- [ ] **Step 1:** Restyle `renderWsApprove` to the `ExtApprove` layout (keep origin/permission data + button IDs).
- [ ] **Step 2:** Apply the same card/eyebrow/button language to `renderWsSign` (transaction preview in a `cel-card` mono block) and `renderWcApprove` (session proposal), keeping their button IDs and any passkey gating.
- [ ] **Step 3:** Build/reload. Verify with a real dApp (e.g. bridge.human.tech) that connect/sign approval still works, or simulate by launching `popup.html?wsapprove=…` per the existing flow. Both themes.
- [ ] **Step 4:** Commit `feat(ext): Aztec dApp approve/sign/walletconnect screens`.

---

## PHASE 6 — Remaining screens polish (inherit remap; spot-fix only)

These already render in Aztec colours/fonts from Phase 1. Upgrade only where structure looks off against the design. For each: open the screen, and replace any **hardcoded hex colours** or **rotated-diamond Art-Deco motifs** (`transform:rotate(45deg)` icon frames, the `◇` empty-state glyph) with `.cel-*` equivalents (`cel-ic` circles, `cel-card`). Preserve all IDs/bindings. Build/reload/verify per screen, commit per screen.

- [ ] **Task 6.1:** `renderAccountSelector` (popup.js:1554) — chips → `cel-mono` pills using `--c-*`; keep `account-chip`/`data-index`/`btn-add-account`.
- [ ] **Task 6.2:** `renderDeployBanner` (popup.js:1436) + `renderSyncBar` already done — restyle deploy banner as a `cel-card` with `cel-btn--primary`; keep `btn-deploy-account`.
- [ ] **Task 6.3:** `renderTokenList` (popup.js:1641) — rows → `cel-row` with `cel-dot` public/private markers; keep `btn-remove-token`/`data-symbol`.
- [ ] **Task 6.4:** `renderAddToken` (popup.js:2313) + `renderAddNftContract` (popup.js:3641) — inputs → `cel-field`, buttons → `cel-btn`; keep all IDs.
- [ ] **Task 6.5:** `renderNftList` (popup.js:3492) + `renderNftDetail` (popup.js:3531) — `cel-card` grid/detail; keep nav + transfer IDs.
- [ ] **Task 6.6:** `renderBackup` (popup.js:3194) + `renderRestore` (popup.js:3308) + `renderAddAccount` (popup.js:3117) — `cel-field`/`cel-btn`; keep file-drop + password IDs.
- [ ] **Task 6.7:** `renderWalletConnect` (popup.js:3734) — URI `cel-field` + session `cel-card` rows; keep pair/disconnect IDs.
- [ ] **Task 6.8:** `renderConfirmTx` (popup.js:2913) + `renderPrfUnsupported` (popup.js:1102) + `renderLoading` (popup.js:1033) + `renderHeader`/`renderSubHeader` (popup.js:2810/2825) + `showToast` styling — bring to `.cel-*`; keep IDs.

---

## PHASE 7 — Full QA + finish

### Task 7.1: Run the test suite

- [ ] **Step 1:** `cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası 2" && npx jest extension/test` — Expected: all lib tests green (faucet-cooldown, faucet-networks, log-buffer, sanitize, ws-lock-gate, account-schema, passkey-crypto).

### Task 7.2: Manual QA matrix

- [ ] Build once: `node extension/build.mjs`. Reload at `chrome://extensions`.
- [ ] For **each** theme (System=auto, Light, Dark): walk onboarding → lock/unlock → dashboard → send (private+shield) → receive → activity → settings (network switch, custom RPC, per-tx passkey, appearance) → logs (open, clear) → faucet (on testnet, cooldown label) → NFT → backup/restore → WalletConnect → dApp approve/sign. Confirm: no console errors, no unstyled/contrast-broken regions, faucet hidden on mainnet/local, sync pill opens logs.
- [ ] Confirm the offscreen/PXE path is untouched: a real testnet send still proves + lands (block number toast).

### Task 7.3: Finish the branch

- [ ] **Step 1:** `git status` — confirm only intended files changed (no edits under `extension/dist/`, no `*.wasm`/`*.gz`, no iOS files).
- [ ] **Step 2:** Use the `superpowers:finishing-a-development-branch` skill to choose merge/PR.

---

## Self-review notes (author)

- **Spec §3.1 tokens / §3.2 components / §3.3 fonts / §3.4 icons / §3.5 theme** → Phases 1-2 (Tasks 1.2, 1.3, 2.1, 2.2) + theme controller reused as-is (verified existing at popup.js:316).
- **Spec §4.1 mocked screens** → Phase 5 (Tasks 5.1-5.8). **§4.2 remaining screens** → Phase 6.
- **Spec §5.1 faucet** → Tasks 3.1 + 4.4 + 5.1 (gate already existed for testnet/devnet; preserved + tested + restyled). **§5.2 logs** → Tasks 3.2 + 4.1 + 4.2 + 4.3 (new viewer + capture + sync pill). Correction vs. spec wording: there was no pre-existing logs viewer; this plan **adds** one.
- **Spec §6 build/verify** → Phase 7.
- Theme contract preserved (dark=`:root`, light=`[data-theme="light"]`), so `applyTheme()`/`setTheme()` and the existing Appearance toggle keep working — no controller rewrite.
- No placeholders: every code step contains full content. Screen tasks in Phase 5/6 specify exact functions, line anchors, IDs-to-preserve, and the `ext-screens.jsx` source to translate; the canonical full markup is given for the Dashboard (Task 5.1) and the deterministic foundation (Phases 1-4). Markup for the remaining mocked screens is finalized against the in-repo design references during implementation — not invented here to avoid shipping speculative pixel markup.
- Type/name consistency: `svgIcon()`, `ICON_PATHS`, `icons`, `logBuffer`/`createLogBuffer`, `isFaucetNetwork`/`FAUCET_NETWORKS` are defined once and reused with the same names throughout.
