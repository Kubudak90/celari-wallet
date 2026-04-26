# Extension Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox `- [ ]` syntax.

**Goal:** Add unit tests for security-critical extension paths. See spec at `docs/superpowers/specs/2026-04-25-extension-test-infrastructure-design.md`.

**Architecture:** Extract pure helpers from popup.js + background.js into `extension/public/src/lib/` ESM modules; unit-test each. Add a Jest setup file with minimal `chrome.*` and WebAuthn stubs. Update `jest.config.ts` to include `extension/test/**`.

**Tech Stack:** Jest 29 + ts-jest ESM, Node 20+ (`crypto.webcrypto`), hand-rolled chrome mocks.

---

## Task 1: Wire jest config + setup file

**Files:**
- Modify: `jest.config.ts`
- Create: `extension/test/setup.ts`

- [ ] **Step 1: Setup file with chrome mock**

```typescript
// extension/test/setup.ts
//
// Minimal chrome.* and navigator.credentials stubs for unit tests.
// Each test can override individual methods with jest.spyOn.

const storageBackend: Record<string, Record<string, unknown>> = {
  local: {},
  session: {},
};

function mkStorageArea(name: "local" | "session") {
  return {
    get: jest.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
      if (keys == null) return { ...storageBackend[name] };
      const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in storageBackend[name]) out[k] = storageBackend[name][k];
      return out;
    }),
    set: jest.fn(async (obj: Record<string, unknown>) => {
      Object.assign(storageBackend[name], obj);
    }),
    remove: jest.fn(async (keys: string | string[]) => {
      const list = typeof keys === "string" ? [keys] : keys;
      for (const k of list) delete storageBackend[name][k];
    }),
    clear: jest.fn(async () => {
      for (const k of Object.keys(storageBackend[name])) delete storageBackend[name][k];
    }),
  };
}

(globalThis as any).chrome = {
  storage: {
    local: mkStorageArea("local"),
    session: mkStorageArea("session"),
  },
  runtime: {
    sendMessage: jest.fn(),
    getURL: (path: string) => `chrome-extension://test/${path}`,
    id: "test-extension-id",
    onMessage: { addListener: jest.fn() },
  },
};

// Reset storage between tests so isolation is automatic
beforeEach(() => {
  storageBackend.local = {};
  storageBackend.session = {};
});

// Make Node's WebCrypto available as globalThis.crypto for the lib modules
import { webcrypto } from "node:crypto";
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}
```

- [ ] **Step 2: Jest config**

Edit `jest.config.ts`:

```typescript
  testMatch: ["**/test/**/*.test.ts", "**/__tests__/**/*.test.ts"],
  setupFilesAfterEach: ["<rootDir>/extension/test/setup.ts"],
```

The `testMatch` already covers `extension/test/**/*.test.ts` because of the existing `**/test/**/*.test.ts` glob — verify, then just add the setup file.

- [ ] **Step 3: Sanity-run jest**

```bash
cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası 2/.worktrees/ext-tests"
npx jest --listTests 2>&1 | head
```

Expect: existing branding/bridge tests are listed; no new tests yet (next tasks add them).

- [ ] **Step 4: Commit**

```bash
git add jest.config.ts extension/test/setup.ts
git commit -m "test(extension): jest setup file with chrome.* + WebCrypto stubs"
```

---

## Task 2: Test passkey-crypto.js

**Files:**
- Create: `extension/test/passkey-crypto.test.ts`

- [ ] **Step 1: Round-trip + edge case coverage**

```typescript
// extension/test/passkey-crypto.test.ts

import {
  generatePrfSalt,
  encryptWithKek,
  decryptWithKek,
  bytesToBase64,
  base64ToBytes,
  base64UrlToBytes,
} from "../public/src/lib/passkey-crypto.js";

