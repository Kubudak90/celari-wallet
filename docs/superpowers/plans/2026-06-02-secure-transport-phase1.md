# Celari Secure dApp Transport — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt and harden the `window.celari` provider channel (delete the plaintext path), implement its missing background handlers, and fix the bridge-withdraw bug — without changing the website's public API surface.

**Architecture:** `window.celari` keeps its method names but speaks over an ECDH-P-256/AES-GCM encrypted channel that reuses the exact crypto scheme already used by the wallet-sdk channel. The inpage script plays the "app" role, the background the "wallet" role; the content script is a pure MessagePort relay. The crypto scheme is extracted into one tested module shared by both sides.

**Tech Stack:** Vanilla JS (MV3 service worker + content script + page-injected module), WebCrypto (`crypto.subtle`), esbuild (`extension/build.mjs`), Jest + ts-jest (`extension/test/`).

**Spec:** `docs/superpowers/specs/2026-06-02-celari-secure-transport-phase1.md`

---

## File Structure

**New (all under `extension/public/src/lib/`, delivered to `dist/src/lib/` via `build.mjs:270` `cpSync`):**
- `lib/ws-crypto.js` — canonical ECDH/HKDF/AES helpers (extracted from `background.js:43-137`). Single source of truth.
- `lib/provider-protocol.js` — provider message-type constants + request-id generator.
- `lib/provider-harden.js` — `installHardenedProvider()` + `createHandshakeGuard()` (pure, DOM-agnostic).
- `lib/provider-accounts.js` — `selectActiveAddress()` (pure).

**New tests (`extension/test/`):**
- `ws-crypto.test.ts`, `provider-protocol.test.ts`, `provider-harden.test.ts`, `provider-accounts.test.ts`.

**Modified:**
- `extension/public/src/background.js` — import shared crypto; add `provider-*` session cases + `handleProviderMethod()`.
- `extension/public/src/content.js` — delete plaintext legacy path; add `provider-*` relay.
- `extension/public/src/inpage.js` — full rewrite: hardened provider + encrypted lazy-handshake client.
- `extension/build.mjs` — build `inpage.js` in a `bundle:true` pass so `lib/*` imports inline.

**Verify-only (no edit expected):**
- `extension/public/manifest.json` — `run_at:"document_start"` + inpage in `web_accessible_resources` already present.
- `website/src/hooks/*` — public API unchanged; smoke-tested only.

---

## Task 1: Extract canonical crypto module (`lib/ws-crypto.js`)

**Files:**
- Create: `extension/public/src/lib/ws-crypto.js`
- Test: `extension/test/ws-crypto.test.ts`

- [ ] **Step 1: Write the failing test**

Create `extension/test/ws-crypto.test.ts`:

```ts
// extension/test/ws-crypto.test.ts
import { describe, it, expect, beforeAll } from "@jest/globals";
import { webcrypto } from "crypto";

// ws-crypto.js uses the global `crypto` (as a service worker does). Ensure it exists in the node test env.
beforeAll(() => {
  if (!(globalThis as any).crypto?.subtle) (globalThis as any).crypto = webcrypto;
});

import {
  wsGenerateKeyPair,
  wsExportPublicKey,
  wsImportPublicKey,
  wsDeriveSessionKeys,
  wsEncrypt,
  wsDecrypt,
} from "../public/src/lib/ws-crypto.js";

describe("ws-crypto", () => {
  it("derives identical session keys on app and wallet sides (isApp symmetry)", async () => {
    const app = await wsGenerateKeyPair();
    const wallet = await wsGenerateKeyPair();
    const appPubExp = await wsExportPublicKey(app.publicKey);
    const walletPubExp = await wsExportPublicKey(wallet.publicKey);

    const appSide = await wsDeriveSessionKeys(app, await wsImportPublicKey(walletPubExp), true);
    const walletSide = await wsDeriveSessionKeys(wallet, await wsImportPublicKey(appPubExp), false);

    // Same verification fingerprint => same derived secret => same salt ordering.
    expect(appSide.verificationHash).toEqual(walletSide.verificationHash);
  });

  it("round-trips an encrypted message app -> wallet", async () => {
    const app = await wsGenerateKeyPair();
    const wallet = await wsGenerateKeyPair();
    const appSide = await wsDeriveSessionKeys(app, wallet.publicKey, true);
    const walletSide = await wsDeriveSessionKeys(wallet, app.publicKey, false);

    const payload = JSON.stringify({ method: "GET_ADDRESS", requestId: "celari_1_42" });
    const enc = await wsEncrypt(appSide.encryptionKey, payload);
    expect(typeof enc.iv).toBe("string");
    expect(typeof enc.ciphertext).toBe("string");

    const dec = await wsDecrypt(walletSide.encryptionKey, enc);
    expect(dec).toEqual({ method: "GET_ADDRESS", requestId: "celari_1_42" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest extension/test/ws-crypto.test.ts`
Expected: FAIL — `Cannot find module '../public/src/lib/ws-crypto.js'`.

- [ ] **Step 3: Write the module**

Create `extension/public/src/lib/ws-crypto.js` (transcribed verbatim from `background.js:43-137`, with the public functions exported and `_ws` prefixes dropped on exports):

