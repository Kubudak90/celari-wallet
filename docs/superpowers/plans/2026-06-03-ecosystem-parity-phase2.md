# Ecosystem Parity (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a generic `window.celari.createClient().request(method, params)` (+ `aztec_*` names) over the encrypted provider channel, routed through the existing wallet-sdk PXE handlers, plus a `verificationHash` fingerprint in the confirm popup and `accountsChanged`/`networkChanged` events.

**Architecture:** `request("aztec_X", params)` → encrypted provider channel → background builds a wallet-sdk-style message `{type:X, args:params, messageId:requestId}` → reads run via the existing `_wsForwardToPxe` (made `session.kind`-aware to reply over the provider channel), writes (`sendTx`/`createAuthWit`) gate through the provider confirm/`SIGN_APPROVE` flow from Phase 1.5. The wallet-sdk sign/lock machinery is left untouched. Events broadcast from the wallet's account/network switch handlers.

**Tech Stack:** Vanilla JS (MV3 SW + offscreen PXE + content + inpage + popup), WebCrypto, esbuild, Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-06-03-ecosystem-parity-phase2-design.md`
**Branch:** `feat/ecosystem-parity-phase2` (stacked on `feat/secure-transport-phase1`).

---

## File Structure
- `extension/public/src/lib/provider-rpc.js` — **new** pure helper: `ALLOWED_RPC_METHODS`, `isAllowedRpc`, `parseProviderRpc`. Tested.
- `extension/public/src/lib/fingerprint.js` — **new** pure helper: `verificationFingerprint(hash)` → short emoji string. Tested.
- `extension/public/src/lib/provider-protocol.js` — **modify**: add `PROVIDER_EVENT` type + accept `"RPC"` method.
- `extension/public/src/background.js` — **modify**: `_wsForwardToPxe` kind-aware reply; `RPC` branch in `handleProviderMethod`; `rpc-write` branch in `SIGN_APPROVE`; `verificationHash` on parked sign requests; `provider-event` broadcast in `SET_ACTIVE_ACCOUNT`/`SET_NETWORK`.
- `extension/public/src/inpage.js` — **modify**: `createClient()` + `request/on/off` (+ shortcuts).
- `extension/public/src/content.js` — **modify**: forward `provider-event` → page.
- `extension/public/src/pages/popup.js` — **modify**: render fingerprint in `renderConfirmTx` + `GET_SIGN_REQUEST` carries it.

Allowed RPC method set (= `handleWalletMethod` cases, `offscreen.js:1520+`): `getAccounts, getChainInfo, getAddressBook, registerSender, registerContract, getContractMetadata, getContractClassMetadata, executeUtility, simulateTx, sendTx, profileTx, createAuthWit, getPrivateEvents`.

---

## Task 1: `lib/provider-rpc.js` (pure RPC method helper)

**Files:** Create `extension/public/src/lib/provider-rpc.js`; Test `extension/test/provider-rpc.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// extension/test/provider-rpc.test.ts
import { describe, it, expect } from "@jest/globals";
import { parseProviderRpc, isAllowedRpc, ALLOWED_RPC_METHODS } from "../public/src/lib/provider-rpc.js";

describe("provider-rpc", () => {
  it("strips the aztec_ prefix to the bare method", () => {
    expect(parseProviderRpc("aztec_getAccounts").bare).toBe("getAccounts");
    expect(parseProviderRpc("getAccounts").bare).toBe("getAccounts");
  });
  it("flags write methods", () => {
    expect(parseProviderRpc("aztec_sendTx").isWrite).toBe(true);
    expect(parseProviderRpc("aztec_createAuthWit").isWrite).toBe(true);
    expect(parseProviderRpc("aztec_getAccounts").isWrite).toBe(false);
    expect(parseProviderRpc("aztec_simulateTx").isWrite).toBe(false);
  });
  it("allowlists only the supported wallet-sdk methods", () => {
    expect(isAllowedRpc("aztec_registerContract")).toBe(true);
    expect(isAllowedRpc("registerSender")).toBe(true);
    expect(isAllowedRpc("aztec_getContractMetadata")).toBe(true);
    expect(isAllowedRpc("aztec_evilMethod")).toBe(false);
    expect(isAllowedRpc("eth_sendTransaction")).toBe(false);
  });
  it("exposes the method set", () => {
    expect(ALLOWED_RPC_METHODS).toContain("sendTx");
    expect(ALLOWED_RPC_METHODS).toContain("getContractClassMetadata");
  });
});
```

- [ ] **Step 2: Run** `npx jest extension/test/provider-rpc.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Write the module**