async function fakeKek(seed = 0): Promise<CryptoKey> {
  // Deterministic 32-byte key for tests — NOT for production
  const raw = new Uint8Array(32);
  for (let i = 0; i < 32; i++) raw[i] = (i + seed) & 0xff;
  return crypto.subtle.importKey(
    "raw", raw,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt", "decrypt"],
  );
}

describe("passkey-crypto", () => {
  describe("generatePrfSalt", () => {
    it("returns 32 bytes", () => {
      expect(generatePrfSalt().length).toBe(32);
    });

    it("returns different bytes on each call (randomness sanity)", () => {
      const a = bytesToBase64(generatePrfSalt());
      const b = bytesToBase64(generatePrfSalt());
      expect(a).not.toBe(b);
    });
  });

  describe("base64 codec", () => {
    it("bytesToBase64 round-trips through base64ToBytes", () => {
      const input = new Uint8Array([1, 2, 3, 250, 0, 255]);
      const b64 = bytesToBase64(input);
      const out = base64ToBytes(b64);
      expect(Array.from(out)).toEqual(Array.from(input));
    });

    it("base64UrlToBytes accepts unpadded base64url", () => {
      // base64url of "hello" is "aGVsbG8" (no padding) — should decode the same
      const padded = base64ToBytes("aGVsbG8=");
      const unpadded = base64UrlToBytes("aGVsbG8");
      expect(Array.from(padded)).toEqual(Array.from(unpadded));
    });

    it("base64UrlToBytes maps -/_ back to +/", () => {
      // "?>?<" base64url-encoded contains - and _
      const original = new Uint8Array([0x3e, 0x3f]);
      const url = "Pj8"; // base64url of those bytes
      const standard = "Pj8="; // base64 of those bytes
      expect(Array.from(base64UrlToBytes(url))).toEqual(Array.from(base64ToBytes(standard)));
    });
  });

  describe("AES-GCM round-trip", () => {
    it("encryptWithKek + decryptWithKek returns the original plaintext", async () => {
      const kek = await fakeKek();
      const blob = await encryptWithKek(kek, "hello celari");
      const out = await decryptWithKek(kek, blob);
      expect(out).toBe("hello celari");
    });

    it("encryption produces fresh IVs per call (no IV reuse)", async () => {
      const kek = await fakeKek();
      const a = await encryptWithKek(kek, "same plaintext");
      const b = await encryptWithKek(kek, "same plaintext");
      expect(a.iv).not.toBe(b.iv);
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it("schema field is set to aes-gcm-prf-v1", async () => {
      const kek = await fakeKek();
      const blob = await encryptWithKek(kek, "x");
      expect(blob.schema).toBe("aes-gcm-prf-v1");
    });

    it("decryptWithKek throws on tampered ciphertext", async () => {
      const kek = await fakeKek();
      const blob = await encryptWithKek(kek, "secret");
      const tampered = { ...blob, ciphertext: blob.ciphertext.replace(/.$/, "A") };
      await expect(decryptWithKek(kek, tampered)).rejects.toBeDefined();
    });

    it("decryptWithKek throws on wrong KEK", async () => {
      const kek1 = await fakeKek(0);
      const kek2 = await fakeKek(1);
      const blob = await encryptWithKek(kek1, "secret");
      await expect(decryptWithKek(kek2, blob)).rejects.toBeDefined();
    });

    it("decryptWithKek throws on unknown schema", async () => {
      const kek = await fakeKek();
      const blob = await encryptWithKek(kek, "x");
      const wrongSchema = { ...blob, schema: "future-v9" };
      await expect(decryptWithKek(kek, wrongSchema as any)).rejects.toThrow(/schema/);
    });

    it("survives unicode plaintext", async () => {
      const kek = await fakeKek();
      const text = "🔐 Türkçe karakterler é è ñ あいう 中文";
      const blob = await encryptWithKek(kek, text);
      expect(await decryptWithKek(kek, blob)).toBe(text);
    });
  });
});
```

- [ ] **Step 2: Run**

```bash
npx jest extension/test/passkey-crypto.test.ts 2>&1 | tail -20
```

Expect: 9+ passing tests.

- [ ] **Step 3: Commit**

```bash
git add extension/test/passkey-crypto.test.ts
git commit -m "test(extension): unit tests for passkey-crypto.js (12 cases)"
```

---

## Task 3: Extract + test sanitize.js

**Files:**
- Create: `extension/public/src/lib/sanitize.js`
- Modify: `extension/public/src/background.js` (replace inline `sanitizeRpcError` with import)
- Create: `extension/test/sanitize.test.ts`

- [ ] **Step 1: Extract module**

```javascript
// extension/public/src/lib/sanitize.js
//
// Strips URL/IP/file-path/node-version-banner leaks from error messages
// before they leave the service worker (toast / dApp response).

export function sanitizeRpcError(err) {
  let msg;
  if (err && typeof err.message === "string") msg = err.message;
  else if (typeof err === "string") msg = err;
  else if (err == null) msg = "";
  else { try { msg = JSON.stringify(err); } catch { msg = String(err); } }
  const stackIdx = msg.indexOf("\n    at ");
  if (stackIdx > -1) msg = msg.slice(0, stackIdx);
  let clean = msg
    .replace(/https?:\/\/[^\s)]+/g, "<url>")
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "<ip>")
    .replace(/\/[A-Za-z0-9_\-./]+\.(js|ts|wasm|json)/g, "<file>")
    .replace(/aztec[_-]?node[_-]?version[: ]+[^\s,)]+/gi, "<node>");
  if (clean.length > 240) clean = clean.slice(0, 240) + "...";
  return clean;
}
```

- [ ] **Step 2: Update background.js**

Find the existing inline `function sanitizeRpcError(err) { ... }` in `background.js` (around line 339). Delete it. At the top of the file (after the imports / state section), add:

```javascript
// Note: background.js is a service worker module — use static import
import { sanitizeRpcError } from "./lib/sanitize.js";
```

(Verify with `grep -n "sanitizeRpcError" extension/public/src/background.js` that all callers still resolve.)

- [ ] **Step 3: Tests**

```typescript
// extension/test/sanitize.test.ts