```js
// extension/public/src/lib/ws-crypto.js
// Aztec wallet-sdk ECDH crypto — pure WebCrypto, no imports.
// Mirrors @aztec/wallet-sdk/dest/crypto.js exactly. Single source of truth,
// shared by background.js (wallet side) and inpage.js (app side).

const _WS_P256_SZ = 32;
const _WS_HKDF_INFO = new TextEncoder().encode("Aztec Wallet DAPP Key derivation");
const _WS_FP_DATA   = new TextEncoder().encode("aztec-wallet-verification-verificationHash");

export async function wsGenerateKeyPair() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
}

export async function wsExportPublicKey(pk) {
  const jwk = await crypto.subtle.exportKey("jwk", pk);
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

export function wsImportPublicKey(exported) {
  return crypto.subtle.importKey("jwk", exported, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

function _wsB64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function _wsFixedCoord(b64url) {
  const decoded = _wsB64urlToBytes(b64url);
  if (decoded.length === _WS_P256_SZ) return decoded;
  if (decoded.length > _WS_P256_SZ) {
    throw new Error(`Invalid P-256 coordinate: expected ${_WS_P256_SZ} bytes, got ${decoded.length}`);
  }
  const padded = new Uint8Array(_WS_P256_SZ);
  padded.set(decoded, _WS_P256_SZ - decoded.length);
  return padded;
}

function _wsSaltFromKeys(appKey, walletKey) {
  const salt = new Uint8Array(4 * _WS_P256_SZ);
  salt.set(_wsFixedCoord(appKey.x),    0);
  salt.set(_wsFixedCoord(appKey.y),    _WS_P256_SZ);
  salt.set(_wsFixedCoord(walletKey.x), 2 * _WS_P256_SZ);
  salt.set(_wsFixedCoord(walletKey.y), 3 * _WS_P256_SZ);
  return salt.buffer;
}

export async function wsDeriveSessionKeys(ownKeyPair, peerPublicKey, isApp) {
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerPublicKey }, ownKeyPair.privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, ["deriveBits"]);
  const ownExp  = await wsExportPublicKey(ownKeyPair.publicKey);
  const peerExp = await wsExportPublicKey(peerPublicKey);
  const appKey    = isApp ? ownExp  : peerExp;
  const walletKey = isApp ? peerExp : ownExp;
  const salt = _wsSaltFromKeys(appKey, walletKey);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: _WS_HKDF_INFO }, hkdfKey, 512
  );
  const encryptionKey = await crypto.subtle.importKey(
    "raw", derivedBits.slice(0, 32), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
  const hmacKey = await crypto.subtle.importKey(
    "raw", derivedBits.slice(32, 64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const hashBuf = await crypto.subtle.sign("HMAC", hmacKey, _WS_FP_DATA);
  const verificationHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return { encryptionKey, verificationHash };
}

function _wsAb2b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function _wsB642ab(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function wsEncrypt(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(data));
  return { iv: _wsAb2b64(iv), ciphertext: _wsAb2b64(ciphertext) };
}

export async function wsDecrypt(key, payload) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: _wsB642ab(payload.iv) },
    key,
    _wsB642ab(payload.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest extension/test/ws-crypto.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/ws-crypto.js extension/test/ws-crypto.test.ts
git commit -m "feat(ext): extract shared ws-crypto module with round-trip tests"
```

---

## Task 2: Point background.js at the shared crypto module

**Files:**
- Modify: `extension/public/src/background.js` (add import near `:12-13`; delete inline defs `:43-137`)

- [ ] **Step 1: Add the import**

After `background.js:13` (`import { WS_WRITE_METHODS, classifySecureMessage } from "./lib/ws-lock-gate.js";`) add:

```js
import {
  wsGenerateKeyPair as _wsGenerateKeyPair,
  wsExportPublicKey as _wsExportPublicKey,
  wsImportPublicKey as _wsImportPublicKey,
  wsDeriveSessionKeys as _wsDeriveSessionKeys,
  wsEncrypt as _wsEncrypt,
  wsDecrypt as _wsDecrypt,
} from "./lib/ws-crypto.js";
```

Aliasing to the existing `_ws*` names means **no call site changes** anywhere else in `background.js`.

- [ ] **Step 2: Delete the now-duplicated inline definitions**

Delete `background.js:43-137` — the block from `const _WS_P256_SZ = 32;` through the end of the `_wsDecrypt` function (the comment header `// ─── Wallet-SDK ... Inline ECDH Crypto ──` at `:40-42` may stay or go; remove the body that is now imported). Keep `_WS_HKDF_INFO`/`_WS_FP_DATA` **out** of background (they are now internal to the module). Verify no remaining reference to `_WS_P256_SZ`, `_WS_HKDF_INFO`, `_WS_FP_DATA`, `_wsB64urlToBytes`, `_wsFixedCoord`, `_wsSaltFromKeys`, `_wsAb2b64`, `_wsB642ab` exists in background.js:

Run: `grep -nE "_WS_P256_SZ|_WS_HKDF_INFO|_WS_FP_DATA|_wsB64urlToBytes|_wsFixedCoord|_wsSaltFromKeys|_wsAb2b64|_wsB642ab" extension/public/src/background.js`
Expected: no output.

- [ ] **Step 3: Confirm the existing test suite still passes**

Run: `npm test`
Expected: all existing extension tests PASS (no regression). The wallet-sdk crypto is now sourced from the module.

- [ ] **Step 4: Build to confirm esbuild + cpSync deliver the module**

