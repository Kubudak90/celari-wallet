// extension/public/src/lib/thread-count.js
// Decide the bb.js WASM thread count. Threaded proving needs SharedArrayBuffer,
// which requires a crossOriginIsolated context (COOP/COEP). iOS WKWebView has
// no Workers and is never isolated → single-thread.
export function chooseThreadCount({ isolated, isIOS, hardwareConcurrency, cap = 8 } = {}) {
  if (!isolated || isIOS) return 1;
  const hc = Number(hardwareConcurrency) || 4;
  return Math.max(1, Math.min(hc, cap));
}

// Decide whether bb.js should run in its Web Worker backend (BackendType.WasmWorker)
// vs in-thread (BackendType.Wasm). Threaded proving MUST use the worker backend:
// bb coordinates its thread pool with Atomics.wait, which is forbidden on a Document
// main thread and only legal inside a Worker. Use the worker backend only when we
// actually want >1 thread AND a bb worker is known to load; otherwise stay in-thread
// single-thread (which never calls Atomics.wait).
export function shouldUseWorkerBackend({ threads, workerAvailable } = {}) {
  return Number(threads) > 1 && workerAvailable === true;
}