import { sanitizeRpcError } from "../public/src/lib/sanitize.js";

describe("sanitizeRpcError", () => {
  it("strips https URLs", () => {
    expect(sanitizeRpcError(new Error("fetch failed at https://rpc.example.com:9999/path"))).toContain("<url>");
  });

  it("strips http URLs", () => {
    expect(sanitizeRpcError(new Error("connect ECONNREFUSED http://localhost:8080"))).toContain("<url>");
  });

  it("strips IPv4 addresses", () => {
    expect(sanitizeRpcError(new Error("connect failed to 192.168.1.1"))).toContain("<ip>");
  });

  it("strips file paths to .js/.ts/.wasm/.json", () => {
    const out = sanitizeRpcError(new Error("error in /Users/foo/bar.js:42"));
    expect(out).toContain("<file>");
    expect(out).not.toContain("/Users/foo");
  });

  it("strips aztec node-version banner", () => {
    expect(sanitizeRpcError(new Error("rejected by aztec_node_version: v1.2.3-rc"))).toContain("<node>");
  });

  it("truncates to 240 chars + ellipsis", () => {
    const long = "x".repeat(500);
    const out = sanitizeRpcError(new Error(long));
    expect(out.length).toBeLessThanOrEqual(243);
    expect(out.endsWith("...")).toBe(true);
  });

  it("strips stack frames after first '    at '", () => {
    const out = sanitizeRpcError(new Error("boom\n    at foo (file.js:1)\n    at bar (file.js:2)"));
    expect(out).not.toContain("at foo");
  });

  it("handles null input", () => {
    expect(sanitizeRpcError(null)).toBe("");
  });

  it("handles undefined input", () => {
    expect(sanitizeRpcError(undefined)).toBe("");
  });

  it("handles plain string error", () => {
    expect(sanitizeRpcError("just a string")).toBe("just a string");
  });

  it("handles object with non-string message", () => {
    const out = sanitizeRpcError({ message: { code: 429, url: "https://x.com" } } as any);
    // Should not throw — falls back to JSON.stringify
    expect(typeof out).toBe("string");
  });

  it("preserves benign messages unchanged", () => {
    expect(sanitizeRpcError(new Error("Wallet is locked"))).toBe("Wallet is locked");
  });
});
```

- [ ] **Step 4: Build + run + commit**

```bash
node extension/build.mjs   # ensure background.js still bundles
npx jest extension/test/sanitize.test.ts 2>&1 | tail
git add extension/public/src/lib/sanitize.js extension/public/src/background.js extension/test/sanitize.test.ts
git commit -m "test(extension): extract + unit-test sanitizeRpcError (12 cases)"
```

---

## Task 4: Extract + test account-schema.js

**Files:**
- Create: `extension/public/src/lib/account-schema.js`
- Modify: `extension/public/src/pages/popup.js` (use the helper)
- Create: `extension/test/account-schema.test.ts`

- [ ] **Step 1: Extract module**

```javascript
// extension/public/src/lib/account-schema.js
//
// Validates celari_accounts entries and detects v0.5 (plaintext) → v0.6
// (encrypted) schema bumps. Pure functions — no chrome.* dependency.