Run: `node extension/build.mjs`
Expected: `Pass 1: Standard entry points OK`; `dist/src/lib/ws-crypto.js` exists.
Run: `test -f extension/dist/src/lib/ws-crypto.js && echo OK`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/background.js
git commit -m "refactor(ext): source background wallet-sdk crypto from shared module"
```

---

## Task 3: Provider protocol constants (`lib/provider-protocol.js`)

**Files:**
- Create: `extension/public/src/lib/provider-protocol.js`
- Test: `extension/test/provider-protocol.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// extension/test/provider-protocol.test.ts
import { describe, it, expect } from "@jest/globals";
import { PROVIDER_MSG, PROVIDER_METHODS, newRequestId } from "../public/src/lib/provider-protocol.js";

describe("provider-protocol", () => {
  it("exposes distinct provider message types", () => {
    const vals = Object.values(PROVIDER_MSG);
    expect(new Set(vals).size).toBe(vals.length);
    expect(PROVIDER_MSG.SECURE_MESSAGE).toBe("provider-secure-message");
  });

  it("lists the methods the provider routes", () => {
    expect(PROVIDER_METHODS).toContain("GET_WITHDRAW_PROOF");
    expect(PROVIDER_METHODS).toContain("DAPP_SIGN");
  });

  it("generates unique, prefixed request ids", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).not.toBe(b);
    expect(a.startsWith("celari_")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest extension/test/provider-protocol.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```js
// extension/public/src/lib/provider-protocol.js
// Shared message vocabulary for the encrypted window.celari provider channel.
export const PROVIDER_MSG = {
  DISCOVERY: "provider-discovery",
  DISCOVERY_APPROVED: "provider-discovery-approved",
  KEY_EXCHANGE: "provider-key-exchange",
  KEY_EXCHANGE_RESPONSE: "provider-key-exchange-response",
  SECURE_MESSAGE: "provider-secure-message",
  SECURE_RESPONSE: "provider-secure-response",
  DISCONNECT: "provider-disconnect",
};

// window.postMessage envelope targets (page <-> content).
export const PROVIDER_TARGET_CONTENT = "celari-provider-content";
export const PROVIDER_TARGET_PAGE = "celari-provider-page";

// Methods the background provider router accepts.
export const PROVIDER_METHODS = [
  "DAPP_CONNECT",
  "DAPP_SIGN",
  "GET_ADDRESS",
  "GET_COMPLETE_ADDRESS",
  "GET_STATE",
  "CREATE_AUTHWIT",
  "GET_WITHDRAW_PROOF",
];

let _counter = 0;
export function newRequestId() {
  return `celari_${++_counter}_${Date.now()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest extension/test/provider-protocol.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/provider-protocol.js extension/test/provider-protocol.test.ts
git commit -m "feat(ext): add provider-channel protocol constants"
```

---

## Task 4: Active-account selector (`lib/provider-accounts.js`)

**Files:**
- Create: `extension/public/src/lib/provider-accounts.js`
- Test: `extension/test/provider-accounts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// extension/test/provider-accounts.test.ts
import { describe, it, expect } from "@jest/globals";
import { selectActiveAddress } from "../public/src/lib/provider-accounts.js";

describe("selectActiveAddress", () => {
  const acc = (address: string, deployed = true) => ({ address, deployed });

  it("returns the account at the active index when deployed", () => {
    const list = [acc("0xaaa"), acc("0xbbb")];
    expect(selectActiveAddress(list, 1)).toBe("0xbbb");
  });

  it("falls back to the first deployed account when the index is not deployed", () => {
    const list = [acc("0xpending", false), acc("0xready")];
    expect(selectActiveAddress(list, 0)).toBe("0xready");
  });

  it("returns null when there are no deployed accounts", () => {
    expect(selectActiveAddress([acc("0xx", false)], 0)).toBeNull();
    expect(selectActiveAddress([], 0)).toBeNull();
    expect(selectActiveAddress(undefined as any, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest extension/test/provider-accounts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```js
// extension/public/src/lib/provider-accounts.js
// Pick the address the provider should expose: the active account if it is
// deployed, else the first deployed account, else null.
export function selectActiveAddress(accounts, index) {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  const at = accounts[index];
  if (at?.deployed && at?.address) return at.address;
  const firstDeployed = accounts.find((a) => a?.deployed && a?.address);
  return firstDeployed?.address ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest extension/test/provider-accounts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/provider-accounts.js extension/test/provider-accounts.test.ts
git commit -m "feat(ext): add active-account selector for provider channel"
```

---

## Task 5: Provider hardening helpers (`lib/provider-harden.js`)

**Files:**
- Create: `extension/public/src/lib/provider-harden.js`
- Test: `extension/test/provider-harden.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// extension/test/provider-harden.test.ts
import { describe, it, expect } from "@jest/globals";
import { installHardenedProvider, createHandshakeGuard } from "../public/src/lib/provider-harden.js";

function fakeWin() {
  const listeners: Record<string, Function[]> = {};
  return {
    addEventListener(ev: string, fn: Function) { (listeners[ev] ||= []).push(fn); },
    _fire(ev: string) { (listeners[ev] || []).forEach((f) => f()); },
  } as any;
}

describe("installHardenedProvider", () => {
  it("defines the provider as non-writable, non-configurable", () => {
    const win = fakeWin();
    const api = { isCelari: true };
    installHardenedProvider(win, "celari", api);
    const desc = Object.getOwnPropertyDescriptor(win, "celari")!;
    expect(desc.value).toBe(api);
    expect(desc.writable).toBe(false);
    expect(desc.configurable).toBe(false);
    expect(win.celari).toBe(api);
  });

  it("re-asserts the provider on a lifecycle event if it was removed", () => {
    const win = fakeWin();
    const api = { isCelari: true };
    const { reassert } = installHardenedProvider(win, "celari", api);
    expect(typeof reassert).toBe("function");
    // Non-configurable means it cannot actually be deleted by an attacker; the
    // guard simply confirms the value survives a fired lifecycle event.
    win._fire("DOMContentLoaded");
    expect(win.celari).toBe(api);
  });
});

describe("createHandshakeGuard", () => {
  it("flags a second handshake after the first is established", () => {
    const g = createHandshakeGuard();
    expect(g.isSecondHandshake()).toBe(false);
    g.markEstablished();
    expect(g.isSecondHandshake()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest extension/test/provider-harden.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest extension/test/provider-harden.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/provider-harden.js extension/test/provider-harden.test.ts
git commit -m "feat(ext): add provider hardening + handshake-guard helpers"
```

---

## Task 6: Background — provider session handling + method router

**Files:**
- Modify: `extension/public/src/background.js` (add cases inside `_wsHandleProtocolMessage` switch `:166`; add `handleProviderMethod` + helpers near the other `_ws*` session code; add import from `provider-accounts.js`/`provider-protocol.js`)

Context: `_wsHandleProtocolMessage(message, sender)` (`:161`) already switches on `type` for `discovery-request`/`key-exchange-request`/`secure-message`/`disconnect-request` and is reached from `:658` (`if (message?.origin === _WS_CS)`). We add parallel `provider-*` cases that derive a session (wallet role, `isApp:false`), then route decrypted methods through `handleProviderMethod`.

- [ ] **Step 1: Add imports**

After the `ws-crypto.js` import added in Task 2, add:

```js
import { selectActiveAddress } from "./lib/provider-accounts.js";
import { PROVIDER_METHODS } from "./lib/provider-protocol.js";
```

- [ ] **Step 2: Add provider cases to `_wsHandleProtocolMessage`**

Inside the `switch (type)` in `_wsHandleProtocolMessage` (before the closing `}` at `:309`), add these four cases. They mirror the existing discovery/key-exchange/secure-message cases but tag the session `kind:"provider"` and route to `handleProviderMethod`:

```js
    case "provider-discovery": {
      const { requestId } = content || {};
      if (!requestId) return;
      const origin = sender.tab?.url ? new URL(sender.tab.url).origin : "unknown";
      _wsPendingDiscoveries.set(requestId, { tabId, origin, appId: "celari-provider", kind: "provider", createdAt: Date.now() });
      setTimeout(() => _wsPendingDiscoveries.delete(requestId), 30_000);
      chrome.tabs.sendMessage(tabId, {
        origin: _WS_BG,
        type: "provider-discovery-approved",
        sessionId: requestId,
        content: { id: CELARI_WALLET_ID_WS, name: "Celari Wallet", version: "0.5.0" },
      }).catch(() => {});
      break;
    }

    case "provider-key-exchange": {
      const discovery = _wsPendingDiscoveries.get(sessionId);
      if (!discovery || discovery.tabId !== tabId || discovery.kind !== "provider") return;
      try {
        const keyPair = await _wsGenerateKeyPair();
        const peerPubKey = await _wsImportPublicKey(content.publicKey);
        const { encryptionKey, verificationHash } = await _wsDeriveSessionKeys(keyPair, peerPubKey, false);
        const walletPubKey = await _wsExportPublicKey(keyPair.publicKey);
        _wsActiveSessions.set(sessionId, {
          tabId: discovery.tabId, origin: discovery.origin, appId: "celari-provider",
          kind: "provider", encryptionKey, verificationHash,
        });
        _wsPendingDiscoveries.delete(sessionId);
        chrome.tabs.sendMessage(discovery.tabId, {
          origin: _WS_BG,
          type: "provider-key-exchange-response",
          sessionId,
          content: { publicKey: walletPubKey },
        }).catch(() => {});
      } catch (e) {
        console.warn("[Provider] Key exchange failed:", e.message);
        _wsPendingDiscoveries.delete(sessionId);
      }
      break;
    }

    case "provider-secure-message": {
      const session = _wsActiveSessions.get(sessionId);
      if (!session || session.tabId !== tabId || session.kind !== "provider") return;
      let decrypted;
      try {
        decrypted = await _wsDecrypt(session.encryptionKey, content);
      } catch (e) {
        console.warn("[Provider] Decrypt failed:", e.message);
        return;
      }
      await handleProviderMethod(decrypted, session, sessionId);
      break;
    }

    case "provider-disconnect": {
      const session = _wsActiveSessions.get(sessionId);
      if (session && session.tabId === tabId) _wsActiveSessions.delete(sessionId);
      _wsPendingDiscoveries.delete(sessionId);
      break;
    }
```

- [ ] **Step 3: Add `handleProviderMethod` + response helper**

Immediately after the `_wsForwardToPxe` function (ends around `:380`), add:

```js
// Encrypt + send a provider-channel response back to the page tab.
async function _providerRespond(session, sessionId, requestId, response) {
  try {
    const encrypted = await _wsEncrypt(session.encryptionKey, JSON.stringify({ requestId, response }));
    chrome.tabs.sendMessage(session.tabId, {
      origin: _WS_BG, type: "provider-secure-response", sessionId, content: encrypted,
    }).catch(() => {});
  } catch (e) {
    console.warn("[Provider] response send failed:", e?.message || e);
  }
}

// Read the address the wallet should expose to a dApp (active deployed account).
async function _providerActiveAddress() {
  const { celari_accounts } = await chrome.storage.local.get("celari_accounts");
  return selectActiveAddress(celari_accounts || [], state.activeAccountIndex ?? 0);
}

// Route one decrypted provider request. `decrypted` = { method, payload, requestId }.
async function handleProviderMethod(decrypted, session, sessionId) {
  const { method, payload, requestId } = decrypted || {};
  if (!PROVIDER_METHODS.includes(method)) {
    return _providerRespond(session, sessionId, requestId, { success: false, error: `Unknown method: ${method}` });
  }

  // Writes require an unlocked wallet + explicit user approval via the sign popup.
  if (method === "DAPP_SIGN" || method === "CREATE_AUTHWIT") {
    if (await _bgIsLocked()) {
      return _providerRespond(session, sessionId, requestId, { success: false, error: "Wallet is locked", code: "WALLET_LOCKED" });
    }
    const signId = `psign_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    pendingSignRequests.set(signId, {
      payload, origin: session.origin, tabId: session.tabId,
      // Respond over the encrypted provider channel instead of sendResponse.
      sendResponse: (resp) => _providerRespond(session, sessionId, requestId, resp),
    });
    setTimeout(() => pendingSignRequests.delete(signId), 5 * 60_000);
    chrome.windows.create({ url: `popup.html?confirm=${signId}`, type: "popup", width: 380, height: 560, focused: true }).catch(() => {});
    return; // response sent later on SIGN_APPROVE / SIGN_REJECT
  }

  // Reads.
  if (method === "GET_STATE") {
    const address = await _providerActiveAddress();
    return _providerRespond(session, sessionId, requestId, { success: true, state: { connected: !!address, address } });
  }
  if (method === "GET_ADDRESS" || method === "DAPP_CONNECT") {
    if (await _bgIsLocked()) {
      // Surface the wallet so the user can unlock, then report not-yet-ready;
      // the dApp retries connect() after the user unlocks.
      try { chrome.action.openPopup(); } catch {}
      return _providerRespond(session, sessionId, requestId, { success: false, error: "Wallet is locked — unlock Celari and retry", code: "WALLET_LOCKED" });
    }
    const address = await _providerActiveAddress();
    if (!address) return _providerRespond(session, sessionId, requestId, { success: false, error: "No deployed account — open Celari to create one" });
    return _providerRespond(session, sessionId, requestId, { success: true, address });
  }
  if (method === "GET_COMPLETE_ADDRESS") {
    const { celari_accounts } = await chrome.storage.local.get("celari_accounts");
    const address = await _providerActiveAddress();
    const acc = (celari_accounts || []).find((a) => a.address === address);
    if (!acc) return _providerRespond(session, sessionId, requestId, { success: false, error: "No deployed account" });
    return _providerRespond(session, sessionId, requestId, {
      success: true, address: acc.address, publicKeyX: acc.publicKeyX, publicKeyY: acc.publicKeyY,
    });
  }
  if (method === "GET_WITHDRAW_PROOF") {
    try {
      const result = await handleGetWithdrawProof(payload?.l2TxHash);
      return _providerRespond(session, sessionId, requestId, result);
    } catch (err) {
      return _providerRespond(session, sessionId, requestId, { success: false, error: sanitizeRpcError(err) });
    }
  }
}
```

Note: `pendingSignRequests` (the legacy sign map at `:1148`) is reused — its `SIGN_APPROVE` handler (`:1186-1210`) calls `pending.sendResponse(...)`, which now routes to `_providerRespond`. The existing `chrome.tabs.sendMessage(pending.tabId, {target:"content", type:"SIGN_APPROVED", payload})` line at `:1197-1201` must be made conditional (only when the request came over the legacy path). Since we are deleting the legacy content handler, that branch becomes dead — guard it so it does not break provider sign:

In the `SIGN_APPROVE` handler (`:1196-1202`), replace the unconditional tab message with a guarded version that only fires for requests carrying a legacy marker. After this plan removes the legacy path, provider sign requests have no `target:"content"` listener, so simply remove the `chrome.tabs.sendMessage(...SIGN_APPROVED...)` call — the actual transaction execution happens via `pending.sendResponse` → provider channel → page → `window.celari.sendTransaction` resolves with the approval, matching today's contract. Confirm `pending.sendResponse({ success:true, approved:true })` remains.

- [ ] **Step 4: Verify suite still green + build**

Run: `npm test`
Expected: PASS (no regressions).
Run: `node extension/build.mjs`
Expected: Pass 1 OK.

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/background.js
git commit -m "feat(ext): encrypted provider channel handlers + method router in background"
```

---

## Task 7: content.js — delete plaintext path, add provider relay

**Files:**
- Modify: `extension/public/src/content.js` (delete `:81-85` legacy hand-off and `:199-253` legacy block; add provider relay)

- [ ] **Step 1: Remove the legacy plaintext path**

- Delete the legacy early hand-off in the page `message` listener (`content.js:81-85`):

```js
    // Legacy protocol uses object data, not JSON strings — hand off early.
    if (typeof event.data !== "string") {
      handleLegacyMessage(event);
      return;
    }
```

- Delete the non-wallet-sdk relay branch inside `chrome.runtime.onMessage` (`content.js:108-112`):

```js
        // Pass non-wallet-sdk messages to the legacy handler below
        if (message?.target === "content") {
          window.postMessage({ target: "celari-inpage", ...message }, window.location.origin);
        }
```
(Keep the surrounding `if (message?.origin !== WS_ORIGIN_BG) { ... return; }` — just drop the inner legacy forward.)

- Delete the entire `// ─── Legacy Protocol ───` section: `function handleLegacyMessage(...)` and the `ALLOWED_DAPP_TYPES` array (`content.js:199-253`).

Run: `grep -nE "handleLegacyMessage|ALLOWED_DAPP_TYPES|celari-content|celari-inpage" extension/public/src/content.js`
Expected: no output.

- [ ] **Step 2: Add the provider relay**

Add an import at the top of `content.js` (content scripts are bundled? No — content stays `bundle:false`; it imports nothing today). Content script CANNOT use bare ESM imports reliably here without being an entry that keeps the import — but `content.js` is delivered `bundle:false` and `lib/` is cpSync'd, and content runs as a module? **Check:** the manifest content_scripts entry has no `"type":"module"`, so `content.js` is a classic content script and **cannot use `import`**. Therefore inline the small protocol constants in content.js rather than importing:

```js
// ─── Encrypted Provider Channel relay (window.celari) ─────────────────
// Pure relay between the page (MessagePort) and background. All crypto is in
// the page (app) and background (wallet); the content script sees only
// ciphertext. Mirrors the wallet-sdk relay above.
const PROVIDER_TARGET_CONTENT = "celari-provider-content";
const providerPorts = new Map(); // sessionId -> MessagePort (port1)

// Page -> background: discovery bootstrap (plaintext is fine; only ECDH pubkeys/ids).
window.addEventListener("message", (event) => {
  try {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const d = event.data;
    if (d?.target !== PROVIDER_TARGET_CONTENT) return;
    if (d.type === "provider-discovery") {
      safeRuntimeSend({ origin: WS_ORIGIN_CS, type: "provider-discovery", content: { requestId: d.requestId } });
    }
  } catch (e) {
    if (_celariIsCtxInvalidError(e)) _celariCtxInvalid = true;
  }
});
```

Then inside the existing `chrome.runtime.onMessage` listener (`content.js:105`), add provider cases alongside the wallet-sdk `switch (type)` (after the `INTERNAL.SESSION_DISCONNECTED` case, still within the same `switch`):

```js
        case "provider-discovery-approved": {
          const channel = new MessageChannel();
          providerPorts.set(sessionId, channel.port1);
          channel.port1.onmessage = (e) => {
            try {
              const data = e.data;
              let t = "provider-secure-message";
              if (data?.type === "provider-key-exchange") t = "provider-key-exchange";
              else if (data?.type === "provider-disconnect") t = "provider-disconnect";
              safeRuntimeSend({ origin: WS_ORIGIN_CS, type: t, sessionId, content: data.content ?? data });
            } catch (err) {
              if (_celariIsCtxInvalidError(err)) _celariCtxInvalid = true;
            }
          };
          channel.port1.start();
          window.postMessage(
            { target: "celari-provider-page", type: "provider-discovery-approved", requestId: sessionId, walletInfo: content },
            window.location.origin,
            [channel.port2]
          );
          break;
        }
        case "provider-key-exchange-response":
        case "provider-secure-response": {
          providerPorts.get(sessionId)?.postMessage({ type, content });
          break;
        }
```

Also extend the `pagehide` cleanup (`content.js:185-197`) to close provider ports:

```js
  try {
    for (const [sessionId, port] of providerPorts) {
      try { port.close(); } catch {}
      safeRuntimeSend({ origin: WS_ORIGIN_CS, type: "provider-disconnect", sessionId });
    }
    providerPorts.clear();
  } catch {}
```

- [ ] **Step 3: Build + lint sanity**

Run: `node extension/build.mjs`
Expected: Pass 1 OK, no esbuild errors.

- [ ] **Step 4: Commit**

```bash
git add extension/public/src/content.js
git commit -m "feat(ext): provider-channel relay in content; remove plaintext path"
```

---

## Task 8: inpage.js — hardened encrypted client (full rewrite)

**Files:**
- Rewrite: `extension/public/src/inpage.js`

inpage is delivered as `<script type="module">` (`content.js:50`) and built `bundle:true` (Task 9), so it CAN import the `lib/*` modules; esbuild inlines them.

- [ ] **Step 1: Replace the file contents**

```js
/**
 * Celari Wallet — Inpage Provider (encrypted, hardened)
 *
 * Injected as `window.celari`. Talks to the background over an ECDH-P-256 /
 * AES-GCM encrypted channel (the inpage script is the "app" side). The content
 * script is a pure relay; page scripts see only ciphertext.
 */
import { wsGenerateKeyPair, wsExportPublicKey, wsImportPublicKey, wsDeriveSessionKeys, wsEncrypt, wsDecrypt } from "./lib/ws-crypto.js";
import { PROVIDER_TARGET_CONTENT, newRequestId } from "./lib/provider-protocol.js";
import { installHardenedProvider, createHandshakeGuard } from "./lib/provider-harden.js";

(() => {
  // Capture native refs before any page script can monkeypatch them.
  const _postMessage = window.postMessage.bind(window);
  const _addEventListener = window.addEventListener.bind(window);
  const _origin = window.location.origin;

  const guard = createHandshakeGuard();
  const pending = new Map(); // requestId -> { resolve, reject }

  let port = null;            // MessagePort to content
  let encryptionKey = null;   // derived AES key
  let appKeyPair = null;
  let channelReady = null;    // Promise resolved once encryptionKey is set
  let blocked = false;

  // ── Establish the encrypted channel (lazy, once) ──
  function ensureChannel() {
    if (channelReady) return channelReady;
    channelReady = new Promise((resolve, reject) => {
      const sessionId = newRequestId();

      // Wait for content's discovery-approved (carries the MessagePort).
      const onApproved = async (event) => {
        if (event.source !== window || event.origin !== _origin) return;
        const d = event.data;
        if (d?.target !== "celari-provider-page" || d?.type !== "provider-discovery-approved" || d?.requestId !== sessionId) return;
        if (guard.isSecondHandshake()) { console.warn("[Celari] Suspicious handshake — channel blocked"); blocked = true; return; }
        guard.markEstablished();
        window.removeEventListener("message", onApproved);

        port = event.ports[0];
        appKeyPair = await wsGenerateKeyPair();
        const appPub = await wsExportPublicKey(appKeyPair.publicKey);

        port.onmessage = async (e) => {
          const msg = e.data;
          if (msg?.type === "provider-key-exchange-response") {
            const walletPub = await wsImportPublicKey(msg.content.publicKey);
            ({ encryptionKey } = await wsDeriveSessionKeys(appKeyPair, walletPub, true));
            resolve();
          } else if (msg?.type === "provider-secure-response") {
            try {
              const { requestId, response } = await wsDecrypt(encryptionKey, msg.content);
              const p = pending.get(requestId);
              if (p) { pending.delete(requestId); response?.success === false ? p.reject(new Error(response.error || "Request failed")) : p.resolve(response); }
            } catch { /* not for us / undecryptable */ }
          }
        };
        port.start();
        port.postMessage({ type: "provider-key-exchange", content: { publicKey: appPub } });
      };
      _addEventListener("message", onApproved);

      // Kick off discovery via content relay.
      _postMessage({ target: PROVIDER_TARGET_CONTENT, type: "provider-discovery", requestId: sessionId }, _origin);

      setTimeout(() => { if (!encryptionKey) reject(new Error("Celari channel handshake timed out")); }, 15000);
    });
    return channelReady;
  }

  async function sendRequest(method, payload) {
    if (blocked) throw new Error("Celari channel blocked");
    await ensureChannel();
    const requestId = newRequestId();
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      wsEncrypt(encryptionKey, JSON.stringify({ method, payload, requestId }))
        .then((enc) => port.postMessage({ type: "provider-secure-message", content: enc }))
        .catch(reject);
      setTimeout(() => { if (pending.has(requestId)) { pending.delete(requestId); reject(new Error("Request timed out")); } }, 300000);
    });
  }

  const api = {
    isCelari: true,
    version: "0.6.0",
    walletSdkId: "celari-wallet",
    connect() { return sendRequest("DAPP_CONNECT", { origin: _origin, title: document.title }); },
    getAddress() { return sendRequest("GET_ADDRESS", {}); },
    getCompleteAddress() { return sendRequest("GET_COMPLETE_ADDRESS", {}); },
    sendTransaction(tx) { return sendRequest("DAPP_SIGN", { transaction: tx }); },
    createAuthWit(messageHash) { return sendRequest("CREATE_AUTHWIT", { messageHash }); },
    async isConnected() { const r = await sendRequest("GET_STATE", {}); return r.state?.connected || false; },
    getWithdrawProof(l2TxHash) { return sendRequest("GET_WITHDRAW_PROOF", { l2TxHash }); },
    on(event, callback) {
      const handler = (e) => { if (e.data?.target === "celari-provider-page" && e.data?.event === event) callback(e.data.payload); };
      _addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    },
    off(event, unsub) { if (typeof unsub === "function") unsub(); },
  };

  installHardenedProvider(window, "celari", api);
  window.dispatchEvent(new Event("celari#initialized"));
  console.log("[Celari] Provider injected (encrypted): window.celari");
})();
```

- [ ] **Step 2: Build (depends on Task 9 build change; if not yet done, do Task 9 first)**

Run: `node extension/build.mjs`
Expected: Pass 1 OK; `dist/src/inpage.js` is self-contained (crypto inlined — no remaining `import` statements).
Run: `grep -c "^import" extension/dist/src/inpage.js`
Expected: `0`.

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/inpage.js
git commit -m "feat(ext): hardened encrypted window.celari inpage client"
```

---

## Task 9: build.mjs — build inpage with bundling

**Files:**
- Modify: `extension/build.mjs:36-55` (move inpage to its own `bundle:true` pass)

- [ ] **Step 1: Remove inpage from the no-bundle entry list**

Edit `build.mjs:36-42`, delete the inpage line so `entryPoints` is:

```js
const entryPoints = [
  { in: resolve(__dirname, "public/src/background.js"), out: "src/background" },
  { in: resolve(__dirname, "public/src/content.js"), out: "src/content" },
];
```

(background keeps `bundle:false`: its `lib/*` imports stay external and are delivered by the `cpSync` at `:270` — runtime ESM resolution works for the module service worker. content imports nothing.)

- [ ] **Step 2: Add an inpage bundle pass**

Immediately after the Pass-1 `build({...})` call (after `:55`, before the popup build at `:63`), add:

```js
  // inpage.js is injected into the page as a module and imports lib/* crypto;
  // bundle it so the output is self-contained (no page-world module resolution
  // or web_accessible_resources juggling).
  await build({
    entryPoints: [{ in: resolve(__dirname, "public/src/inpage.js"), out: "src/inpage" }],
    bundle: true,
    minify: !isDev,
    sourcemap: isDev,
    outdir,
    format: "esm",
    target: ["chrome120"],
    logLevel: "info",
    ...(isDev ? {} : { drop: ["console"], define: { "process.env.NODE_ENV": '"production"' } }),
  });
```

- [ ] **Step 3: Build and verify the self-contained output**

Run: `node extension/build.mjs`
Expected: Pass 1 OK; no errors.
Run: `grep -c "^import" extension/dist/src/inpage.js`
Expected: `0` (lib crypto inlined).
Run: `test -f extension/dist/src/inpage.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add extension/build.mjs
git commit -m "build(ext): bundle inpage.js so lib crypto imports inline"
```

---

## Task 10: Manifest verify + full extension build

**Files:**
- Verify-only: `extension/public/manifest.json`

- [ ] **Step 1: Confirm hardening prerequisites already present**

Run: `node -e "const m=require('./extension/public/manifest.json'); console.log('run_at', m.content_scripts[0].run_at); console.log('inpage_war', JSON.stringify(m.web_accessible_resources[0].resources));"`
Expected: `run_at document_start` and resources include `src/inpage.js`. No edit needed.

- [ ] **Step 2: Full build + run the whole unit suite**

Run: `node extension/build.mjs`
Expected: all passes OK.
Run: `npm test`
Expected: all PASS, including the 4 new lib test files.

- [ ] **Step 3: Commit (if anything changed; otherwise skip)**

```bash
git add -A && git commit -m "chore(ext): full build after secure-transport phase 1" || echo "nothing to commit"
```

---

## Task 11: Manual end-to-end verification protocol

No automated harness exists for chrome-context wiring; verify manually. Record PASS/FAIL for each.

- [ ] **Step 1: Load the extension**
  - `chrome://extensions` → Developer mode → Load unpacked → select `extension/dist`.
  - Open a page (the Celari website or any site) → DevTools console shows exactly one `"[Celari] Provider injected (encrypted): window.celari"`.

- [ ] **Step 2: Provider hardening**
  - In the page console: `Object.getOwnPropertyDescriptor(window, "celari")` → `writable:false, configurable:false`.
  - `window.celari = {}` then `window.celari.isCelari` → still `true` (overwrite rejected).

- [ ] **Step 3: No plaintext on the wire**
  - In the page console, add `window.addEventListener("message", e => { if (String(JSON.stringify(e.data)).includes("DAPP_SIGN") || String(e.data).includes("bridge_exit")) console.warn("LEAK", e.data); })` before connecting.
  - Run a `connect()` + a `sendTransaction(...)`; confirm **no `LEAK`** logs (payloads are ciphertext under `provider-secure-message.content`).

- [ ] **Step 4: connect/getAddress contract**
  - Unlock the wallet, ensure a deployed account exists.
  - `await window.celari.connect()` → `{ success:true, address:"0x..." }`.
  - `await window.celari.getAddress()` → same address.

- [ ] **Step 5: Bridge withdraw (the fixed bug)**
  - On the Celari website withdraw flow: `sendTransaction({type:"bridge_exit",...})` opens the sign popup; after approval `getWithdrawProof(txHash)` **resolves** (no 5-minute hang). The L1 claim proceeds.

- [ ] **Step 6: External dApp regression**
  - Connect any `@aztec/wallet-sdk` dApp (or the existing test flow). The wallet-sdk discovery + encrypted channel still works (the crypto refactor in Task 2 did not break it).

- [ ] **Step 7: Record results in the PR description.**

---

## Self-Review Notes (resolved during planning)
- **Spec §4.4/§4.8 corrected:** `GET_ADDRESS`/`GET_COMPLETE_ADDRESS`/`CREATE_AUTHWIT` have no existing background handler (only `GET_STATE`, `DAPP_CONNECT`, `DAPP_SIGN`, `GET_WITHDRAW_PROOF` do) → Task 6 implements them. Manifest `run_at`/`web_accessible_resources` already satisfied → Task 10 verifies only.
- **Build model corrected:** `bundle:false` leaves ESM `import` intact and `lib/` is `cpSync`'d to dist (background path); inpage is page-injected so it is bundled (Task 9) to inline crypto.
- **Type/name consistency:** `wsDeriveSessionKeys(own, peer, isApp)`, `wsEncrypt(key, string)→{iv,ciphertext}`, `wsDecrypt(key, {iv,ciphertext})→object`, `PROVIDER_MSG`/`PROVIDER_TARGET_CONTENT`/`newRequestId`, `selectActiveAddress(accounts, index)`, `installHardenedProvider(win,key,api)`/`createHandshakeGuard()` are used identically across Tasks 1–9.
- **Residual risk** (main-world inpage key) documented in spec §5; sign-popup remains the authorization backstop.
