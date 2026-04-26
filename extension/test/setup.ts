// extension/test/setup.ts
//
// Minimal chrome.* and WebCrypto stubs for unit tests. Loaded via
// jest.config.ts `setupFiles` (runs once per test file before the test
// framework). Tests that need fresh storage between assertions should
// call chrome.storage.local.clear() / chrome.storage.session.clear()
// in their own beforeEach blocks.

import { webcrypto } from "node:crypto";

const storageBackend: Record<string, Record<string, unknown>> = {
  local: {},
  session: {},
};

function mkStorageArea(name: "local" | "session") {
  return {
    get: async (keys?: string | string[] | Record<string, unknown> | null) => {
      if (keys == null) return { ...storageBackend[name] };
      const list = typeof keys === "string"
        ? [keys]
        : Array.isArray(keys)
        ? keys
        : Object.keys(keys);
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in storageBackend[name]) out[k] = storageBackend[name][k];
      return out;
    },
    set: async (obj: Record<string, unknown>) => {
      Object.assign(storageBackend[name], obj);
    },
    remove: async (keys: string | string[]) => {
      const list = typeof keys === "string" ? [keys] : keys;
      for (const k of list) delete storageBackend[name][k];
    },
    clear: async () => {
      for (const k of Object.keys(storageBackend[name])) delete storageBackend[name][k];
    },
  };
}

(globalThis as any).chrome = {
  storage: {
    local: mkStorageArea("local"),
    session: mkStorageArea("session"),
  },
  runtime: {
    sendMessage: () => Promise.resolve(undefined),
    getURL: (path: string) => `chrome-extension://test/${path}`,
    id: "test-extension-id",
    onMessage: { addListener: () => {} },
  },
};

if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}
