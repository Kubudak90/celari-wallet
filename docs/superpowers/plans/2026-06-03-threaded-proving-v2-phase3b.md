# Threaded Proving v2 (Phase 3B retry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit the bb.js threaded-WASM worker chunks into `dist/src/` so multi-thread proving can actually start, then re-enable COOP/COEP + gated threads (hardened with a timeout-race fallback) — keep only if a measured speedup with zero regressions.

**Architecture:** A dedicated esbuild pass bundles `thread.worker.js` + `main.worker.js` (from `@aztec/bb.js`) to `dist/src/` (esbuild does not auto-bundle `new Worker(new URL())` like Vite). With those present, restore the reverted COOP/COEP manifest + `chooseThreadCount` + offscreen gated init, but race the threaded init against a timeout so a worker-load hang degrades to single-thread.

**Tech Stack:** esbuild (`extension/build.mjs`), `@aztec/bb.js@4.3.0`, MV3 manifest, offscreen `Barretenberg.initSingleton`, Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-06-03-threaded-proving-v2-phase3b-design.md`
**Branch:** `feat/threaded-proving-v2` (off main; 3B v1 was reverted, so main is single-thread).

Verified context: worker sources are `node_modules/@aztec/bb.js/dest/browser/barretenberg_wasm/barretenberg_wasm_thread/factory/browser/thread.worker.js` and `…/barretenberg_wasm_main/factory/browser/main.worker.js`; the bundled offscreen calls `new Worker(new URL("./thread.worker.js"|"./main.worker.js", import.meta.url),{type:"module"})`. `build.mjs` Pass 2 already uses `loader: { ".wasm": "file" }`, `define`, `alias` (node shims), `inject: [shims/globals-shim.js]`, `format:"esm"`, `platform:"browser"`, `conditions:["browser","module"]`, and an offscreen-only `banner` (process polyfill + `OFFSCREEN_READY` + chrome listener) that workers must NOT receive. `rootDir = resolve(__dirname,"..")`, `outdir = resolve(__dirname,"dist")`.

---

## Task 1: Restore `lib/thread-count.js` + test

(The v1 revert deleted these; re-add them unchanged.)

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
git commit -m "feat(ext): restore chooseThreadCount helper (threaded proving v2)"
```

---

## Task 2: Build the bb worker chunks (`extension/build.mjs`)

**Files:** Modify `extension/build.mjs`.

- [ ] **Step 1: Add a worker build pass**

In `extension/build.mjs`, immediately AFTER the Pass-2 offscreen `build({...})` call completes (after its `console.log("  Pass 2: Offscreen bundle OK");` and the metafile logging block, before the `// --- Pass 3: iOS ...` comment ~`:191`), insert a new build call. It mirrors Pass 2's options EXCEPT it has **no banner** (workers have no `chrome.runtime`/OFFSCREEN_READY) and **no metafile**:

```js
  // --- Pass 2b: bb.js threaded-WASM workers ---
  // The bundled offscreen calls `new Worker(new URL("./thread.worker.js" |
  // "./main.worker.js", import.meta.url))`. esbuild does NOT auto-bundle these
  // (Vite does), so emit them as their own entries to dist/src/ with the same
  // browser/wasm config — minus the offscreen-only banner.
  console.log("  Pass 2b: Bundling bb.js threaded workers...");
  await build({
    entryPoints: [
      { in: resolve(rootDir, "node_modules/@aztec/bb.js/dest/browser/barretenberg_wasm/barretenberg_wasm_thread/factory/browser/thread.worker.js"), out: "src/thread.worker" },
      { in: resolve(rootDir, "node_modules/@aztec/bb.js/dest/browser/barretenberg_wasm/barretenberg_wasm_main/factory/browser/main.worker.js"), out: "src/main.worker" },
    ],
    bundle: true,
    minify: !isDev,
    sourcemap: isDev,
    outdir,
    format: "esm",
    target: ["chrome120"],
    platform: "browser",
    conditions: ["browser", "module"],
    logLevel: "info",
    ...(isDev ? {} : { drop: ["console"] }),
    define: {
      "process.env.NODE_ENV": JSON.stringify(isDev ? "development" : "production"),
      "process.env.PXE_PROVER_ENABLED": '"true"',
      "process.env.PXE_L2_BLOCK_BATCH_SIZE": '"50"',
      "process.env.NETWORK": '""',
      "process.env.BB_SKIP_CLEANUP": '""',
      "process.env.DATA_DIRECTORY": '""',
      "process.env.DATA_URL": '""',
      "global": "globalThis",
    },
    alias: {
      "crypto": resolve(__dirname, "shims/crypto-shim.js"),
      "assert": resolve(__dirname, "shims/assert-shim.js"),
      "tty": resolve(__dirname, "shims/empty-shim.js"),
      "net": resolve(__dirname, "shims/empty-shim.js"),
      "fs": resolve(__dirname, "shims/empty-shim.js"),
      "os": resolve(__dirname, "shims/empty-shim.js"),
      "child_process": resolve(__dirname, "shims/empty-shim.js"),
      "path": resolve(rootDir, "node_modules/path-browserify"),
      "stream": resolve(rootDir, "node_modules/stream-browserify"),
      "util": resolve(rootDir, "node_modules/util"),
      "buffer": resolve(rootDir, "node_modules/buffer"),
      "events": resolve(rootDir, "node_modules/events"),
    },
    inject: [resolve(__dirname, "shims/globals-shim.js")],
    loader: { ".wasm": "file" },
    resolveExtensions: [".js", ".ts", ".json"],
  });
  console.log("  Pass 2b: Workers OK");
```

If the worker source paths do not exist, STOP and report BLOCKED (verify first: `ls node_modules/@aztec/bb.js/dest/browser/barretenberg_wasm/barretenberg_wasm_thread/factory/browser/thread.worker.js`).

- [ ] **Step 2: Build and assert the chunks are emitted**

Run: `node extension/build.mjs`
Expected: `Pass 2b: Workers OK`, no esbuild errors.
Run: `ls -la extension/dist/src/thread.worker.js extension/dist/src/main.worker.js`
Expected: BOTH exist and are non-empty. If esbuild instead emitted them at a different path (e.g. `dist/thread.worker.js` without `src/`), adjust the `out:` so they land at `dist/src/thread.worker.js` / `dist/src/main.worker.js` (must match the `new URL("./thread.worker.js", import.meta.url)` resolution relative to `dist/src/offscreen.js`).
Run: `ls extension/dist/src/*.wasm 2>/dev/null; ls extension/dist/*.wasm 2>/dev/null` — note where the threaded WASM landed (the workers' `new URL(...wasm, import.meta.url)` is rewritten by esbuild's file loader; record the location for the E2E check).

- [ ] **Step 3: Commit**
```bash
git add extension/build.mjs
git commit -m "build(ext): emit bb.js thread/main worker chunks for threaded proving"
```

---

## Task 3: Offscreen gated init with timeout-race fallback

**Files:** Modify `extension/public/src/offscreen.js`.

- [ ] **Step 1: Import the helper**

Near the top of `offscreen.js`, alongside the other `./lib/` imports, add:
```js
import { chooseThreadCount } from "./lib/thread-count.js";
```

- [ ] **Step 2: Replace the single-thread init with a gated, timeout-raced one**

Find (~`:527`):
```js
  await Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: 1 });
```
Replace with:
```js
  const _bbThreads = chooseThreadCount({
    isolated: typeof self !== "undefined" && self.crossOriginIsolated === true,
    isIOS,
    hardwareConcurrency: (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0,
    cap: 8,
  });
  if (_bbThreads > 1) {
    // Race threaded init against a timeout: a missing/broken worker makes
    // initSingleton hang (not throw), so a timeout is the only safe guard.
    try {
      await Promise.race([
        Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: _bbThreads }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("threaded BB init timed out")), 20000)),
      ]);
      console.log(`[PXE] Barretenberg init: threads=${_bbThreads}, crossOriginIsolated=true`);
    } catch (e) {
      console.warn(`[PXE] Threaded BB init (threads=${_bbThreads}) failed/timed out, falling back to single-thread:`, e?.message || e);
      await Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: 1 });
      console.log("[PXE] Barretenberg init: threads=1 (fallback)");
    }
  } else {
    await Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: 1 });
    console.log(`[PXE] Barretenberg init: threads=1 (isolated=${typeof self !== "undefined" && self.crossOriginIsolated}, iOS=${isIOS})`);
  }
```
Note on the timeout fallback: if `initSingleton({threads:N})` already spawned workers and partially initialized, calling it again with `threads:1` re-inits the singleton single-threaded. `initSingleton` is idempotent/cached per bb.js; if a second call with different threads is rejected by bb.js, the catch will surface it — verify in the E2E that the fallback path actually yields a working single-thread prover (worst case, this whole feature is reverted).

- [ ] **Step 3: Update the preceding comment** (~`:518-526`)

Replace the old "always single-thread / no Workers" comment with a brief note: threads are used only when `crossOriginIsolated` (COOP/COEP → SharedArrayBuffer); a 20s timeout-race falls back to single-thread if workers don't load; iOS stays single-thread.

- [ ] **Step 4: Build + verify**

Run: `node extension/build.mjs` → Pass 1 + Pass 2 + Pass 2b OK.
Run: `grep -n "chooseThreadCount\|_bbThreads\|timed out" extension/public/src/offscreen.js` → confirm wiring.
Run: `npx jest extension/test` → green (incl. thread-count).

- [ ] **Step 5: Commit**
```bash
git add extension/public/src/offscreen.js
git commit -m "feat(ext): gated threaded bb init with 20s timeout-race fallback"
```

---

## Task 4: manifest — COOP/COEP

**Files:** Modify `extension/public/manifest.json`.

- [ ] **Step 1: Add the two top-level keys**

Add to `extension/public/manifest.json` (valid JSON, match indentation; leave everything else unchanged):
```json
"cross_origin_opener_policy": { "value": "same-origin" },
"cross_origin_embedder_policy": { "value": "require-corp" }
```

- [ ] **Step 2: Verify + build**

Run: `node -e "const m=require('./extension/public/manifest.json'); console.log(JSON.stringify(m.cross_origin_opener_policy), JSON.stringify(m.cross_origin_embedder_policy), 'sidePanel:', m.permissions.includes('sidePanel'));"`
Expected: `{"value":"same-origin"} {"value":"require-corp"} sidePanel: true`.
Run: `node extension/build.mjs` → all passes OK.
Run: `node -e "const m=require('./extension/dist/manifest.json'); console.log(!!m.cross_origin_opener_policy, !!m.cross_origin_embedder_policy)"` → `true true`.

- [ ] **Step 3: Commit**
```bash
git add extension/public/manifest.json
git commit -m "feat(ext): re-enable COOP/COEP now that worker chunks are emitted"
```

---

## Task 5: Full build + manual E2E (keep/revert gate)

- [ ] **Step 1: Build + unit suite + chunk assertion**

Run: `node extension/build.mjs` → all passes OK.
Run: `test -s extension/dist/src/thread.worker.js && test -s extension/dist/src/main.worker.js && echo "WORKERS OK"` → `WORKERS OK`.
Run: `npx jest extension/test` → green.
Load unpacked `extension/dist` in Chrome; reload the extension (manifest changed).

- [ ] **Step 2: Account creation must NOT hang (the v1 regression)**
  - Create/onboard an account. It must pass "Creating local database…" and finish (this is the exact thing that hung in v1).

- [ ] **Step 3: Confirm threading actually engaged**
  - Offscreen devtools (chrome://extensions → Inspect views: offscreen.html): no `*.worker.js` 404; `crossOriginIsolated=true`; `[PXE] Barretenberg init: threads=N` with N>1 (NOT the `(fallback)` line).

- [ ] **Step 4: Measure speedup**
  - Run a real proving op (transfer/sendTx or deploy); compare proving time to the single-thread baseline (main). Keep only on a **clear speedup**.

- [ ] **Step 5: Regression sweep (zero tolerance)**
  - popup/offscreen/PXE init; node RPC + faucet fetches; wallet-sdk + provider RPC; bridge withdraw; side panel.

- [ ] **Step 6: Decide**
  - **Keep** (merge) only if Steps 2–5 all pass with a speedup.
  - If workers 404 / init times out → it auto-falls back to single-thread (account creation still works) but there's no speedup → **revert** the COOP/COEP + worker-pass + offscreen commits, or consider approach B (Vite) separately.
  - Record timings + the threads line + regression checklist in the PR.

---

## Self-Review Notes
- **Spec coverage:** emit worker chunks (Task 2) + restore helper (Task 1) + gated init w/ timeout-race (Task 3) + COOP/COEP (Task 4) + measurement gate (Task 5). All spec goals mapped.
- **v1 fix:** Task 2 emits the previously-missing `*.worker.js`; Task 3's timeout-race converts the v1 hang into a graceful single-thread fallback (the v1 try/catch couldn't catch a hang).
- **Order safety:** the worker chunks (T2) exist before COOP/COEP (T4) flips threads on; even if a worker is broken, T3's timeout + chooseThreadCount keep proving alive.
- **Type consistency:** `chooseThreadCount({isolated,isIOS,hardwareConcurrency,cap})→number`; offscreen `_bbThreads`; worker outputs `src/thread.worker`/`src/main.worker`. Consistent across tasks.
- **Revertibility:** remove the 2 manifest keys + the Pass-2b call + restore single-thread init → back to current main.
