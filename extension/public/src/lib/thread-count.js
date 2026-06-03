// extension/public/src/lib/thread-count.js
// Decide the bb.js WASM thread count. Threaded proving needs SharedArrayBuffer,
// which requires a crossOriginIsolated context (COOP/COEP). iOS WKWebView has
// no Workers and is never isolated → single-thread.
export function chooseThreadCount({ isolated, isIOS, hardwareConcurrency, cap = 8 } = {}) {
  if (!isolated || isIOS) return 1;
  const hc = Number(hardwareConcurrency) || 4;
  return Math.max(1, Math.min(hc, cap));
}