```js
// extension/public/src/lib/provider-rpc.js
// Parse + allowlist generic dApp RPC methods routed over the window.celari
// provider channel. Mirrors the wallet-sdk method set that offscreen's
// handleWalletMethod already implements.
import { WS_WRITE_METHODS } from "./ws-lock-gate.js";

export const ALLOWED_RPC_METHODS = new Set([
  "getAccounts", "getChainInfo", "getAddressBook",
  "registerSender", "registerContract",
  "getContractMetadata", "getContractClassMetadata",
  "executeUtility", "simulateTx", "sendTx", "profileTx",
  "createAuthWit", "getPrivateEvents",
]);

// Strip a leading "aztec_" and classify.
export function parseProviderRpc(method, writeMethods = WS_WRITE_METHODS) {
  const m = String(method || "");
  const bare = m.startsWith("aztec_") ? m.slice(6) : m;
  return { bare, isWrite: writeMethods.has(bare) };
}

export function isAllowedRpc(method) {
  return ALLOWED_RPC_METHODS.has(parseProviderRpc(method).bare);
}
```

- [ ] **Step 4: Run** `npx jest extension/test/provider-rpc.test.ts` — expect PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/public/src/lib/provider-rpc.js extension/test/provider-rpc.test.ts
git commit -m "feat(ext): add generic provider RPC method parser + allowlist"
```

---

## Task 2: `lib/fingerprint.js` (verificationHash → emoji)

**Files:** Create `extension/public/src/lib/fingerprint.js`; Test `extension/test/fingerprint.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// extension/test/fingerprint.test.ts
import { describe, it, expect } from "@jest/globals";
import { verificationFingerprint } from "../public/src/lib/fingerprint.js";

describe("verificationFingerprint", () => {
  it("is deterministic and stable for the same hash", () => {
    const a = verificationFingerprint("00ff7a3c");
    expect(a).toBe(verificationFingerprint("00ff7a3c"));
  });
  it("returns 4 emoji", () => {
    expect([...verificationFingerprint("00ff7a3c")].length).toBe(4);
  });
  it("differs for different hashes", () => {
    expect(verificationFingerprint("00000000")).not.toBe(verificationFingerprint("ffffffff"));
  });
  it("handles empty / short input without throwing", () => {
    expect(typeof verificationFingerprint("")).toBe("string");
    expect(typeof verificationFingerprint("a")).toBe("string");
  });
});
```

- [ ] **Step 2: Run** `npx jest extension/test/fingerprint.test.ts` — expect FAIL.

- [ ] **Step 3: Write the module**

```js
// extension/public/src/lib/fingerprint.js
// Render a session verificationHash (hex string) as a short, stable emoji
// fingerprint the user can eye-compare to detect a hijacked provider session.
const EMOJI = [
  "🦊","🐼","🦁","🐸","🐧","🦉","🐙","🦋","🌵","🍄","🌙","⭐","🔥","💧","🍀","🎲",
  "🎸","🚀","⚓","🔑","🎩","🧊","🍕","🌈","🐝","🐳","🦄","🌻","⚡","❄","🎯","🧩",
];

export function verificationFingerprint(hash) {
  const hex = String(hash || "").replace(/[^0-9a-fA-F]/g, "") || "0";
  let out = "";
  for (let i = 0; i < 4; i++) {
    // Take a 2-hex-char window (wrapping) → byte → emoji index.
    const start = (i * 2) % Math.max(hex.length, 1);
    const pair = (hex.slice(start, start + 2) || hex.slice(0, 2) || "0").padEnd(2, "0");
    const byte = parseInt(pair, 16) || 0;
    out += EMOJI[byte % EMOJI.length];
  }
  return out;
}
```

- [ ] **Step 4: Run** `npx jest extension/test/fingerprint.test.ts` — expect PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add extension/public/src/lib/fingerprint.js extension/test/fingerprint.test.ts
git commit -m "feat(ext): add verificationHash emoji fingerprint helper"
```

---

## Task 3: Make `_wsForwardToPxe` `session.kind`-aware

**Files:** Modify `extension/public/src/background.js` (`_wsForwardToPxe`, ~`:290-340`).

