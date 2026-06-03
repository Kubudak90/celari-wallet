# Threaded Proving v2 (Phase 3B, retry) — Design

- **Date:** 2026-06-03
- **Status:** Approved design — ready for implementation plan
- **Branch:** `feat/threaded-proving-v2` (off main, which has Phase 1/2/3A; 3B v1 was reverted)
- **Nature:** **Verification-gated spike** (same keep/revert rule as v1).

---

## 1. Background & Motivation

Phase 3B v1 (COOP/COEP + `threads>1`) was merged then **reverted** because it hung PXE init. Root cause (confirmed): with `crossOriginIsolated`, `Barretenberg.initSingleton({threads:N})` spawns workers via `new Worker(new URL("./thread.worker.js" | "./main.worker.js", import.meta.url), {type:"module"})`, **but the esbuild offscreen bundle never emits those `*.worker.js` chunks into `dist/src/`** → the workers 404 → init hangs (not a throw, so the try/catch fallback never fired). UI froze at the last `initStep` ("Creating local database…", `offscreen.js:503`) because the next `await` is the bb init.

Key insight: **esbuild does not auto-bundle `new Worker(new URL(...))` workers** (Vite/Rollup does — that is why Azguard's Vite build ships `main.worker-*.js` / `thread.worker-*.js` and threaded bb works in its offscreen). Celari's esbuild **already** emits `.wasm` via a `file` loader and resolves `new URL(file.wasm, import.meta.url)` (`build.mjs:165,194,240`), so the WASM side is solved — only the worker `.js` chunks are missing.

Verified: the bb.js worker sources are small ESM modules at
`node_modules/@aztec/bb.js/dest/browser/barretenberg_wasm/barretenberg_wasm_thread/factory/browser/thread.worker.js` and `…/barretenberg_wasm_main/factory/browser/main.worker.js`; the factory `index.js` does the `new Worker(new URL('./thread.worker.js', import.meta.url))`.

---

## 2. Goals / Non-Goals

### Goals
1. Make the build emit self-contained `dist/src/thread.worker.js` and `dist/src/main.worker.js` (+ their threaded WASM) so the runtime `new URL("./<x>.worker.js", import.meta.url)` resolves.
2. Re-introduce the (reverted) 3B runtime gating: COOP/COEP manifest, `chooseThreadCount`, and the offscreen gated init with single-thread fallback — now that the workers exist.
3. Keep proving working no matter what: single-thread fallback on any failure; trivial full revert.
4. Decide keep-vs-revert via manual E2E (workers load, `crossOriginIsolated=true`, `threads>1`, proving faster, zero regressions).

### Non-Goals
- Switching the offscreen build to Vite/Rollup (heavier; only if approach A proves unworkable).
- iOS threaded proving (WKWebView: no Workers / not isolated → stays single-thread).
- The native (Swoirenberg) prover — separate track.

---

## 3. Design

### 3.1 Build: emit the worker chunks (`extension/build.mjs`)
Add two entry points to the offscreen (Pass-2-style, `bundle:true`) build so the workers are emitted next to `offscreen.js`:
- `{ in: "node_modules/@aztec/bb.js/dest/browser/barretenberg_wasm/barretenberg_wasm_thread/factory/browser/thread.worker.js", out: "src/thread.worker" }`
- `{ in: "node_modules/@aztec/bb.js/dest/browser/barretenberg_wasm/barretenberg_wasm_main/factory/browser/main.worker.js", out: "src/main.worker" }`

Each built with the **same** options as the offscreen bundle that matter for this: `bundle:true`, `format:"esm"`, `platform:"browser"`, `conditions:["browser","module"]`, `target:["chrome120"]`, and the `.wasm` `file` loader (so the threaded WASM the workers import is emitted to `dist/src/` and resolved via `import.meta.url`). Output names must produce exactly `dist/src/thread.worker.js` and `dist/src/main.worker.js` (matching the `new URL("./thread.worker.js" | "./main.worker.js", …)` strings in the bundled offscreen).

Decision: add them as extra `entryPoints` in the existing Pass-2 `build({...})` call (shared config) if the resulting outputs land at `src/thread.worker.js`/`src/main.worker.js`; otherwise a dedicated `build({...})` call mirroring Pass-2's options. The plan picks based on what esbuild emits.

### 3.2 Re-introduce the reverted 3B runtime pieces
Restore the three reverted commits' content (now safe because the workers exist):
- `extension/public/manifest.json`: `cross_origin_opener_policy: { value: "same-origin" }` + `cross_origin_embedder_policy: { value: "require-corp" }`.
- `extension/public/src/lib/thread-count.js` + `extension/test/thread-count.test.ts` (the pure `chooseThreadCount` helper, unchanged from v1).
- `extension/public/src/offscreen.js`: the gated init — `threads = chooseThreadCount({ isolated: self.crossOriginIsolated, isIOS, hardwareConcurrency, cap:8 })`, `try { initSingleton({threads}) } catch { initSingleton({threads:1}) }`, + the diagnostic log.

These can be brought back by `git cherry-pick`/re-applying the reverted commits (`22c08fb`, `7e0eba6`, `705495b`) or re-writing them; the plan specifies exact content so they are reproduced regardless.

### 3.3 Fallback & safety
- If a worker still fails to load (404 or load error), `Barretenberg.initSingleton({threads:N})` could still **hang** rather than throw — the try/catch alone won't save it. Therefore add a **timeout guard** around the threaded init: race the threaded `initSingleton` against a timeout (e.g. 20s); on timeout, fall back to `initSingleton({threads:1})`. This converts a hang into a graceful single-thread fallback (this is the lesson from v1). The plan implements the race.
- `crossOriginIsolated` false / iOS → `threads:1` (no workers spawned).
- Full revert = remove COOP/COEP + the 2 worker entries + restore single-thread.

### 3.4 Why this should work where v1 didn't
v1 enabled `threads>1` but the worker chunks didn't exist → hang. v2 emits the worker chunks (+ their WASM) into `dist/src/` first, so `new URL("./thread.worker.js", import.meta.url)` resolves. esbuild already proves it can emit WASM + resolve `import.meta.url`; the workers are tiny ESM modules esbuild can bundle as entries.

---

## 4. Verification (keep/revert gate)

- **Unit:** `chooseThreadCount` (same tests as v1).
- **Build assertion:** after `node extension/build.mjs`, `dist/src/thread.worker.js` and `dist/src/main.worker.js` **exist** and are non-empty; the threaded WASM is present in `dist/src/`.
- **Manual E2E (Chrome) — the decision:**
  1. Reload unpacked; open offscreen devtools. Confirm: no `*.worker.js` 404 in the console; `crossOriginIsolated=true`; `threads=N (>1)` logged; account creation passes "Creating local database…".
  2. Run a real proving op; measure vs the single-thread baseline → keep only on a **clear speedup**.
  3. Zero regressions: popup/offscreen/PXE init, node RPC + faucet fetches, wallet-sdk + provider RPC, bridge withdraw, side panel.
  4. If workers 404 / init times out → falls back to single-thread automatically (no hang). If no speedup or any regression → **revert** (remove COOP/COEP + worker entries + restore single-thread); record findings; consider approach B (Vite) only if pursuing further.

## 5. Files Touched
- `extension/build.mjs` — two worker entry points (emit `src/{thread,main}.worker.js`).
- `extension/public/manifest.json` — COOP/COEP.
- `extension/public/src/lib/thread-count.js` + `extension/test/thread-count.test.ts` — restored.
- `extension/public/src/offscreen.js` — gated init **with a timeout-race fallback** (hardened vs v1's hang).

## 6. Out of Scope
- Vite migration (approach B); native prover; iOS threading.
