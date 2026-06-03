# Ecosystem Parity (Phase 2) — Design

- **Date:** 2026-06-03
- **Status:** Approved design — ready for implementation plan
- **Branch:** `feat/ecosystem-parity-phase2` (stacked on `feat/secure-transport-phase1`)
- **Depends on:** Phase 1 encrypted `window.celari` provider channel (`handleProviderMethod`, `_providerRespond`, the encrypted session in `_wsActiveSessions` with `kind:"provider"`).

---

## 1. Background & Motivation

Azguard exposes a **generic** dApp API: `window.azguard.createClient().request(method, params)` with `aztec_*` method names, plus `registerContract`/`registerSender`/`getContractMetadata` and friends. Celari's `window.celari` is bespoke (`connect`/`sendTransaction`/…). This phase brings ecosystem parity so external Aztec dApps work against `window.celari` without bespoke code.

### Key finding (verified): the PXE side is already done
`offscreen.js` `handleWalletMethod` (`:1520`) already implements the full Aztec wallet-sdk method set — `getAccounts`, `getChainInfo`, `getAddressBook`, `registerSender`, `registerContract`, `getContractMetadata`, `getContractClassMetadata`, `executeUtility`, `simulateTx`, `sendTx`, `profileTx`, `createAuthWit`, `getPrivateEvents` — and external `@aztec/wallet-sdk` dApps already drive it over the wallet-sdk encrypted channel via `PXE_WALLET_METHOD` (with `WalletSchema` arg deserialization, `offscreen.js:1775-1793`). So Phase 2 is mostly **surfacing this through the `window.celari` provider channel** as a generic `request()`, not new PXE work.

### Write-gating + lock handling already exist
`lib/ws-lock-gate.js`: `WS_WRITE_METHODS = Set(["sendTx","createAuthWit"])`, `classifySecureMessage({method, locked, writeMethods}) → "sign-popup" | "unlock-then-resume" | "forward"`. Reused verbatim for the provider generic path.

---

## 2. Goals / Non-Goals

### Goals
1. `window.celari.createClient()` → `{ request(method, params), on(event, cb), off(event, unsub) }`, plus shortcut `window.celari.request/on/off`.
2. `request("aztec_<m>", params)` routes generic Aztec methods through the existing PXE path over the encrypted provider channel; reads forward straight, writes (`sendTx`/`createAuthWit`) gate through the sign popup, locked reads trigger unlock-then-resume.
3. Expose the expanded dApp API (`aztec_registerContract`/`aztec_registerSender`/`aztec_getContractMetadata`/`aztec_getContractClassMetadata`/`aztec_getAccounts`/`aztec_getChainInfo`/`aztec_simulateTx`/`aztec_sendTx`/`aztec_createAuthWit`/`aztec_profileTx`/`aztec_getPrivateEvents`/`aztec_getAddressBook`/`aztec_executeUtility`).
4. Keep the bespoke methods (`connect`/`getAddress`/`getCompleteAddress`/`sendTransaction`/`createAuthWit`/`isConnected`/`getWithdrawProof`) working as back-compat (the website uses them).
5. Surface the provider session's `verificationHash` as a fingerprint in the connect/sign popup (MITM detection on this channel).
6. Emit `accountsChanged` / `networkChanged` push events to connected provider tabs so `window.celari.on(...)` fires.

### Non-Goals
- New PXE method implementations (already present).
- Changing the wallet-sdk channel behavior (untouched; the provider path reuses its PXE path).
- Phase 3 (COOP/COEP + sidePanel).

---

## 3. Design

### 3.1 inpage (`window.celari`)
- Add `createClient()` returning `{ request, on, off }`. `request(method, params)` calls the existing encrypted `sendRequest` with a generic envelope (provider method `"RPC"`, payload `{ rpcMethod: method, params }`). `on`/`off` reuse the existing event-listener mechanism (already present, listening for `target:"celari-provider-page"` event messages).
- Add shortcuts `window.celari.request/on/off` delegating to the same.
- Keep all existing bespoke methods unchanged.