Context: `_wsForwardToPxe(decrypted, session, sessionId)` computes a wallet-sdk `responsePayload` (a JSON string `{messageId, result|error, walletId}`) and sends it as a `secure-response` in two places (the locked-early-return at ~`:298-308`, and the normal path at ~`:329-339`). We add a single shared reply helper that, for provider sessions, replies over the provider channel instead — leaving wallet-sdk sessions byte-identical.

- [ ] **Step 1: Add the shared reply helper** (immediately before `async function _wsForwardToPxe`)

```js
// Reply to a decrypted wallet-method call. Wallet-sdk sessions get the raw
// wallet-sdk secure-response; provider sessions (kind:"provider") get a
// provider-secure-response carrying {success, result}/{success,error}, keyed
// by the provider requestId (which we stash as decrypted.messageId).
async function _wsReplyDecrypted(session, sessionId, decrypted, responsePayload) {
  if (session.kind === "provider") {
    let parsed;
    try { parsed = JSON.parse(responsePayload); } catch { parsed = { error: "Malformed PXE response" }; }
    const resp = parsed.error
      ? { success: false, error: parsed.error, code: parsed.code }
      : { success: true, result: parsed.result };
    return _providerRespond(session, sessionId, decrypted.messageId, resp);
  }
  try {
    const encrypted = await _wsEncrypt(session.encryptionKey, responsePayload);
    chrome.tabs.sendMessage(session.tabId, {
      origin: _WS_BG, type: "secure-response", sessionId, content: encrypted,
    }).catch(() => {});
  } catch (e) {
    console.warn("[WalletSDK] Encrypt response failed:", e.message);
  }
}
```
(Note: this helper must be defined after `_providerRespond` / `_wsEncrypt` exist — both are module-level functions, so placing it just above `_wsForwardToPxe` is fine since calls happen at runtime.)

- [ ] **Step 2: Use the helper in the locked-early-return branch**

In `_wsForwardToPxe`, replace the locked branch's inline send (the `try { const encrypted = await _wsEncrypt(...); chrome.tabs.sendMessage(... type:"secure-response" ...) } catch {...}` block at ~`:298-308`) with:
```js
    await _wsReplyDecrypted(session, sessionId, decrypted, responsePayload);
    return;
```

- [ ] **Step 3: Use the helper in the normal path**

Replace the final send block (~`:329-339`, the `try { const encrypted = await _wsEncrypt(...); chrome.tabs.sendMessage(... type:"secure-response" ...) } catch {...}`) with:
```js
  await _wsReplyDecrypted(session, sessionId, decrypted, responsePayload);
```

- [ ] **Step 4: Verify no behavior change for wallet-sdk + build**

Run: `npm test` → all green (no new failures; the pre-existing `passkey_account` e2e suite is unrelated).
Run: `node extension/build.mjs` → Pass 1 + Pass 2 OK.
Manually confirm (read): for a session with no `kind` (wallet-sdk), `_wsReplyDecrypted` takes the `else` path and sends the identical `secure-response` as before.

- [ ] **Step 5: Commit**
```bash
git add extension/public/src/background.js
git commit -m "refactor(ext): kind-aware reply in _wsForwardToPxe (provider vs wallet-sdk)"
```

---

## Task 4: `RPC` routing in `handleProviderMethod` + `SIGN_APPROVE` rpc-write branch

**Files:** Modify `extension/public/src/background.js`; `extension/public/src/lib/provider-protocol.js`.

- [ ] **Step 1: Import the RPC helper + add protocol constant**

In `background.js`, near the other `./lib/` imports, add:
```js
import { isAllowedRpc, parseProviderRpc } from "./lib/provider-rpc.js";
```
In `extension/public/src/lib/provider-protocol.js`, add to the exported `PROVIDER_MSG` object a new entry `EVENT: "provider-event",` and add `"RPC"` to the `PROVIDER_METHODS` array.

- [ ] **Step 2: Add the `RPC` branch at the top of `handleProviderMethod`**

