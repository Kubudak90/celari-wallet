// extension/public/src/lib/provider-harden.js
// Best-effort hardening for the injected provider object (mirrors the
// industry-standard approach: non-writable definition + re-assert on load
// lifecycle + second-handshake detection). `win` is injected so this is unit
// testable without a real DOM.

export function installHardenedProvider(win, key, api, deps = {}) {
  const defineProperty = deps.defineProperty || Object.defineProperty;

  const reassert = () => {
    if (win[key] === api) return;
    try {
      defineProperty(win, key, {
        value: api,
        writable: false,
        configurable: false,
        enumerable: true,
      });
    } catch {
      // Property already exists as something non-configurable we cannot
      // override — nothing more we can safely do.
    }
  };

  reassert();

  if (typeof win.addEventListener === "function") {
    for (const ev of ["DOMContentLoaded", "load", "readystatechange"]) {
      try { win.addEventListener(ev, reassert, true); } catch {}
    }
  }

  return { reassert };
}

export function createHandshakeGuard() {
  let established = false;
  return {
    markEstablished() { established = true; },
    isSecondHandshake() { return established; },
    reset() { established = false; },
  };
}
