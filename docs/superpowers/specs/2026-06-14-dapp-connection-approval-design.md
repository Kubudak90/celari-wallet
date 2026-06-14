# dApp Connection Approval Screen

**Date:** 2026-06-14
**Status:** Approved (design)

## Goal

Add an azguard-style **connection-approval screen**: when a dApp tries to connect, the user explicitly approves (or rejects) before the wallet reveals itself. Approved origins are remembered so repeat connections are silent. Applies to both the standard Aztec `wallet-sdk` path and the custom `window.celari` provider path.

## Background / constraint

Celari currently **auto-approves** discovery (`background.js` `discovery-request` and `provider-discovery` handlers) because of an (incorrect) assumption that the dApp discovery timeout is ~3–5s. The real `@aztec/wallet-sdk` `DEFAULT_DISCOVERY_TIMEOUT_MS` is **60s** — so a user-approval popup at discovery time is safe. The subsequent ECDH key-exchange (`establishSecureChannel`) has a **2s** `KEY_EXCHANGE_TIMEOUT_MS`, but that step is pure crypto with no UI, so it stays well under 2s. Therefore approval must happen at the **discovery** step, before `discovery-approved`/`discovery-response` is sent.

## Design (Approach A)

### Flow (wallet-sdk path)
1. `discovery-request` arrives → resolve `origin` from `sender.tab.url`.
2. If `origin` ∈ allowlist → send `discovery-approved` immediately (today's behavior).
3. Else → park the request in `_wsPendingConnectApprovals` (keyed by `approvalId`) and open `popup.html?wsconnect=<approvalId>`. Auto-expire after ~55s (cleanup; the dApp's 60s discovery window will lapse on its own).
4. Approval screen shows `origin`, `appId`, icon → **Bağlan / Reddet**.
   - **Approve** → `WS_APPROVE_CONNECT {approvalId}`: add `origin` to `celari_connected_sites`, then send the parked `discovery-approved`. Remaining flow (MessageChannel → key-exchange) is unchanged and automatic.
   - **Reject** → `WS_REJECT_CONNECT {approvalId}`: drop the parked request, send nothing (dApp never sees the wallet).
5. `provider-discovery` (`window.celari`) path mirrors this with the same allowlist and the same approval screen, resuming `provider-discovery-approved` on approve.

### Components
- **background.js**
  - Load allowlist on startup (`restoreState`) into `state.connectedSites` and read `chrome.storage.local.celari_connected_sites`.
  - Gate `discovery-request` and `provider-discovery`: allowlist check → auto-approve, else queue + open approval popup.
  - `_wsPendingConnectApprovals: Map<approvalId, {kind:"ws"|"provider", requestId, tabId, origin, appId, name, chainInfo, createdAt}>`.
  - Popup message handlers: `WS_GET_PENDING_CONNECT {approvalId}` → returns `{origin, appId, kind}`; `WS_APPROVE_CONNECT {approvalId}` → remember + resume; `WS_REJECT_CONNECT {approvalId}` → drop.
  - Site removal: `WS_REMOVE_CONNECTED_SITE {origin}` → remove from allowlist + tear down any active `_wsActiveSessions`/`provider` sessions for that origin (send `session-disconnected`).
  - `WS_LIST_CONNECTED_SITES` → returns the allowlist for Settings.
- **popup.js**
  - `?wsconnect=<approvalId>` screen, mirroring the existing `?wssign=` screen: on load query `WS_GET_PENDING_CONNECT`, render approval card, wire Bağlan/Reddet → send message → `window.close()`.
  - Settings → new **"Bağlı Siteler"** section: list `celari_connected_sites` with a ✕ remove per row (`WS_REMOVE_CONNECTED_SITE`).
- **Storage:** `chrome.storage.local.celari_connected_sites = [{origin, appId, name, addedAt}]`.

### Scope decisions (v1)
- Approval (at discovery) and unlock (at first method) remain **separate** — a locked+unapproved first connect shows two popups (approve, then unlock). Combining is a future enhancement.
- Reject is **silent** (no discovery-response).
- Approve **always remembers** the origin (azguard-like). A per-connect "don't remember" checkbox is a future enhancement.

### Error / edge handling
- No account yet: approval still proceeds; method-level gates (getAccounts → []/unlock) handle the rest.
- Approval popup closed without action: parked request expires (~55s); dApp discovery times out → silent (same as reject).
- Duplicate discovery-requests from the same origin while a popup is open: dedupe by origin (focus existing popup rather than opening a second).

### Testing
- Headless-CDP dApp harness (`/tmp/celari-harness3.mjs` + `/tmp/dapp-test`, real `@aztec/wallet-sdk`): first connect from a new origin → approval popup target (`popup.html?wsconnect=`) appears; approve → `getAccounts` proceeds; second connect from same origin → no popup (allowlisted). Reject → dApp sees no wallet.
- Unit-level: an allowlist gate helper (origin ∈ sites?) in `extension/public/src/lib/` with a test mirroring existing `extension/test/*.test.ts`.
