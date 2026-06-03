# Side Panel (Phase 3A) — Design

- **Date:** 2026-06-03
- **Status:** Approved design — ready for implementation plan
- **Branch:** `feat/proving-ux-phase3` (off main, which now has Phase 1 + Phase 2)
- **Scope split:** Phase 3 is split into **3A (this — sidePanel, low-risk)** and **3B (COOP/COEP threaded proving, higher-risk — separate spec later).**

---

## 1. Background & Motivation

Azguard offers a persistent side panel (`sidePanel` permission + `side_panel` config); Celari only has an action popup that closes on blur. A persistent panel is better for dApp flows and long proving waits (the popup vanishes when the user clicks away). This phase adds the side panel as an **optional, persistent view that reuses the existing `popup.html`**, without changing the default icon-click behavior.

Verified current state: `manifest.json` has `action.default_popup: "popup.html"`, `permissions: [storage, activeTab, notifications, alarms, offscreen]`, no `sidePanel`/`side_panel`.

---

## 2. Goals / Non-Goals

### Goals
1. Make the wallet UI available as a Chrome side panel, reusing `popup.html`.
2. Keep icon-click → popup (unchanged behavior).
3. Add an explicit "Open in side panel" affordance in the popup; hide it when already running in the panel.

### Non-Goals
- Changing icon-click to open the panel (rejected — keep the popup default).
- Routing sign/confirm flows into the panel (they keep using `chrome.windows.create({type:"popup"})`).
- COOP/COEP / threaded proving → Phase 3B.
- Panel-specific redesign — reuse `popup.html` as-is, with only minimal responsive CSS if needed.

---

## 3. Design

### 3.1 manifest (`extension/public/manifest.json`)
- Add `"sidePanel"` to `permissions`.
- Add `"side_panel": { "default_path": "popup.html?panel=1" }`.
- Keep `action.default_popup: "popup.html"` unchanged (icon click → popup).

The `?panel=1` query marks the panel context so the same `popup.html` can hide the "open in panel" button when it is already the panel.

### 3.2 Panel-context helper (`extension/public/src/lib/panel-context.js`) — unit-tested
`isPanelContext(search)` → `boolean`: true when the URL search string contains `panel=1` (parsed via `URLSearchParams`). Pure, no DOM.

### 3.3 popup (`extension/public/src/pages/popup.js` + `popup.html`)
- Add a small "Yan panelde aç" (Open in side panel) control (e.g. in the header/menu area).
- On load, compute `isPanelContext(location.search)`. If true (panel), **hide** the control. If false (popup), show it.
- On click: `const w = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: w.id }); window.close();` — opens the panel for the current window and closes the popup. Guard with try/catch (no-op if `chrome.sidePanel` is unavailable / older Chrome).

### 3.4 CSS
`popup.html` uses popup-sized widths. The Chrome side panel width is comparable, so reuse is expected to render acceptably. If the panel view looks visibly broken at panel width, add a minimal responsive rule scoped to the panel context (e.g. a `panel` class set on `<body>` when `isPanelContext` is true) to use full width. This is a verify-then-tweak step, not a redesign.

### 3.5 Error handling
- `chrome.sidePanel.open` is wrapped in try/catch; failure leaves the popup open (no crash).
- Older Chrome without `chrome.sidePanel`: the button's handler no-ops gracefully; `minimum_chrome_version` is already `116` (sidePanel is stable since 114), so this is fine.

---

## 4. Verification
- **Unit:** `isPanelContext("?panel=1")===true`, `isPanelContext("")===false`, `isPanelContext("?x=1&panel=1")===true`, `isPanelContext("?panel=0")===false`.
- **Manual (extension loaded):**
  1. Icon click still opens the popup (unchanged).
  2. Popup shows "Yan panelde aç"; clicking it opens the side panel and closes the popup.
  3. The panel renders `popup.html` and is usable; the "open in panel" button is hidden in the panel.
  4. The panel persists while navigating dApp pages (does not close on blur like the popup).
- **Build:** `node extension/build.mjs` green; `npx jest extension/test` green (new `panel-context` test).

## 5. Files Touched
- `extension/public/manifest.json` — `sidePanel` permission + `side_panel` config.
- `extension/public/src/lib/panel-context.js` — new pure helper + `extension/test/panel-context.test.ts`.
- `extension/public/src/pages/popup.js` — show/hide + open-panel handler.
- `extension/public/popup.html` (or the popup template) — the button markup.
- (Optional) a minimal panel-width CSS rule if the manual check shows it's needed.

## 6. Out of Scope
- Phase 3B: COOP/COEP manifest headers + `barretenberg-threads` multi-core proving (separate spec; higher risk; must verify the offscreen PXE still initializes and proves).