export function detectLegacyPlaintext(accounts) {
  if (!Array.isArray(accounts)) return false;
  return accounts.some(
    a => a?.type === "passkey" && (a.secretKey || a.privateKeyPkcs8),
  );
}

export function validateAccountsArray(accounts) {
  if (!Array.isArray(accounts)) {
    throw new Error("celari_accounts is not an array");
  }
  for (const a of accounts) {
    if (!a || typeof a !== "object" || !a.address) {
      throw new Error("celari_accounts entry missing address");
    }
    if (a.type === "passkey") {
      if (!a.encryptedSecret || !a.encryptedPrivateKey || !a.prfSalt) {
        throw new Error("passkey account missing encrypted fields");
      }
    }
  }
  return true;
}

export function purgePending(accounts) {
  return accounts.filter(a => !a.address?.includes("_pending"));
}
```

- [ ] **Step 2: Use in popup.js**

In `popup.js init()`, find the schema validation block (search `hasLegacyPlaintext`). Replace the inline logic with calls to the helpers:

```javascript
import { detectLegacyPlaintext, validateAccountsArray, purgePending } from "../lib/account-schema.js";

// ... inside init() ...
if (stored.celari_accounts !== undefined) {
  if (detectLegacyPlaintext(stored.celari_accounts)) {
    await chrome.storage.local.remove(["celari_accounts", "celari_locked"]);
    store.accounts = [];
    legacyWiped = true;
  } else {
    validateAccountsArray(stored.celari_accounts); // throws on invalid shape
    const clean = purgePending(stored.celari_accounts);
    store.accounts = clean;
    if (clean.length !== stored.celari_accounts.length) {
      await chrome.storage.local.set({ celari_accounts: clean });
    }
  }
}
```

(The surrounding `try { ... } catch (e) { storageError = ... }` block stays.)

- [ ] **Step 3: Tests**

```typescript
// extension/test/account-schema.test.ts

import {
  detectLegacyPlaintext,
  validateAccountsArray,
  purgePending,
} from "../public/src/lib/account-schema.js";

