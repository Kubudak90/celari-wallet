# COOP/COEP Threaded Proving (Phase 3B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable multi-threaded bb.js WASM proving in the offscreen document by making extension pages `crossOriginIsolated` (COOP/COEP), gated + fallback-protected, as a measured spike (keep only on a real speedup with zero regressions).

**Architecture:** Add COOP `same-origin` + COEP `require-corp` to the manifest. A pure `chooseThreadCount()` decides the bb thread count from `self.crossOriginIsolated` + platform; the offscreen prover inits with that count and falls back to single-thread on any error. Trivially revertible (two manifest keys + the thread count).

**Tech Stack:** Vanilla JS offscreen (`offscreen.js`), `@aztec/bb.js@4.3.0` (`Barretenberg.initSingleton`), MV3 manifest COOP/COEP, Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-06-03-coop-coep-threaded-proving-phase3b-design.md`
**Branch:** `feat/coop-coep-phase3b`.

Verified context: `offscreen.js:527` currently does `await Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: 1 });` (preceded by comments ~`:518-526` about avoiding Workers). `isIOS` is already a variable in `offscreen.js`. `manifest.json` has no COOP/COEP. offscreen.html + popup load only same-origin bundled resources.

---

## Task 1: `lib/thread-count.js` (pure helper)

**Files:** Create `extension/public/src/lib/thread-count.js`; Test `extension/test/thread-count.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// extension/test/thread-count.test.ts
import { describe, it, expect } from "@jest/globals";
import { chooseThreadCount } from "../public/src/lib/thread-count.js";

describe("chooseThreadCount", () => {
  it("uses capped hardwareConcurrency when isolated and not iOS", () => {
    expect(chooseThreadCount({ isolated: true, isIOS: false, hardwareConcurrency: 12, cap: 8 })).toBe(8);
    expect(chooseThreadCount({ isolated: true, isIOS: false, hardwareConcurrency: 4, cap: 8 })).toBe(4);
  });
  it("returns 1 when not crossOriginIsolated", () => {
    expect(chooseThreadCount({ isolated: false, isIOS: false, hardwareConcurrency: 12, cap: 8 })).toBe(1);
  });
  it("returns 1 on iOS regardless of isolation", () => {
    expect(chooseThreadCount({ isolated: true, isIOS: true, hardwareConcurrency: 12, cap: 8 })).toBe(1);
  });
  it("defaults hardwareConcurrency to 4 when unknown", () => {
    expect(chooseThreadCount({ isolated: true, isIOS: false, hardwareConcurrency: 0, cap: 8 })).toBe(4);
    expect(chooseThreadCount({ isolated: true, isIOS: false, hardwareConcurrency: undefined, cap: 8 })).toBe(4);
  });
  it("never returns less than 1 and defaults cap to 8", () => {
    expect(chooseThreadCount({ isolated: true, isIOS: false, hardwareConcurrency: 32 })).toBe(8);
    expect(chooseThreadCount({})).toBe(1);
  });
});
```

- [ ] **Step 2: Run** `npx jest extension/test/thread-count.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Write the module**

```js
// extension/public/src/lib/thread-count.js
// Decide the bb.js WASM thread count. Threaded proving needs SharedArrayBuffer,
// which requires a crossOriginIsolated context (COOP/COEP). iOS WKWebView has
// no Workers and is never isolated → single-thread.
export function chooseThreadCount({ isolated, isIOS, hardwareConcurrency, cap = 8 } = {}) {
  if (!isolated || isIOS) return 1;
  const hc = Number(hardwareConcurrency) || 4;
  return Math.max(1, Math.min(hc, cap));
}
```

- [ ] **Step 4: Run** `npx jest extension/test/thread-count.test.ts` — expect PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/public/src/lib/thread-count.js extension/test/thread-count.test.ts
git commit -m "feat(ext): add chooseThreadCount helper (gated bb thread count)"
```

---

## Task 2: manifest — COOP/COEP

**Files:** Modify `extension/public/manifest.json`.

- [ ] **Step 1: Add the two top-level keys**

Add to `extension/public/manifest.json` (top-level, valid JSON, match existing indentation):
```json
"cross_origin_opener_policy": { "value": "same-origin" },
"cross_origin_embedder_policy": { "value": "require-corp" }
```
Leave all other keys (CSP, permissions, side_panel, action, etc.) unchanged.

- [ ] **Step 2: Verify JSON validity + build copies it**

Run: `node -e "const m=require('./extension/public/manifest.json'); console.log('coop:', JSON.stringify(m.cross_origin_opener_policy)); console.log('coep:', JSON.stringify(m.cross_origin_embedder_policy));"`
Expected: `coop: {"value":"same-origin"}`, `coep: {"value":"require-corp"}`.
Run: `node extension/build.mjs` → Pass 1 OK.
Run: `node -e "const m=require('./extension/dist/manifest.json'); console.log(!!m.cross_origin_opener_policy, !!m.cross_origin_embedder_policy)"` → `true true`.

- [ ] **Step 3: Commit**
```bash
git add extension/public/manifest.json
git commit -m "feat(ext): add COOP/COEP for crossOriginIsolated (threaded proving)"
```

---

## Task 3: offscreen — gated, fallback-protected Barretenberg init

**Files:** Modify `extension/public/src/offscreen.js`.

- [ ] **Step 1: Import the helper**

Near the top of `offscreen.js`, alongside the existing `./lib/` imports (e.g. `import { BRIDGE } from "./lib/bridge-config.js"`), add:
```js
import { chooseThreadCount } from "./lib/thread-count.js";
```

- [ ] **Step 2: Replace the fixed single-thread init**

Find (~`:527`) the line:
```js
  await Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: 1 });