### 3.2 background (`handleProviderMethod` generic branch)
- Add a `"RPC"` method case (in addition to the bespoke set). For `RPC`: `const m = payload.rpcMethod; const bare = m.startsWith("aztec_") ? m.slice(6) : m;`
- Validate `bare` is in the allowed wallet-sdk method set (reuse a shared list; reject otherwise).
- **Reuse the PXE executor, NOT the wallet-sdk sign/lock machinery** (lower risk — leave the working wallet-sdk `_wsPendingSignRequests`/`wssign`/locked-queue/`WS_APPROVE_SIGN` paths untouched). Build a wallet-sdk-style decrypted message `{ type: bare, args: params, messageId: requestId }` (the outer provider `requestId` becomes the `messageId` so the response can be echoed).
- `parseProviderRpc(rpcMethod).isWrite` (= `WS_WRITE_METHODS.has(bare)`):
  - **read:** call `_wsForwardToPxe(decrypted, session, sessionId)` — the existing helper (`background.js:290`) that does `PXE_WALLET_METHOD` → `handleWalletMethod` → encrypt + reply. Make `_wsForwardToPxe` **`session.kind`-aware**: when `kind === "provider"`, parse its `responsePayload` and reply via `_providerRespond(session, sessionId, decrypted.messageId, parsed.error ? {success:false, error: parsed.error} : {success:true, result: parsed.result})`; else the existing wallet-sdk `secure-response` (unchanged). This is the ONE additive change to shared code; wallet-sdk sessions are unaffected. A locked read is already handled inside `_wsForwardToPxe` (returns `WALLET_LOCKED`), so it flows back over the provider channel automatically and the dApp can retry after unlocking — no unlock-queue threading needed.
  - **write** (`sendTx`/`createAuthWit`): reuse the **provider channel's own** confirm/sign flow from Phase 1.5 — park in `pendingSignRequests` tagged `kind:"rpc-write"` with `{ decrypted, session, sessionId, requestId }`, open `popup.html?confirm=<signId>`; the existing `SIGN_APPROVE` handler gets an `rpc-write` branch that calls `_wsForwardToPxe(decrypted, session, sessionId)` (→ provider response via the `kind` branch); reject routes a `{success:false, error}` provider response.
- The bespoke method cases (`DAPP_*`, `GET_*`, `GET_WITHDRAW_PROOF`) stay as-is. Net new background code: the `RPC` dispatch in `handleProviderMethod`, the `session.kind` branch in `_wsForwardToPxe`, and an `rpc-write` branch in `SIGN_APPROVE`.

### 3.3 offscreen
No change. The provider RPC path reuses `PXE_WALLET_METHOD` → `handleWalletMethod`, so `WalletSchema` arg deserialization and responses are identical to the wallet-sdk channel.

### 3.4 Pure helper (`lib/provider-rpc.js`) — unit-tested
`parseProviderRpc(method, writeMethods?)` → `{ bare, isWrite }` where `bare` strips a leading `aztec_`, `isWrite = WS_WRITE_METHODS.has(bare)`. Plus `ALLOWED_RPC_METHODS` (the wallet-sdk method set) and `isAllowedRpc(method)`. Used by background; lets the routing decision be unit-tested without chrome/PXE.

### 3.5 verificationHash fingerprint UX
On a provider `connect` (and on each sign-popup open), include the session `verificationHash` so the popup can show a short fingerprint (emoji or grouped hex) the user can eye-compare. Reuse/extend the existing `WS_SESSION_ESTABLISHED` popup handling (`popup.js:4127`) and the connect/confirm screens. Background already stores `verificationHash` on the provider session (`background.js:248`).