describe("account-schema", () => {
  describe("detectLegacyPlaintext", () => {
    it("returns true for passkey account with secretKey", () => {
      expect(detectLegacyPlaintext([{ type: "passkey", address: "0x1", secretKey: "x" }])).toBe(true);
    });

    it("returns true for passkey account with privateKeyPkcs8", () => {
      expect(detectLegacyPlaintext([{ type: "passkey", address: "0x1", privateKeyPkcs8: "x" }])).toBe(true);
    });

    it("returns false for fully encrypted passkey account", () => {
      expect(detectLegacyPlaintext([{
        type: "passkey",
        address: "0x1",
        encryptedSecret: { iv: "i", ciphertext: "c", schema: "aes-gcm-prf-v1" },
        encryptedPrivateKey: { iv: "i", ciphertext: "c", schema: "aes-gcm-prf-v1" },
        prfSalt: "salt",
      }])).toBe(false);
    });

    it("returns false for demo accounts (no secrets to leak)", () => {
      expect(detectLegacyPlaintext([{ type: "demo", address: "0xd" }])).toBe(false);
    });

    it("returns false for empty array", () => {
      expect(detectLegacyPlaintext([])).toBe(false);
    });

    it("returns false for non-array input", () => {
      expect(detectLegacyPlaintext(null as any)).toBe(false);
      expect(detectLegacyPlaintext("garbage" as any)).toBe(false);
    });
  });

  describe("validateAccountsArray", () => {
    it("accepts a valid passkey-only array", () => {
      expect(validateAccountsArray([{
        type: "passkey",
        address: "0x1",
        encryptedSecret: {}, encryptedPrivateKey: {}, prfSalt: "s",
      }])).toBe(true);
    });

    it("throws on non-array", () => {
      expect(() => validateAccountsArray("garbage" as any)).toThrow(/not an array/);
    });

    it("throws on entry missing address", () => {
      expect(() => validateAccountsArray([{ type: "passkey" } as any])).toThrow(/missing address/);
    });

    it("throws on passkey account missing encryptedSecret", () => {
      expect(() => validateAccountsArray([{
        type: "passkey", address: "0x1",
        encryptedPrivateKey: {}, prfSalt: "s",
      } as any])).toThrow(/missing encrypted fields/);
    });

    it("accepts demo accounts without encryption fields", () => {
      expect(validateAccountsArray([{ type: "demo", address: "0xd" }])).toBe(true);
    });
  });

  describe("purgePending", () => {
    it("removes accounts whose address contains _pending", () => {
      const out = purgePending([
        { address: "0x1" },
        { address: "0x2_pending" },
        { address: "0x3" },
      ]);
      expect(out.length).toBe(2);
      expect(out.map(a => a.address)).toEqual(["0x1", "0x3"]);
    });
  });
});
```

- [ ] **Step 4: Build + run + commit**

```bash
node extension/build.mjs
npx jest extension/test/account-schema.test.ts 2>&1 | tail
git add extension/public/src/lib/account-schema.js extension/public/src/pages/popup.js extension/test/account-schema.test.ts
git commit -m "test(extension): extract + unit-test account schema validators"
```

---

## Task 5: Extract + test faucet-cooldown.js

**Files:**
- Create: `extension/public/src/lib/faucet-cooldown.js`
- Modify: `extension/public/src/pages/popup.js`
- Create: `extension/test/faucet-cooldown.test.ts`

- [ ] **Step 1: Extract pure helper**

```javascript
// extension/public/src/lib/faucet-cooldown.js
//
// Computes remaining cooldown ms given a last-faucet timestamp.

export const FAUCET_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export function remainingCooldownMs(lastFaucetTime, now = Date.now(), cooldownMs = FAUCET_COOLDOWN_MS) {
  const last = Number(lastFaucetTime) || 0;
  return Math.max(0, (last + cooldownMs) - now);
}

export function cooldownMinutes(remainingMs) {
  return Math.ceil(remainingMs / 60000);
}
```

- [ ] **Step 2: Use in popup.js**

Find the existing `getFaucetCooldownMs` and `FAUCET_COOLDOWN_MS` (search `FAUCET_COOLDOWN_MS\\|getFaucetCooldownMs` in popup.js). Replace the inline cooldown math with imports:

```javascript
import { remainingCooldownMs, cooldownMinutes, FAUCET_COOLDOWN_MS } from "../lib/faucet-cooldown.js";