```
Replace it with:
```js
  const _bbThreads = chooseThreadCount({
    isolated: typeof self !== "undefined" && self.crossOriginIsolated === true,
    isIOS,
    hardwareConcurrency: (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0,
    cap: 8,
  });
  try {
    await Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: _bbThreads });
  } catch (e) {
    console.warn(`[PXE] Threaded BB init (threads=${_bbThreads}) failed, falling back to single-thread:`, e?.message || e);
    await Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: 1 });
  }
  console.log(`[PXE] Barretenberg init: threads=${_bbThreads}, crossOriginIsolated=${typeof self !== "undefined" && self.crossOriginIsolated}`);
```
Also update the preceding comment block (~`:518-526`) so it no longer claims threads are disabled — note that threads are used only when `crossOriginIsolated` (COOP/COEP), with a single-thread fallback, and iOS stays single-thread.

- [ ] **Step 3: Build + verify**

Run: `node extension/build.mjs` → Pass 1 + Pass 2 (offscreen bundle) OK.
Run: `grep -n "chooseThreadCount\|crossOriginIsolated\|_bbThreads" extension/public/src/offscreen.js` → confirm wiring.
Run: `npx jest extension/test` → all green (incl. thread-count).

- [ ] **Step 4: Commit**
```bash
git add extension/public/src/offscreen.js
git commit -m "feat(ext): gated multi-thread bb init with single-thread fallback"
```

---

## Task 4: Spike measurement + manual E2E (the keep/revert gate)

This is the decision step — no automated harness can measure real proving.

- [ ] **Step 1: Build + load**

Run: `node extension/build.mjs` → all passes OK; `npx jest extension/test` → green.
Load unpacked `extension/dist` in Chrome.

- [ ] **Step 2: Confirm isolation + thread count**
  - Open the offscreen document's devtools console (chrome://extensions → the extension → "Inspect views: offscreen.html").
  - Confirm the log: `crossOriginIsolated=true` and `threads=N` with N > 1. If `crossOriginIsolated=false`, the COOP/COEP didn't take effect → investigate or revert.

- [ ] **Step 3: Measure proving speedup**
  - Run a real proving operation (e.g. a private transfer / `sendTx`, or account deploy) and note the proving/total time from the existing `reportProgress`/console timings.
  - Compare to the single-thread baseline (the same op on `main`, pre-3B). **Keep only on a clear speedup.**

- [ ] **Step 4: Regression sweep (zero tolerance)**
  - Popup opens and renders; unlock works.
  - Offscreen PXE initializes (no COEP-blocked resource errors in the offscreen console).
  - A real tx proves + lands; node RPC + faucet calls succeed.
  - The wallet-sdk dApp channel + `window.celari` provider RPC still work; bridge withdraw still executes.
  - Side panel (3A) still opens.

- [ ] **Step 5: Decide**
  - **Keep** (merge) only if Step 3 shows a speedup AND Step 4 is fully clean.
  - **Revert** otherwise: `git revert` the manifest + offscreen commits (or remove the 2 COOP/COEP keys and restore `threads: 1`). Record the measurements + the reason in the PR/notes.

- [ ] **Step 6: Record results (timings + regression checklist) in the PR description.**

---

## Self-Review Notes
- **Spec coverage:** COOP/COEP (Task 2) + gated thread count (Tasks 1+3) + fallback/no-regression (Task 3 try/catch) + measurement gate (Task 4). All spec goals mapped.
- **Safety:** double-guarded — `chooseThreadCount` returns 1 unless `crossOriginIsolated && !iOS`, and the init try/catch falls back to `threads: 1` if threaded init throws. iOS untouched.
- **Type consistency:** `chooseThreadCount({ isolated, isIOS, hardwareConcurrency, cap }) → number`; offscreen local `_bbThreads`. Consistent across Tasks 1+3.
- **Revertibility:** the whole feature is two manifest keys + one offscreen block; `git revert` of Tasks 2+3 fully restores the prior single-thread behavior.
