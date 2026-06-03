# Celari Secure dApp Transport — Phase 1 (Security Parity)

- **Date:** 2026-06-02
- **Status:** Approved design — ready for implementation plan
- **Branch:** `feat/secure-transport-phase1`
- **Owner:** Celari Wallet team

---

## 1. Background & Motivation

We compared Celari's extension against the Azguard wallet (competitor) to find gaps in the dApp↔wallet transport layer. Findings were verified against live code (this repo) on 2026-06-02.

### What is already at parity — the wallet-SDK encrypted channel
Both wallets implement the official Aztec `@aztec/wallet-sdk` discovery + ECDH-encrypted `MessagePort` protocol. Celari's implementation:

- `background.js:40-41` — comment: *"Mirrors @aztec/wallet-sdk/dest/crypto.js exactly."*
- ECDH **P-256** (`background.js:48`) + HKDF-SHA256 with info `"Aztec Wallet DAPP Key derivation"` (`background.js:44,97`) + AES-GCM-256 (`background.js:100,126`) + HMAC→`verificationHash` emoji fingerprint (`background.js:102-106`).
- `content.js:55-197` is a pure relay; the background owns all crypto and session state (`_wsActiveSessions`, `background.js:145`).

This path is **equal to Azguard's** wallet-sdk channel. Not in scope to change.

### The real gap — the legacy `window.celari` provider channel
Celari exposes a second, bespoke provider (`window.celari`) used by Celari's own website. This channel is **plaintext** and **unhardened**:

| # | Gap | Evidence (Celari) | Azguard |
|---|-----|-------------------|---------|
| 1 | Legacy channel is plaintext | `inpage.js:38-43` + `content.js:202-253` — unencrypted `window.postMessage` | Separate **P-521** ECDH channel for `window.azguard` |
| 2 | Provider is overwritable (squat) | `inpage.js:57` `window.celari = {...}` plain assignment | `Object.defineProperty` + re-inject on load events |
| 3 | No second-handshake block | none | *"Suspicious handshake … is blocked"* |

### Confirmed bug found during verification
`window.celari.getWithdrawProof()` sends message type `GET_WITHDRAW_PROOF` (`inpage.js:100-102`) and the background **handles it** (`background.js:1241`), but `content.js`'s `ALLOWED_DAPP_TYPES` allowlist (`content.js:208-216`) **does not include it**, so the content script silently drops the request. The website's bridge withdraw flow (`website/src/hooks/useWithdrawFlow.ts:53`) therefore hangs until the 5-minute timeout. **Bridge withdraw is currently broken.**

### Legacy channel consumers (must keep working)
- `website/src/hooks/useCelariExtension.ts` — `connect()`, `getAddress()`
- `website/src/hooks/useWithdrawFlow.ts` — `sendTransaction({type:"bridge_exit",...})`, `getWithdrawProof()`
- `useDepositFlow.ts` does **not** use `window.celari` (pure L1/wagmi).

---

## 2. Goals / Non-Goals

### Goals (Phase 1)
1. Encrypt the `window.celari` provider channel end-to-end (no plaintext on the page).
2. Harden the provider object against squatting / hijack (Azguard-equivalent).
3. Fix the `getWithdrawProof` allowlist bug and make `connect()` return the approved address.
4. Delete the plaintext legacy path entirely.
5. Keep the public `window.celari` method surface unchanged so the website needs no logic changes.

### Non-Goals (deferred — see roadmap)
- Generic `request(method, params)` + `aztec_*` method names → **Phase 2**.
- dApp API expansion (`registerContract` / `registerSender` / `getContractMetadata`) → **Phase 2**.
- COOP/COEP headers (threaded `barretenberg-threads` proving) + `sidePanel` → **Phase 3**.

---

## 3. Full-Parity Roadmap (decomposition)

The user chose **phased full parity**. Each phase is its own spec → plan → implementation cycle.

- **Phase 1 — Security parity** *(this spec):* encrypt + harden `window.celari`, fix bug.
- **Phase 2 — Ecosystem parity:** generic `createClient().request(method, params)`, `aztec_*` method names (bespoke methods become thin back-compat wrappers), expand dApp API. Builds directly on the Phase 1 encrypted channel.
- **Phase 3 — Proving + UX parity:** COOP `same-origin` + COEP `require-corp` manifest headers (path to multi-core WASM proving) + `sidePanel` permission/config.

---

## 4. Phase 1 Design

