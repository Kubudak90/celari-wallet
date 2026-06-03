# Side Panel (Phase 3A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wallet UI available as a persistent Chrome side panel reusing `popup.html`, keeping icon-click → popup, with an "open in side panel" button hidden when already in the panel.

**Architecture:** Add `sidePanel` permission + `side_panel.default_path: "popup.html?panel=1"`. A pure `isPanelContext(search)` helper drives popup behavior: in panel context, mark `<body>` and hide the button; in popup context, show a small button that calls `chrome.sidePanel.open()`.

**Tech Stack:** Vanilla JS popup (`pages/popup.js` + `popup.html` + `styles/popup.css`), Chrome `sidePanel` API, Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-06-03-sidepanel-phase3a-design.md`
**Branch:** `feat/proving-ux-phase3`.

Verified context: `popup.html` is at `extension/public/popup.html` (copied to dist via `build.mjs:285`); it loads `src/pages/popup.js` (a module) and links `styles/popup.css`. `popup.js` has `init()` (~`:425`) which already reads `new URLSearchParams(window.location.search)` (~`:469`) and renders into `#root`. `popup.js` already imports from `../lib/` (e.g. `passkey-crypto.js`, `fingerprint.js`). `manifest.json` has `minimum_chrome_version: 116` (sidePanel stable since 114).

---

## Task 1: `lib/panel-context.js` (pure helper)

**Files:** Create `extension/public/src/lib/panel-context.js`; Test `extension/test/panel-context.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// extension/test/panel-context.test.ts
import { describe, it, expect } from "@jest/globals";
import { isPanelContext } from "../public/src/lib/panel-context.js";

describe("isPanelContext", () => {
  it("is true when panel=1 is present", () => {
    expect(isPanelContext("?panel=1")).toBe(true);
    expect(isPanelContext("?x=1&panel=1")).toBe(true);
  });
  it("is false otherwise", () => {
    expect(isPanelContext("")).toBe(false);
    expect(isPanelContext("?panel=0")).toBe(false);
    expect(isPanelContext("?wssign=abc")).toBe(false);
  });
  it("does not throw on junk input", () => {
    expect(isPanelContext(undefined as any)).toBe(false);
    expect(typeof isPanelContext("%%%")).toBe("boolean");
  });
});
```