In `handleProviderMethod(decrypted, session, sessionId)` (after `const { method, payload, requestId } = decrypted || {};`), before the `PROVIDER_METHODS.includes(method)` check, add:
```js
  if (method === "RPC") {
    const rpcMethod = payload?.rpcMethod;
    const params = payload?.params ?? [];
    if (!isAllowedRpc(rpcMethod)) {
      return _providerRespond(session, sessionId, requestId, { success: false, error: `Unsupported method: ${rpcMethod}` });
    }
    const { bare, isWrite } = parseProviderRpc(rpcMethod);
    // Wallet-sdk-style message; messageId = the provider requestId so the
    // kind-aware reply echoes it back to the right pending promise.
    const walletMsg = { type: bare, args: params, messageId: requestId };
    if (isWrite) {
      const signId = `prpc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      pendingSignRequests.set(signId, {
        kind: "rpc-write",
        walletMsg, session, sessionId, requestId,
        origin: session.origin,
        tabId: session.tabId,
        verificationHash: session.verificationHash,
        payload: { transaction: { type: "rpc", functionName: rpcMethod, contractAddress: "—" } },
      });
      setTimeout(() => pendingSignRequests.delete(signId), 5 * 60_000);
      chrome.windows.create({ url: `popup.html?confirm=${signId}`, type: "popup", width: 380, height: 560, focused: true }).catch(() => {});
      return; // response sent later on SIGN_APPROVE / SIGN_REJECT
    }
    return _wsForwardToPxe(walletMsg, session, sessionId); // read → kind-aware reply
  }
```

- [ ] **Step 3: Add an `rpc-write` branch to `SIGN_APPROVE`**

In the `case "SIGN_APPROVE":` handler (the bespoke one extended in Phase 1.5 for `bridge_exit`), add an `rpc-write` branch alongside the `bridge_exit` branch. After `pendingSignRequests.delete(message.requestId);`:
```js
        if (pending.kind === "rpc-write") {
          sendResponse({ success: true }); // ack popup
          _wsForwardToPxe(pending.walletMsg, pending.session, pending.sessionId)
            .catch((e) => pending.session && _providerRespond(pending.session, pending.sessionId, pending.requestId, { success: false, error: sanitizeRpcError(e) }));
          return;
        }
```
(Place it before the existing `if (pending.kind === "bridge_exit")` branch or after — they are mutually exclusive on `kind`.)

- [ ] **Step 4: Handle `rpc-write` rejection in `SIGN_REJECT`**

Find the bespoke `case "SIGN_REJECT":` handler. It currently calls `pending.sendResponse({ success:false, error:"User rejected..." })` for bespoke/bridge requests. For `rpc-write` the responder is the provider channel, so add (before the existing `pending.sendResponse(...)`):
```js
        if (pending.kind === "rpc-write") {
          _providerRespond(pending.session, pending.sessionId, pending.requestId, { success: false, error: "User rejected the request" });
          sendResponse({ success: true });
          return;
        }
```
(If `SIGN_REJECT` doesn't already delete the pending, ensure it does before responding, mirroring the `bridge_exit` handling.)

- [ ] **Step 5: Verify + build**

Run: `npx jest extension/test` → green.
Run: `node extension/build.mjs` → Pass 1 + Pass 2 OK.
Run: `grep -n "method === \"RPC\"\|rpc-write\|isAllowedRpc" extension/public/src/background.js` → confirm the branches present.

- [ ] **Step 6: Commit**
```bash
git add extension/public/src/background.js extension/public/src/lib/provider-protocol.js
git commit -m "feat(ext): route generic aztec_* RPC over the provider channel"
```

---

## Task 5: inpage `createClient()` + `request/on/off`

**Files:** Modify `extension/public/src/inpage.js`.

Context: inpage already has `sendRequest(method, payload)` (resolves with the response object, rejects when `response.success === false`) and `on(event, callback)` / `off`. We add a generic RPC surface on top.

- [ ] **Step 1: Add `request` + `createClient` to the `api` object**

In the `const api = { ... }` object, add (alongside the existing methods):
```js
    /** Generic Aztec RPC: request("aztec_getAccounts", params) → result. */
    async request(method, params = []) {
      const r = await sendRequest("RPC", { rpcMethod: method, params });
      return r.result; // sendRequest already rejected on { success:false }
    },
    /** Azguard-parity client. */
    createClient() {
      return {
        request: (method, params = []) => api.request(method, params),
        on: (event, cb) => api.on(event, cb),
        off: (event, unsub) => api.off(event, unsub),
      };
    },