### 4.1 End-state architecture — two encrypted front doors

`window.celari`'s public API is unchanged, but underneath it speaks over an **encrypted provider channel** that reuses the existing P-256 crypto + session machinery. Two front doors, one crypto stack:

```
External Aztec dApps ──(@aztec/wallet-sdk discovery)──► content relay ──► background  ┐
                                                                                       ├─ same ECDH P-256 / HKDF / AES-GCM
window.celari (our inpage) ──(celari provider handshake)──► content relay ──► background ┘   + _wsActiveSessions + sign-popup
```

The plaintext `celari-content` / `celari-inpage` message path is removed.

### 4.2 Provider hardening (`inpage.js`)

Best-effort hardening (the industry standard for inpage providers; mirrors Azguard `inpage.ts:176-194`):

- At the **top of the IIFE**, capture native references before any page script can monkeypatch them: `postMessage`, `addEventListener`, `crypto.subtle`, `MessageChannel`, `Object.defineProperty`.
- Define the provider non-writably:
  `Object.defineProperty(window, "celari", { value: api, writable: false, configurable: false })`.
- Re-assert the provider on `load`, `DOMContentLoaded`, `readystatechange` (if a script deleted/replaced it, restore via the captured `defineProperty`).
- **Anti-hijack:** if a second provider-handshake init is observed for an already-established channel, log *"Suspicious handshake — channel blocked"* and refuse to establish a second session.

### 4.3 Encrypted provider channel — handshake & message protocol

Mirrors the wallet-sdk pattern, with the **inpage script playing the "app" role** (`isApp: true`) and the background playing the "wallet" role (`isApp: false`), so the existing `_wsDeriveSessionKeys` symmetry holds. ECDH public keys are exchanged in clear (standard); all post-handshake messages are AES-GCM encrypted and travel over a transferred `MessagePort` (point-to-point, not a window-level event).

New internal message types (parallel to the wallet-sdk set, distinct names to avoid collision):

| Direction | Type | Payload |
|-----------|------|---------|
| inpage→bg | `provider-discovery` | `{ requestId }` |
| bg→inpage | `provider-discovery-approved` | walletInfo + transfers `MessagePort` (port2) |
| inpage→bg | `provider-key-exchange` | `{ publicKey: jwk }` |
| bg→inpage | `provider-key-exchange-response` | `{ publicKey: jwk }` |
| inpage→bg | `provider-secure-message` | `_wsEncrypt`'d `{ method, payload, requestId }` |
| bg→inpage | `provider-secure-response` | `_wsEncrypt`'d `{ requestId, response }` |
| inpage→bg | `provider-disconnect` | `{ sessionId }` |

- **Lazy init:** the handshake starts on the first `window.celari` method call (e.g. `connect()`), not at injection time — keeps idle pages cheap.
- The inpage ECDH private key lives only in the IIFE closure; the derived AES key lives only in inpage + background.
- Channel bootstrap reuses `content.js`'s existing MessageChannel relay machinery (the twin of `content.js:118-175`), with `provider-*` types.
- **"Reuse" caveat:** the inpage (page world) and the background run in separate contexts and cannot share a module by import. "Reuse the P-256 stack" therefore means **identical scheme & parameters** (same curve, HKDF info/salt ordering, AES-GCM, key derivation as `background.js:43-137`) so the two sides interoperate. Implementation options: (a) a small shared `crypto-ws.js` file bundled into both inpage and background, or (b) a faithful copy of the `_ws*` helpers in the inpage IIFE. Plan picks one; (a) preferred to keep a single source of truth.

### 4.4 Background routing

A new branch in `_wsHandleProtocolMessage` (or a sibling handler) for provider sessions:

- `provider-key-exchange` → derive key with `_wsDeriveSessionKeys(kp, peerPub, /*isApp*/ false)`, store session in `_wsActiveSessions` with a new field `kind: "provider"`.
- `provider-secure-message` → `_wsDecrypt`, then route by `method` to the **existing legacy handlers** rather than the PXE forward:
  `DAPP_CONNECT`, `DAPP_SIGN`, `GET_ADDRESS`, `GET_COMPLETE_ADDRESS`, `GET_STATE`, `CREATE_AUTHWIT`, `GET_WITHDRAW_PROOF`.
- The handler result is `_wsEncrypt`'d and returned as `provider-secure-response`.
- **`DAPP_SIGN` keeps the existing sign-popup confirmation** (`background.js:1145-1165`) — explicit user approval remains the real authorization backstop. Write methods are gated identically to today.