- [ ] **Step 2: Run** `npx jest extension/test/panel-context.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Write the module**

```js
// extension/public/src/lib/panel-context.js
// True when popup.html is running as the side panel (loaded with ?panel=1),
// so the popup can hide its "open in side panel" button in that context.
export function isPanelContext(search) {
  try {
    return new URLSearchParams(search || "").get("panel") === "1";
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run** `npx jest extension/test/panel-context.test.ts` — expect PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/public/src/lib/panel-context.js extension/test/panel-context.test.ts
git commit -m "feat(ext): add isPanelContext helper for side-panel detection"
```

---

## Task 2: manifest — sidePanel permission + config

**Files:** Modify `extension/public/manifest.json`.

- [ ] **Step 1: Add the permission + side_panel config**

In `extension/public/manifest.json`:
- Add `"sidePanel"` to the `permissions` array (so it becomes `["storage","activeTab","notifications","alarms","offscreen","sidePanel"]`).
- Add a top-level key: `"side_panel": { "default_path": "popup.html?panel=1" }`.
- Leave `action.default_popup: "popup.html"` unchanged.

- [ ] **Step 2: Verify JSON validity + build copies it**

Run: `node -e "const m=require('./extension/public/manifest.json'); console.log('sidePanel perm:', m.permissions.includes('sidePanel')); console.log('side_panel:', JSON.stringify(m.side_panel)); console.log('default_popup:', m.action.default_popup);"`
Expected: `sidePanel perm: true`, `side_panel: {"default_path":"popup.html?panel=1"}`, `default_popup: popup.html`.
Run: `node extension/build.mjs` → Pass 1 OK; `node -e "console.log(require('./extension/dist/manifest.json').side_panel)"` → shows the config (build.mjs:284 copies manifest).

- [ ] **Step 3: Commit**
```bash
git add extension/public/manifest.json
git commit -m "feat(ext): register side panel (popup.html?panel=1)"
```

---

## Task 3: popup — open-in-panel button + panel-context behavior

**Files:** Modify `extension/public/src/pages/popup.js`, `extension/public/styles/popup.css`.

- [ ] **Step 1: Import the helper + wire init()**

At the top of `popup.js`, alongside the existing `../lib/` imports, add:
```js
import { isPanelContext } from "../lib/panel-context.js";
```
Inside `init()` (near the top, before/after the existing `URLSearchParams` usage), add:
```js
  const _inPanel = isPanelContext(window.location.search);
  document.body.classList.toggle("panel", _inPanel);
  if (!_inPanel) _mountOpenInPanelButton();
```

- [ ] **Step 2: Add the mount helper** (top-level function in `popup.js`, e.g. near `escapeHtml`)

```js
// Floating "open in side panel" button — mounted on <body> (survives #root
// re-renders), shown only in the popup (not when already the panel).
function _mountOpenInPanelButton() {
  if (document.getElementById("celari-open-panel")) return;
  const btn = document.createElement("button");
  btn.id = "celari-open-panel";
  btn.type = "button";
  btn.title = "Yan panelde aç";
  btn.setAttribute("aria-label", "Yan panelde aç");
  btn.textContent = "⇲";
  btn.addEventListener("click", async () => {
    try {
      const w = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: w.id });
      window.close();
    } catch (e) {
      console.warn("[Celari] side panel open failed:", e?.message || e);
    }
  });
  document.body.appendChild(btn);
}
```

- [ ] **Step 3: Add minimal CSS**

Append to `extension/public/styles/popup.css`:
```css
/* Side-panel: "open in panel" button (popup only) + full-width body in panel */
#celari-open-panel {
  position: fixed;
  top: 6px;
  right: 6px;
  z-index: 9999;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: var(--c-surface, #1c1c22);
  color: var(--c-text, #fff);
  font-size: 13px;
  line-height: 24px;
  cursor: pointer;
  opacity: 0.65;
}
#celari-open-panel:hover { opacity: 1; }
body.panel { width: 100%; min-width: 0; }
```

- [ ] **Step 4: Build + verify**

Run: `node extension/build.mjs` → Pass 1 OK (popup builds without errors).
Run: `grep -n "isPanelContext\|celari-open-panel\|_mountOpenInPanelButton" extension/public/src/pages/popup.js` → confirm wiring.
Run: `grep -n "celari-open-panel\|body.panel" extension/public/styles/popup.css` → confirm CSS.
Run: `npx jest extension/test` → all green (panel-context test included).

- [ ] **Step 5: Commit**
```bash
git add extension/public/src/pages/popup.js extension/public/styles/popup.css
git commit -m "feat(ext): open-in-side-panel button + panel-context body class"
```

---

## Task 4: Full build + manual verification

- [ ] **Step 1: Build + unit suite**

Run: `node extension/build.mjs` → all passes OK.
Run: `npx jest extension/test` → all green.
Load unpacked `extension/dist` in Chrome.

- [ ] **Step 2: Manual checks**
  1. Click the extension icon → the **popup** opens (unchanged). A small `⇲` button shows top-right.
  2. Click `⇲` → the **side panel** opens (reusing the wallet UI) and the popup closes.
  3. In the side panel, the `⇲` button is **absent** (panel context), and the UI renders/usable at panel width.
  4. Navigate to a different page/dApp → the side panel **stays open** (unlike the popup).
  5. The wallet still works in the panel (unlock, dashboard, etc.).

- [ ] **Step 3: Record results in the PR description.**

---

## Self-Review Notes
- **Spec coverage:** sidePanel availability (Task 2) + reuse popup.html (Task 2 path `popup.html?panel=1`) + keep icon→popup (Task 2 leaves default_popup) + open-in-panel button hidden in panel (Tasks 1+3 via `isPanelContext`) + minimal panel CSS (Task 3). All spec goals mapped.
- **Decoupling:** the button is appended to `<body>` (not `#root`), so it survives the popup's dynamic `#root` re-renders without touching every render function.
- **Type consistency:** `isPanelContext(search) → boolean`; button id `celari-open-panel`; body class `panel`; helper `_mountOpenInPanelButton()`. Consistent across Tasks 1–3.
- **Graceful degradation:** `chrome.sidePanel.open` is try/caught; on older Chrome / failure the popup stays open.