```
(`api` is referenced inside `createClient` — keep `const api = {...}` and reference `api.request`/`api.on`/`api.off`; they're defined on the same object, resolved at call time.)

- [ ] **Step 2: Build + self-contained check**

Run: `node extension/build.mjs` → Pass 1 OK.
Run: `grep -c "^import" extension/dist/src/inpage.js` → `0` (still bundled self-contained).
Run: `grep -n "createClient\|request" extension/public/src/inpage.js` → confirm present.

- [ ] **Step 3: Commit**
```bash
git add extension/public/src/inpage.js
git commit -m "feat(ext): window.celari.createClient().request() generic RPC surface"
```

---

## Task 6: content forwards `provider-event` to the page

**Files:** Modify `extension/public/src/content.js`.

Context: the `chrome.runtime.onMessage` listener handles `WS_ORIGIN_BG` messages in a `switch (type)` that already has `provider-discovery-approved` / `provider-key-exchange-response` / `provider-secure-response`. Background will send `{ origin: WS_ORIGIN_BG, type:"provider-event", event, payload }`.

- [ ] **Step 1: Add the `provider-event` case** (in the same `switch (type)`, after `provider-secure-response`)

```js
        case "provider-event": {
          window.postMessage(
            { target: "celari-provider-page", event: message.event, payload: message.payload },
            window.location.origin
          );
          break;
        }
```
(Uses `message.event`/`message.payload` directly — these aren't part of the `{type, sessionId, content}` destructure, which is fine.)

- [ ] **Step 2: Build** → `node extension/build.mjs` Pass 1 OK. `grep -n "provider-event" extension/public/src/content.js` confirms.

- [ ] **Step 3: Commit**
```bash
git add extension/public/src/content.js
git commit -m "feat(ext): relay provider-event push messages to the page"
```

---

## Task 7: Broadcast `accountsChanged` / `networkChanged`

**Files:** Modify `extension/public/src/background.js`.

- [ ] **Step 1: Add a broadcast helper** (near `_providerRespond`)

```js
// Push an event to every connected provider tab (window.celari.on consumers).
function _providerBroadcastEvent(event, payload) {
  const tabs = new Set();
  for (const s of _wsActiveSessions.values()) {
    if (s.kind === "provider" && s.tabId) tabs.add(s.tabId);
  }
  for (const tabId of tabs) {
    chrome.tabs.sendMessage(tabId, { origin: _WS_BG, type: "provider-event", event, payload }).catch(() => {});
  }
}
```

- [ ] **Step 2: Broadcast on active-account switch**

In `case "SET_ACTIVE_ACCOUNT":` (~`:1005`), after `state.activeAccountIndex = message.index;` (and any persistence already there), add:
```js
      _providerActiveAddress().then((addr) => _providerBroadcastEvent("accountsChanged", addr ? [addr] : []));
```

- [ ] **Step 3: Broadcast on network switch**

In `case "SET_NETWORK":` (~`:909`), after `state.network` is updated (near where `state.connected = false` is set), add:
```js
      _providerBroadcastEvent("networkChanged", { network: state.network, nodeUrl: state.nodeUrl });