async function getFaucetCooldownMs() {
  try {
    const r = await chrome.runtime.sendMessage({ type: "GET_FAUCET_RATE" });
    return remainingCooldownMs(r?.lastFaucetTime);
  } catch (e) {
    return 0;
  }
}
```

And in the dashboard render and toast call sites, replace `Math.ceil(.../60000)` with `cooldownMinutes(...)` — find them with grep.

- [ ] **Step 3: Tests**

```typescript
// extension/test/faucet-cooldown.test.ts

import {
  remainingCooldownMs,
  cooldownMinutes,
  FAUCET_COOLDOWN_MS,
} from "../public/src/lib/faucet-cooldown.js";

describe("faucet-cooldown", () => {
  it("returns 0 when no last-faucet timestamp", () => {
    expect(remainingCooldownMs(0)).toBe(0);
    expect(remainingCooldownMs(null as any)).toBe(0);
    expect(remainingCooldownMs(undefined as any)).toBe(0);
  });

  it("returns 0 when cooldown has expired", () => {
    const now = 1_000_000_000_000;
    const last = now - FAUCET_COOLDOWN_MS - 1000;
    expect(remainingCooldownMs(last, now)).toBe(0);
  });

  it("returns correct remaining ms when active", () => {
    const now = 1_000_000_000_000;
    const last = now - 30 * 60 * 1000; // 30 min ago
    expect(remainingCooldownMs(last, now)).toBe(30 * 60 * 1000);
  });

  it("clamps negative timestamps to 0 remaining", () => {
    const now = 1_000_000_000_000;
    const last = now + 60 * 60 * 1000; // future timestamp (clock skew)
    expect(remainingCooldownMs(last, now)).toBeGreaterThan(0);
  });

  it("FAUCET_COOLDOWN_MS is 1 hour", () => {
    expect(FAUCET_COOLDOWN_MS).toBe(3600 * 1000);
  });

  describe("cooldownMinutes", () => {
    it("rounds up to whole minutes", () => {
      expect(cooldownMinutes(60_000)).toBe(1);
      expect(cooldownMinutes(60_001)).toBe(2);
      expect(cooldownMinutes(0)).toBe(0);
    });

    it("handles full cooldown duration", () => {
      expect(cooldownMinutes(FAUCET_COOLDOWN_MS)).toBe(60);
    });
  });
});
```

- [ ] **Step 4: Build + run + commit**

```bash
node extension/build.mjs
npx jest extension/test/faucet-cooldown.test.ts 2>&1 | tail
git add extension/public/src/lib/faucet-cooldown.js extension/public/src/pages/popup.js extension/test/faucet-cooldown.test.ts
git commit -m "test(extension): extract + unit-test faucet cooldown math"
```

---

## Task 6: Final integration — full test run + smoke build

**Files:**
- None (verification only).

- [ ] **Step 1: Run all tests**

```bash
cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası 2/.worktrees/ext-tests"
npx jest extension/test/ 2>&1 | tail -20
```

Expect: 4 test files, ~35+ passing assertions.

- [ ] **Step 2: Build sanity**

```bash
node extension/build.mjs
```

Expect: clean 3-pass build with all extracted libs in `dist/src/lib/`.

- [ ] **Step 3: Verify popup.js still works**

Reload extension in `chrome://extensions`, smoke-test a few flows (lock/unlock, send tx, faucet button, settings toggle). The extracted modules should be drop-in replacements with no behavior change.

- [ ] **Step 4: If passing, hand off**

Use `superpowers:finishing-a-development-branch`.

---

## Notes for executing engineer

- Each Task is independently committable.
- Use grep for symbol locations — don't read whole files.
- Keep the extraction surgical: `git diff` before/after should show ONLY the inline-to-import swap and the new lib module.
- If a behavior change leaks in (typos, off-by-one), tests should catch it on first run.
- The whole plan should land in 4-6 commits; if you find yourself making more, re-evaluate scope.