### 4.5 `content.js`

- **Remove:** `handleLegacyMessage`, `ALLOWED_DAPP_TYPES`, and the `celari-content`/`celari-inpage` plaintext blocks (`content.js:199-253`) plus the early hand-off at `content.js:81-85`.
- **Add:** a `provider-*` relay that mirrors the wallet-sdk relay (`content.js:104-197`) — create the MessageChannel on `provider-discovery-approved`, keep `port1`, transfer `port2` to inpage, forward encrypted frames both ways. Pure relay; no crypto in the content script.
- Keep the existing extension-context-invalidation guards (`safeRuntimeSend`, `content.js:20-39`) and the Nethermind faucet auto-fill block.

### 4.6 Bug fixes baked in
- **`getWithdrawProof`:** routed through the encrypted channel → no allowlist drop → withdraw flow works. (The old allowlist is deleted entirely.)
- **`connect()` contract:** `DAPP_CONNECT` currently returns `{success, pending:true}` with no address (`background.js:1140-1143`). New behavior: after popup approval + account selection, the provider-secure-response carries `{ success, address }`, satisfying `useCelariExtension.ts` and `getAddress()`.

### 4.7 Website impact
None expected. Public method names and shapes are preserved (`connect`, `getAddress`, `getCompleteAddress`, `sendTransaction`, `createAuthWit`, `isConnected`, `getWithdrawProof`, `on`, `off`). Provider readiness is handled by lazy handshake inside the first call. We will still smoke-test `useCelariExtension` + `useWithdrawFlow` end-to-end.

### 4.8 Manifest
- Set the content script `run_at: "document_start"` (`extension/public/manifest.json`) so the inpage provider injects early enough for hardening to be effective.
- COOP/COEP and `sidePanel` are **out of scope** (Phase 3).

### 4.9 Error handling
- Method calls issued before the handshake completes queue in the inpage `pendingRequests` map and flush once the session key is ready; existing 5-minute timeout retained as a backstop.
- If the channel is blocked (anti-hijack) the provider rejects calls with a clear `"Celari channel blocked"` error.
- Decrypt failures are dropped with a warning (matches current `secure-message` behavior, `background.js:245-248`).
- Extension-context-invalidation continues to be caught synchronously via `safeRuntimeSend`.

---

## 5. Security Model & Residual Risk (honest)

- **Defends against:** passive in-page eavesdroppers (ads/analytics/other extensions reading `postMessage`), and message spoofing/injection (no key → cannot forge encrypted frames; `MessagePort` is point-to-point).
- **Does not fully defend against:** a fully-compromised page that controls main-world script execution order and can monkeypatch `crypto.subtle` before our provider loads. This residual is inherent to *every* inpage provider (MetaMask, Azguard included); `document_start` injection + native-ref capture + `defineProperty` reduce the window, and the **sign-popup user confirmation** is the backstop for high-value operations. This is documented, not hidden.

---

## 6. Verification

- **Unit:** ECDH app↔wallet symmetry round-trip — inpage encrypt → background decrypt → background encrypt → inpage decrypt, asserting payload equality and that `isApp` salt ordering matches `_wsSaltFromKeys`.
- **Manual / integration:**
  1. Website `connect()` returns the approved address; `getAddress()` matches.
  2. Bridge withdraw end-to-end: `sendTransaction(bridge_exit)` → `getWithdrawProof` resolves (no hang).
  3. A second in-page `<script>` cannot overwrite `window.celari` and cannot read provider request/response contents off `window` `message` events.
  4. Existing external-dApp wallet-sdk channel still works (no regression).
- **Build:** `node extension/build.mjs` succeeds; load unpacked extension; console shows the provider injected once.

---

## 7. Files Touched
- `extension/public/src/inpage.js` — hardening + encrypted client + lazy handshake.
- `extension/public/src/content.js` — remove plaintext path; add `provider-*` relay.
- `extension/public/src/background.js` — `provider-*` session handling + route to existing legacy handlers; `connect` returns address.
- `extension/public/manifest.json` — `run_at: document_start`.
- `extension/build.mjs` — rebuild only (no expected source change).
- Website: no change expected (smoke-tested).

## 8. Out of Scope (next specs)
- Phase 2 — Ecosystem parity (generic RPC + `aztec_*` + API expansion).
- Phase 3 — Proving + UX parity (COOP/COEP + sidePanel).