```

- [ ] **Step 4: Verify + build**

Run: `node extension/build.mjs` → Pass 1 + Pass 2 OK.
Run: `grep -n "_providerBroadcastEvent\|accountsChanged\|networkChanged" extension/public/src/background.js` → confirm.
Run: `npx jest extension/test` → green.

- [ ] **Step 5: Commit**
```bash
git add extension/public/src/background.js
git commit -m "feat(ext): broadcast accountsChanged/networkChanged to provider dApps"
```

---

## Task 8: verificationHash fingerprint in the confirm popup

**Files:** Modify `extension/public/src/background.js`, `extension/public/src/pages/popup.js`.

Context: parked sign requests (bridge_exit, rpc-write, and future provider signs) carry `verificationHash` (Task 4 already stores it for rpc-write; do the same for bridge_exit). The confirm popup loads the request via `GET_SIGN_REQUEST` and renders via `renderConfirmTx` (`popup.js:~3058`).

- [ ] **Step 1: Carry `verificationHash` on the bridge_exit + sign parks**

In `handleProviderMethod`'s `DAPP_SIGN`/`CREATE_AUTHWIT` write branch (the Phase-1 park) and the bridge_exit park, add `verificationHash: session.verificationHash,` to the `pendingSignRequests.set(...)` object (rpc-write already has it from Task 4).

- [ ] **Step 2: Return it from `GET_SIGN_REQUEST`**

Find the bespoke `case "GET_SIGN_REQUEST":` handler (it returns `{ success:true, request: { id, origin, payload } }`). Add `verificationHash: pending.verificationHash` to the returned `request` object.

- [ ] **Step 3: Render the fingerprint in `renderConfirmTx`**

In `popup.js`, import the helper at the top of the file (popup is built with `bundle:false` but other `./lib/*` imports work via the popup being an ES module — confirm an existing `import ... from "../lib/..."` is present; the popup already imports `passkey-crypto`):
```js
import { verificationFingerprint } from "../lib/fingerprint.js";
```
In `renderConfirmTx()`, after the request is read, compute `const fp = req?.verificationHash ? verificationFingerprint(req.verificationHash) : "";` and render a small row in BOTH the bridge_exit branch (from Phase 1.5) and the generic branch, e.g.:
```js
      <div class="row"><span>Güvenlik</span><strong title="Bu emoji dizisi cüzdanınızla aynı olmalı">${fp}</strong></div>
```
Place it inside the same confirm card markup, near the origin row. Keep `#btnApproveTx`/`#btnRejectTx` and `bindConfirmTx` unchanged.

- [ ] **Step 4: Build + verify**

Run: `node extension/build.mjs` → Pass 1 OK (popup builds).
Run: `grep -n "verificationFingerprint\|verificationHash" extension/public/src/pages/popup.js extension/public/src/background.js` → confirm wiring.

- [ ] **Step 5: Commit**
```bash
git add extension/public/src/background.js extension/public/src/pages/popup.js
git commit -m "feat(ext): show session verification fingerprint on the confirm popup"
```

---

## Task 9: Full build + manual E2E

- [ ] **Step 1: Full build + unit suite**

Run: `node extension/build.mjs` → all passes OK.
Run: `npx jest extension/test` → all green (incl. provider-rpc + fingerprint).
Load unpacked `extension/dist` in Chrome; unlock the wallet.

- [ ] **Step 2: Generic RPC (reads)**
  - Page console: `const c = window.celari.createClient(); await c.request("aztec_getAccounts")` → returns account(s). `await c.request("aztec_getChainInfo")` → chain info. `await window.celari.request("aztec_getContractMetadata", [addr])` round-trips.

- [ ] **Step 3: Generic RPC (write)**
  - `c.request("aztec_sendTx", [txReq, opts])` opens the confirm popup (shows the method + a **verification emoji fingerprint**). Approve → resolves with the tx result; Reject → promise rejects.
  - Disallowed: `c.request("eth_sendTransaction")` rejects with "Unsupported method".

- [ ] **Step 4: Events**
  - `c.on("accountsChanged", cb)` → switch the active account in the wallet popup → `cb` fires with the new address.
  - `c.on("networkChanged", cb)` → switch network → `cb` fires.

- [ ] **Step 5: No regression**
  - Bespoke website flows (connect/getAddress/withdraw) still work.
  - External `@aztec/wallet-sdk` dApp `sendTx` still works (Task 3 left wallet-sdk replies byte-identical).

- [ ] **Step 6: Record results in the PR description.**

---

## Self-Review Notes (resolved during planning)
- **Lower-risk write/lock handling:** reads reuse the kind-aware `_wsForwardToPxe` (locked → `WALLET_LOCKED`, dApp retries); writes reuse the provider confirm/`SIGN_APPROVE` flow. The wallet-sdk `_wsPendingSignRequests`/`wssign`/locked-queue/`WS_APPROVE_SIGN` paths are **untouched**.
- **requestId threading:** the inpage `request()` `requestId` is set as `walletMsg.messageId`; the kind-aware reply calls `_providerRespond(..., decrypted.messageId, ...)`, so the response matches the inpage pending promise. `request()` returns `response.result` (sendRequest already rejected on `success:false`).
- **Type/name consistency:** `parseProviderRpc(method) → {bare, isWrite}`, `isAllowedRpc(method)`, `ALLOWED_RPC_METHODS`; provider method `"RPC"` with payload `{rpcMethod, params}`; `PROVIDER_MSG.EVENT = "provider-event"`; `verificationFingerprint(hash)`; sign-request `kind:"rpc-write"`. Consistent across Tasks 1–8.
- **Spec coverage:** generic request/createClient (T5) + aztec_* routing/allowlist (T1,T4) + expanded API (T4, via the allowlist + existing handleWalletMethod) + verificationHash UX (T2,T8) + on() events (T6,T7). All spec goals mapped.