### 3.6 on() push events
- Track connected provider tabs (already in `_wsActiveSessions`, filtered by `kind:"provider"`).
- In `SET_ACTIVE_ACCOUNT` (`background.js:1005`): after switching, broadcast `accountsChanged` with the new active address to each connected provider tab.
- In `SET_NETWORK` (`background.js:909`): broadcast `networkChanged` with the new network/chain id.
- Broadcast = `chrome.tabs.sendMessage(tabId, { origin: <bg>, type:"provider-event", event, payload })` → content forwards via `window.postMessage({ target:"celari-provider-page", event, payload }, origin)` → inpage `on()` handler fires (it already matches `target:"celari-provider-page"` + `event`).
- content gains one new case to forward `provider-event` messages to the page.

### 3.7 Data flow
- **Generic read:** `request("aztec_getAccounts")` → inpage encrypt → content relay → background decrypt → RPC branch → classify `forward` → `PXE_WALLET_METHOD` → `handleWalletMethod("getAccounts")` → result → `_providerRespond` → inpage resolves.
- **Write:** `request("aztec_sendTx", [txReq, opts])` → … classify `sign-popup` → confirm popup (shows method + origin + fingerprint) → approve → forward to PXE → respond with the tx result.
- **Locked read:** classify `unlock-then-resume` → unlock popup → replay → respond.
- **Event:** user switches account in the wallet → `SET_ACTIVE_ACCOUNT` → broadcast `accountsChanged` → connected dApps' `on("accountsChanged")` fire.

### 3.8 Error handling & security
- Unknown/disallowed method → `{ success:false, error:"Unsupported method: <m>" }` (allowlist via `isAllowedRpc`).
- Write methods keep explicit per-call user approval (sign popup) + lock re-check on approve.
- Origin/session/`kind` guards from Phase 1 unchanged; the RPC path is gated identically.
- `verificationHash` surfacing gives users a way to detect a hijacked/MITM'd provider session.

---

## 4. Verification

- **Unit:** `parseProviderRpc` — strips `aztec_`; `isWrite` true for `sendTx`/`createAuthWit`, false for reads; `isAllowedRpc` rejects unknown methods. (Reuses the proven `WS_WRITE_METHODS`/`classifySecureMessage` logic, which keeps its existing tests.)
- **Manual / integration (extension loaded):**
  1. From a page: `const c = window.celari.createClient(); await c.request("aztec_getAccounts")` returns the account(s); `await c.request("aztec_getChainInfo")` returns chain info.
  2. `c.request("aztec_sendTx", [...])` opens the confirm popup (with fingerprint), approve → resolves with a tx result; reject → rejects.
  3. `aztec_registerContract` / `aztec_getContractMetadata` round-trip.
  4. Locked wallet + a read → unlock popup appears, request replays after unlock.
  5. `c.on("accountsChanged", cb)` fires when the user switches the active account; `networkChanged` on network switch.
  6. The bespoke website flows (connect/getAddress/withdraw) and the external `@aztec/wallet-sdk` channel still work (no regression).
- **Build:** `node extension/build.mjs` green; `npx jest extension/test` green (new `provider-rpc` test).

---

## 5. Files Touched
- `extension/public/src/inpage.js` — `createClient()` + `request/on/off` (+ shortcuts); reuse existing encrypted transport + event listener.
- `extension/public/src/lib/provider-rpc.js` — new pure helper (`parseProviderRpc`, `ALLOWED_RPC_METHODS`, `isAllowedRpc`) + `extension/test/provider-rpc.test.ts`.
- `extension/public/src/lib/provider-protocol.js` — add the `"RPC"` provider method + `provider-event` type constant.
- `extension/public/src/background.js` — RPC branch in `handleProviderMethod` (forward/sign-popup/unlock-resume reusing existing PXE + gate); `provider-event` broadcast in `SET_ACTIVE_ACCOUNT`/`SET_NETWORK`; pass `verificationHash` to the popup on provider connect/sign.
- `extension/public/src/content.js` — forward `provider-event` messages to the page.
- `extension/public/src/pages/popup.js` — render the `verificationHash` fingerprint on connect/confirm screens.

## 6. Out of Scope
- Phase 3 (COOP/COEP threaded proving + sidePanel).
- New PXE methods (already implemented).
