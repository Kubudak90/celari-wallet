# COOP/COEP Threaded Proving (Phase 3B) — Design

- **Date:** 2026-06-03
- **Status:** Approved design — ready for implementation plan
- **Branch:** `feat/coop-coep-phase3b` (off main, which has Phase 1 + 2 + 3A)
- **Nature:** **Verification-gated spike.** Keep only if manual E2E shows a measured proving speedup with zero regressions; otherwise revert (it is two manifest keys + a one-line offscreen change).

---

## 1. Background & Motivation

Proving runs in the Chrome offscreen document and is deliberately **single-threaded** today: `offscreen.js:527` does `Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: 1 })`, with comments noting the offscreen avoids Web Workers. The likely real reason is that without `crossOriginIsolated`, `SharedArrayBuffer` is unavailable, so bb.js's threaded WASM (Workers + SAB) can't run. Azguard enables COOP `same-origin` + COEP `require-corp` and runs `barretenberg-threads` for multi-core proving. This phase tries the same on Celari to speed up proving — gated on measurement.

Verified context: `@aztec/bb.js@4.3.0`; `manifest.json` has no COOP/COEP; offscreen.html loads only same-origin bundled `src/offscreen.js`; WASM is fetched same-origin (`new URL(..., import.meta.url)` + `fetch`); the node RPC and faucet are cross-origin `fetch()` (CORS mode).

---

## 2. Goals / Non-Goals

### Goals
1. Add COOP `same-origin` + COEP `require-corp` to the manifest so extension pages (incl. the offscreen document) become `crossOriginIsolated`.
2. In the offscreen prover, use a multi-threaded bb.js WASM backend **when `crossOriginIsolated` and not iOS**, capped; otherwise keep `threads: 1`.
3. Guarantee no regression: a try/catch fallback to `threads: 1` if threaded init throws, and a trivial full revert (remove the 2 manifest keys + restore `threads: 1`).
4. Provide a measurement path (manual E2E) to decide keep-vs-revert based on a real proving speedup + zero breakage.

### Non-Goals
- Changing the iOS prover (WKWebView has no Workers / won't be crossOriginIsolated; stays single-thread/main-thread).
- Reworking how the PXE/prover is wired beyond the thread count.
- Any UI change.

---

## 3. Design

### 3.1 manifest (`extension/public/manifest.json`)
Add two top-level keys:
```json
"cross_origin_opener_policy": { "value": "same-origin" },
"cross_origin_embedder_policy": { "value": "require-corp" }
```
These apply to all extension pages (popup, offscreen). The CSP, permissions, and everything else stay unchanged.

### 3.2 Pure helper (`extension/public/src/lib/thread-count.js`) — unit-tested
`chooseThreadCount({ isolated, isIOS, hardwareConcurrency, cap })`:
- returns `1` when `!isolated` OR `isIOS` (safe fallback / iOS);
- otherwise returns `Math.min(hardwareConcurrency || 4, cap)` (cap default 8), clamped to at least 1.
Pure, no globals — testable.

### 3.3 offscreen prover init (`offscreen.js`, ~`:518-527`)
Replace the fixed `threads: 1` init with a gated, fallback-protected one:
```js
const threads = chooseThreadCount({
  isolated: typeof self !== "undefined" && self.crossOriginIsolated === true,
  isIOS,
  hardwareConcurrency: (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0,
  cap: 8,
});
try {
  await Barretenberg.initSingleton({ backend: BackendType.Wasm, threads });
} catch (e) {
  console.warn(`[PXE] Threaded BB init (threads=${threads}) failed, falling back to single-thread:`, e?.message || e);
  await Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: 1 });
}
console.log(`[PXE] Barretenberg init: threads=${threads}, crossOriginIsolated=${typeof self !== "undefined" && self.crossOriginIsolated}`);
```
Update the surrounding comment (the "no Workers in offscreen" note) to reflect that threads are enabled only when `crossOriginIsolated`, with a single-thread fallback.

### 3.4 Why COEP `require-corp` is expected to be safe here
- offscreen.html and the popup load only **same-origin** (`chrome-extension://`) bundled scripts/styles/fonts/WASM → CORP-compliant.
- The Aztec node RPC and faucet are reached via `fetch()` in **CORS mode** (the default), which COEP does **not** block; COEP only blocks no-cors subresource loads. These services already serve web dApps, so they return appropriate CORS headers.
- Residual unknown: if any Aztec SDK path loads a cross-origin **no-cors** subresource, COEP would block it. This is exactly what the manual E2E must catch.

### 3.5 Error handling / safety
- Threaded init failure → automatic single-thread fallback (proving never breaks).
- `crossOriginIsolated` false (e.g., policy not applied, or a context that isn't isolated) → `threads: 1`.
- iOS → `threads: 1` regardless.
- Revert = delete the two manifest keys + set `cap`/gate so `threads` is 1 (or restore the literal `threads: 1`).

---

## 4. Verification (the decision gate)

- **Unit:** `chooseThreadCount` — `{isolated:true,isIOS:false,hardwareConcurrency:12,cap:8}→8`; `{isolated:true,isIOS:false,hardwareConcurrency:4,cap:8}→4`; `{isolated:false,...}→1`; `{isolated:true,isIOS:true,...}→1`; `{isolated:true,hardwareConcurrency:0,cap:8}→4`.
- **Manual E2E (Chrome, extension loaded) — the keep/revert decision:**
  1. Load unpacked; open the offscreen devtools console → confirm `crossOriginIsolated=true` and `threads=N (>1)` logged.
  2. Run a real proving op (e.g. a transfer/sendTx or account deploy) and **measure proving time** vs the single-thread baseline (main, before this branch). Keep only on a **clear speedup**.
  3. **Zero regressions:** popup loads; offscreen PXE initializes; proving completes; node RPC + faucet fetches work; the wallet-sdk + provider channels still function; bridge withdraw still executes.
  4. If `crossOriginIsolated` is false, init fails, no speedup, or anything breaks → **revert** (do not merge): remove the 2 manifest keys + restore single-thread.
- **Build:** `node extension/build.mjs` green; `npx jest extension/test` green (new `thread-count` test).

## 5. Files Touched
- `extension/public/manifest.json` — COOP/COEP keys.
- `extension/public/src/lib/thread-count.js` — new pure helper + `extension/test/thread-count.test.ts`.
- `extension/public/src/offscreen.js` — gated, fallback-protected Barretenberg init (thread count).

## 6. Out of Scope
- iOS prover changes.
- Replacing the WASM prover with the native (Swoirenberg) prover.
