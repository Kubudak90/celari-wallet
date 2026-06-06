/**
 * Celari Wallet -- Background Service Worker
 *
 * Runs in the extension's background context.
 * Manages:
 * - PXE connection state
 * - Account registry
 * - Transaction queue
 * - dApp communication (via content script)
 */

import { sanitizeRpcError } from "./lib/sanitize.js";
import { WS_WRITE_METHODS, classifySecureMessage } from "./lib/ws-lock-gate.js";
import { selectActiveAddress } from "./lib/provider-accounts.js";
import { PROVIDER_METHODS } from "./lib/provider-protocol.js";
import { isAllowedRpc, parseProviderRpc } from "./lib/provider-rpc.js";
import {
  wsGenerateKeyPair as _wsGenerateKeyPair,
  wsExportPublicKey as _wsExportPublicKey,
  wsImportPublicKey as _wsImportPublicKey,
  wsDeriveSessionKeys as _wsDeriveSessionKeys,
  wsEncrypt as _wsEncrypt,
  wsDecrypt as _wsDecrypt,
} from "./lib/ws-crypto.js";

// --- Network Presets -------------------------------------------------

const NETWORKS = {
  "local": {
    name: "Local Sandbox",
    url: "http://localhost:8080",
    hasSponsoredFPC: true,
  },
  "devnet": {
    name: "Aztec Devnet",
    url: "https://devnet-6.aztec-labs.com/",
    hasSponsoredFPC: true,
  },
  "testnet": {
    name: "Aztec Testnet",
    url: "https://rpc.testnet.aztec-labs.com/",
    hasSponsoredFPC: false,
  },
  "mainnet": {
    name: "Aztec Mainnet",
    url: "https://rpc.aztec.network/",
    hasSponsoredFPC: false,
  },
};

// ─── Wallet-SDK v4.2.0: ECDH Crypto ── sourced from ./lib/ws-crypto.js ──

// ─── Wallet-SDK v4.2.0: Session State ──────────────────────────────────
const CELARI_WALLET_ID_WS = "celari-wallet";
const _WS_BG = "background";
const _WS_CS = "content-script";

const _wsPendingDiscoveries  = new Map(); // requestId → { tabId, origin, appId, chainInfo }
const _wsActiveSessions      = new Map(); // sessionId → { tabId, origin, appId, encryptionKey, verificationHash }
const _wsPendingSignRequests = new Map(); // signId → { sessionId, tabId, origin, method, decrypted, encryptionKey }

// dApp read-class requests that arrived while the wallet was locked, parked
// until the user unlocks. Keyed by an internal id. Drained by
// _wsDrainLockedReads() when WS_WALLET_UNLOCKED arrives from the popup.
const _wsPendingLockedReads = new Map(); // id → { decrypted, session, sessionId, timer }
let _wsUnlockWindowId = null;             // single shared unlock popup window
const _WS_UNLOCK_TIMEOUT_MS = 5 * 60_000; // give up (and error) if never unlocked

// Reap the shared unlock-popup handle when the user closes it so a later
// dApp request can spawn a fresh one instead of focusing a dead window id.
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === _wsUnlockWindowId) _wsUnlockWindowId = null;
});

async function _wsHandleProtocolMessage(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;
  const { type, sessionId, content } = message;

  switch (type) {

    case "discovery-request": {
      const { requestId, appId, chainInfo } = content || {};
      if (!requestId) return;
      const origin = sender.tab?.url ? new URL(sender.tab.url).origin : "unknown";
      _wsPendingDiscoveries.set(requestId, { tabId, origin, appId, chainInfo, createdAt: Date.now() });
      // Auto-expire discovery if key exchange never arrives (prevents unbounded growth)
      setTimeout(() => _wsPendingDiscoveries.delete(requestId), 30_000);

      // Auto-approve discovery. A user confirmation popup here would exceed the
      // dApp's discovery timeout (~3-5s in wallet-sdk). Real authorization is
      // enforced at the sign-request step below via the wssign popup, where
      // every sendTx / createAuthWit requires explicit user approval.
      chrome.tabs.sendMessage(tabId, {
        origin: _WS_BG,
        type: "discovery-approved",
        sessionId: requestId,
        content: {
          id: CELARI_WALLET_ID_WS,
          name: "Celari Wallet",
          version: "0.5.0",
          icon: chrome.runtime.getURL("icons/icon-48.png"),
        },
      }).catch(() => {});
      break;
    }

    case "key-exchange-request": {
      const discovery = _wsPendingDiscoveries.get(sessionId);
      if (!discovery || discovery.tabId !== tabId) return;
      try {
        const keyPair      = await _wsGenerateKeyPair();
        const peerPubKey   = await _wsImportPublicKey(content.publicKey);
        const { encryptionKey, verificationHash } = await _wsDeriveSessionKeys(keyPair, peerPubKey, false);
        const walletPubKey = await _wsExportPublicKey(keyPair.publicKey);

        _wsActiveSessions.set(sessionId, {
          tabId: discovery.tabId,
          origin: discovery.origin,
          appId: discovery.appId,
          encryptionKey,
          verificationHash,
        });
        _wsPendingDiscoveries.delete(sessionId);

        chrome.tabs.sendMessage(discovery.tabId, {
          origin: _WS_BG,
          type: "key-exchange-response",
          sessionId,
          content: {
            type: "aztec-wallet-key-exchange-response",
            requestId: sessionId,
            publicKey: walletPubKey,
          },
        }).catch(() => {});

        // Notify popup (for toast + optional emoji display)
        chrome.runtime.sendMessage({
          type: "WS_SESSION_ESTABLISHED",
          sessionId,
          origin: discovery.origin,
          verificationHash,
        }).catch(() => {});

      } catch (e) {
        console.warn("[WalletSDK] Key exchange failed:", e.message);
        _wsPendingDiscoveries.delete(sessionId);
      }
      break;
    }

    case "secure-message": {
      const session = _wsActiveSessions.get(sessionId);
      if (!session || session.tabId !== tabId || session.kind === "provider") return;

      let decrypted;
      try {
        decrypted = await _wsDecrypt(session.encryptionKey, content);
      } catch (e) {
        console.warn("[WalletSDK] Decrypt failed:", e.message);
        return;
      }

      // Route by method + lock state:
      //  - write methods → wssign confirmation popup (self-gates unlock)
      //  - locked read   → unlock popup + queue, replay once unlocked
      //  - unlocked read → straight to PXE
      const methodName = decrypted?.type;
      const action = classifySecureMessage({
        method: methodName,
        locked: await _bgIsLocked(),
        writeMethods: WS_WRITE_METHODS,
      });

      if (action === "sign-popup") {
        const signId = `sign_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        _wsPendingSignRequests.set(signId, {
          sessionId,
          tabId: session.tabId,
          origin: session.origin,
          method: methodName,
          decrypted,
          encryptionKey: session.encryptionKey,
          createdAt: Date.now(),
        });
        // Auto-expire after 5 min if user doesn't act
        setTimeout(() => {
          if (_wsPendingSignRequests.has(signId)) {
            _wsPendingSignRequests.delete(signId);
          }
        }, 5 * 60_000);
        chrome.windows.create({
          url: `popup.html?wssign=${encodeURIComponent(signId)}`,
          type: "popup",
          width: 380,
          height: 600,
          focused: true,
        }).catch((e) => console.warn("[WalletSDK] sign popup create failed:", e?.message || e));
        // Response is sent later, after user acts (WS_APPROVE_SIGN / WS_REJECT_SIGN)
        break;
      }

      if (action === "unlock-then-resume") {
        // Locked + read-class — typically the connect handshake's
        // requestCapabilities / getAccounts. Surface the unlock screen and
        // replay this request once the user unlocks (response is sent later).
        _wsQueueLockedRead(decrypted, session, sessionId);
        break;
      }

      // "forward": unlocked read — run immediately.
      await _wsForwardToPxe(decrypted, session, sessionId);
      break;
    }

    case "disconnect-request": {
      const session = _wsActiveSessions.get(sessionId);
      const pending = _wsPendingDiscoveries.get(sessionId);
      if (session && session.tabId === tabId) _wsActiveSessions.delete(sessionId);
      if (pending && pending.tabId === tabId) _wsPendingDiscoveries.delete(sessionId);
      break;
    }

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
      const pending = _wsPendingDiscoveries.get(sessionId);
      if (pending && pending.tabId === tabId) _wsPendingDiscoveries.delete(sessionId);
      break;
    }
  }
}

// Reply to a decrypted wallet-method call. Wallet-sdk sessions get the raw
// wallet-sdk secure-response; provider sessions (kind:"provider") get a
// provider-secure-response carrying {success, result}/{success, error}, keyed
// by the provider requestId (stashed as decrypted.messageId by the RPC router).
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

// Shared helper: forward a decrypted wallet-sdk message to the offscreen PXE,
// encrypt the response with the session key, and send it back to the dApp tab.
async function _wsForwardToPxe(decrypted, session, sessionId) {
  if (await _bgIsLocked()) {
    const responsePayload = JSON.stringify({
      messageId: decrypted.messageId,
      error: "Wallet locked",
      code: "WALLET_LOCKED",
      walletId: CELARI_WALLET_ID_WS,
    });
    await _wsReplyDecrypted(session, sessionId, decrypted, responsePayload);
    return;
  }
  let responsePayload;
  try {
    const pxeResult = await sendToPXE({
      type: "PXE_WALLET_METHOD",
      rawMessage: JSON.stringify(decrypted),
    });
    responsePayload = pxeResult?.rawResponse || JSON.stringify({
      messageId: decrypted.messageId,
      error: sanitizeRpcError({ message: pxeResult?.error || "PXE returned no result" }),
      walletId: CELARI_WALLET_ID_WS,
    });
  } catch (e) {
    responsePayload = JSON.stringify({
      messageId: decrypted.messageId,
      error: sanitizeRpcError(e),
      walletId: CELARI_WALLET_ID_WS,
    });
  }
  await _wsReplyDecrypted(session, sessionId, decrypted, responsePayload);
}

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

// Read the address the wallet should expose to a dApp (active account; the
// address exists pre-deploy and dApps need it to fund/claim Fee Juice).
async function _providerActiveAddress() {
  const { celari_accounts } = await chrome.storage.local.get("celari_accounts");
  return selectActiveAddress(celari_accounts || [], state.activeAccountIndex ?? 0);
}

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

// Route one decrypted provider request. `decrypted` = { method, payload, requestId }.
async function handleProviderMethod(decrypted, session, sessionId) {
  const { method, payload, requestId } = decrypted || {};
  if (method === "RPC") {
    const rpcMethod = payload?.rpcMethod;
    const params = payload?.params ?? [];
    if (!isAllowedRpc(rpcMethod)) {
      return _providerRespond(session, sessionId, requestId, { success: false, error: `Unsupported method: ${rpcMethod}` });
    }
    const { bare, isWrite } = parseProviderRpc(rpcMethod);
    // Wallet-sdk-style message; messageId = provider requestId so the
    // kind-aware reply (_wsForwardToPxe → _wsReplyDecrypted) echoes it back.
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
      kind: payload?.transaction?.type === "bridge_exit" ? "bridge_exit" : "sign",
      verificationHash: session.verificationHash,
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
      try { chrome.action.openPopup(); } catch {}
      return _providerRespond(session, sessionId, requestId, { success: false, error: "Wallet is locked — unlock Celari and retry", code: "WALLET_LOCKED" });
    }
    const address = await _providerActiveAddress();
    if (!address) return _providerRespond(session, sessionId, requestId, { success: false, error: "No account — open Celari to create one" });
    return _providerRespond(session, sessionId, requestId, { success: true, address });
  }
  if (method === "GET_COMPLETE_ADDRESS") {
    const { celari_accounts } = await chrome.storage.local.get("celari_accounts");
    const address = await _providerActiveAddress();
    const acc = (celari_accounts || []).find((a) => a.address === address);
    if (!acc) return _providerRespond(session, sessionId, requestId, { success: false, error: "No account" });
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

// Send an encrypted error back to the dApp (used when a sign request is rejected).
async function _wsSendSignError(pending, errorMsg) {
  try {
    const errPayload = JSON.stringify({
      messageId: pending.decrypted.messageId,
      error: errorMsg,
      walletId: CELARI_WALLET_ID_WS,
    });
    const encrypted = await _wsEncrypt(pending.encryptionKey, errPayload);
    chrome.tabs.sendMessage(pending.tabId, {
      origin: _WS_BG,
      type: "secure-response",
      sessionId: pending.sessionId,
      content: encrypted,
    }).catch(() => {});
  } catch (e) {
    console.warn("[WalletSDK] sign error send failed:", e?.message || e);
  }
}

// ─── Unlock-on-connect: locked read-class requests ───────────────────
// When a dApp sends a read-class wallet-sdk message (the connect handshake)
// to a locked wallet, we open the unlock popup and park the request here
// instead of failing it. _wsDrainLockedReads() replays them after unlock.

// Open (or focus) the unlock popup. Deduped via _wsUnlockWindowId so a burst
// of read calls during a single connect shares one window.
async function _wsOpenUnlockPopup() {
  if (_wsUnlockWindowId != null) {
    try {
      await chrome.windows.update(_wsUnlockWindowId, { focused: true });
      return;
    } catch {
      _wsUnlockWindowId = null; // window was closed — fall through and recreate
    }
  }
  try {
    const win = await chrome.windows.create({
      url: "popup.html?unlock=1",
      type: "popup",
      width: 380,
      height: 600,
      focused: true,
    });
    _wsUnlockWindowId = win?.id ?? null;
  } catch (e) {
    console.warn("[WalletSDK] unlock popup create failed:", e?.message || e);
  }
}

// Park a locked read request and ensure the unlock popup is showing. Each
// request self-expires (and errors back to the dApp) if never unlocked, so a
// dismissed popup never leaves the dApp hanging forever.
function _wsQueueLockedRead(decrypted, session, sessionId) {
  const id = `lr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const timer = setTimeout(() => {
    const pending = _wsPendingLockedReads.get(id);
    if (!pending) return;
    _wsPendingLockedReads.delete(id);
    _wsSendLockedError(pending).catch(() => {});
  }, _WS_UNLOCK_TIMEOUT_MS);
  _wsPendingLockedReads.set(id, { decrypted, session, sessionId, timer });
  _wsOpenUnlockPopup();
}

// Encrypted "Wallet locked" error for a queued read the user never unlocked.
async function _wsSendLockedError(pending) {
  try {
    const payload = JSON.stringify({
      messageId: pending.decrypted.messageId,
      error: "Wallet locked",
      code: "WALLET_LOCKED",
      walletId: CELARI_WALLET_ID_WS,
    });
    const encrypted = await _wsEncrypt(pending.session.encryptionKey, payload);
    chrome.tabs.sendMessage(pending.session.tabId, {
      origin: _WS_BG,
      type: "secure-response",
      sessionId: pending.sessionId,
      content: encrypted,
    }).catch(() => {});
  } catch (e) {
    console.warn("[WalletSDK] locked-error send failed:", e?.message || e);
  }
}

// Replay all parked reads after unlock. _wsForwardToPxe re-checks the lock,
// so a failed/partial unlock degrades safely to the locked error.
function _wsDrainLockedReads() {
  if (_wsPendingLockedReads.size === 0) return;
  const pending = [..._wsPendingLockedReads.values()];
  _wsPendingLockedReads.clear();
  for (const p of pending) {
    clearTimeout(p.timer);
    _wsForwardToPxe(p.decrypted, p.session, p.sessionId)
      .catch((e) => console.warn("[WalletSDK] resume-after-unlock failed:", e?.message || e));
  }
}

// --- Offscreen Document (PXE WASM Engine) ----------------------------

let offscreenReady = false;
let offscreenListenerReady = false; // True after offscreen JS has loaded and listener is registered
let offscreenInitError = null;
let offscreenInitInFlight = null; // Singleton: parallel callers share one init pass

async function _bgIsLocked() {
  try {
    const r = await chrome.storage.session.get(["celari_secret"]);
    return !r?.celari_secret;
  } catch (e) {
    return true;
  }
}

// ─── Idle lock ─────────────────────────────────────────────────────────
// Wipe plaintext signing material from chrome.storage.session after
// IDLE_LOCK_MINUTES of inactivity. Popup-close and dApp activity reset
// the countdown so a user actively using the wallet (popup open, dApp
// interactions, signing) never gets locked out mid-flow.
const IDLE_LOCK_MINUTES = 15;
const IDLE_LOCK_ALARM = "celari_idle_lock";

async function _scheduleIdleLock() {
  try {
    await chrome.alarms.create(IDLE_LOCK_ALARM, { delayInMinutes: IDLE_LOCK_MINUTES });
  } catch (e) {
    console.warn("[Celari] idle lock schedule failed:", e?.message || e);
  }
}

async function _clearIdleLock() {
  try { await chrome.alarms.clear(IDLE_LOCK_ALARM); } catch {}
}

async function _runIdleLock() {
  console.log(`[Celari] Idle lock fired after ${IDLE_LOCK_MINUTES}min — wiping session signing material`);
  try {
    await chrome.storage.session.remove(["celari_secret", "celari_private_key", "celari_keys"]);
    await chrome.storage.local.set({ celari_locked: true });
  } catch (e) {
    console.warn("[Celari] idle lock wipe failed:", e?.message || e);
  }
}

async function _ensureOffscreenImpl() {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    if (contexts.length > 0) {
      offscreenReady = true;
      if (!offscreenListenerReady) {
        await waitForOffscreenListener(10000);
      }
      if (offscreenListenerReady) {
        offscreenInitError = null;
        return;
      }
      // Document exists but listener never registered — fall through to retry,
      // which will close it before recreating.
    }
    // Document doesn't exist (or is stalled) — (re)create up to 3x
    for (let attempt = 1; attempt <= 3; attempt++) {
      offscreenReady = false;
      offscreenListenerReady = false;
      try {
        // Close any stale doc before recreating
        const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
        if (existing.length > 0) {
          try {
            await chrome.offscreen.closeDocument();
          } catch (e) {
            console.debug("[Celari bg] closeDocument failed (likely already closed):", e?.message || e);
          }
        }
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["WORKERS"],
          justification: "Aztec PXE WASM proving engine for zero-knowledge proofs",
        });
        offscreenReady = true;
        console.log(`Offscreen attempt ${attempt}: created — waiting for listener...`);
        await waitForOffscreenListener(45000);
        if (offscreenListenerReady) {
          offscreenInitError = null;
          return;
        }
        console.warn(`Offscreen attempt ${attempt}: listener never registered`);
      } catch (e) {
        console.error(`Offscreen attempt ${attempt} failed:`, e?.message || e);
      }
    }
    offscreenInitError = "Offscreen engine failed to load after 3 attempts";
  } catch (e) {
    offscreenInitError = e?.message || "Offscreen creation failed";
    offscreenReady = false;
  }
}

// Public API: deduplicates concurrent callers via a singleton promise so
// parallel sendToPXE() calls don't race on createDocument/closeDocument.
function ensureOffscreen() {
  if (offscreenInitInFlight) return offscreenInitInFlight;
  offscreenInitInFlight = _ensureOffscreenImpl().finally(() => {
    offscreenInitInFlight = null;
  });
  return offscreenInitInFlight;
}

function waitForOffscreenListener(timeoutMs) {
  if (offscreenListenerReady) return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (offscreenListenerReady) { resolve(); return; }
      if (Date.now() - start > timeoutMs) {
        console.warn("Offscreen listener wait timed out — proceeding anyway");
        resolve();
        return;
      }
      setTimeout(check, 500);
    };
    check();
  });
}

/**
 * Send a message to the offscreen PXE document and await response.
 * Retries on "message port closed" (offscreen not ready yet).
 */
async function sendToPXE(msg, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await ensureOffscreen();
    try {
      const taggedMsg = { ...msg, _target: "offscreen" };
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(taggedMsg, (response) => {
          if (chrome.runtime.lastError) {
            offscreenReady = false;
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
      return result;
    } catch (e) {
      const isPortClosed = e.message?.includes("port closed") || e.message?.includes("Could not establish connection");
      if (isPortClosed && attempt < retries) {
        console.log(`sendToPXE: retry ${attempt + 1}/${retries} for ${msg.type} — ${e.message}`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // 1s, 2s, 3s backoff
        offscreenReady = false; // Force re-check
        continue;
      }
      throw e;
    }
  }
}

// --- Pending dApp sign requests (awaiting user confirmation) ---------

const pendingSignRequests = new Map();

// --- State -----------------------------------------------------------

let state = {
  connected: false,
  nodeUrl: "https://rpc.testnet.aztec-labs.com/",
  network: "testnet",
  nodeInfo: null, // { nodeVersion, l1ChainId, protocolVersion, ... }
  accounts: [],
  activeAccountIndex: 0,
};

// --- Message Handler -------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Defense in depth: reject any message that doesn't originate from our own
  // extension's content scripts / popup / offscreen. externally_connectable is
  // omitted from the manifest (default = no external access), so external
  // pages can't reach this listener at all — this guard catches anything
  // unexpected that slips through (e.g. a malicious extension bridging via
  // tab.sendMessage).
  if (sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: "Unauthorized sender" });
    return false;
  }

  // Wallet-SDK v4.2.0 internal protocol (content script → background)
  if (message?.origin === _WS_CS) {
    // Any dApp interaction counts as activity — push the idle lock back.
    if (message.type === "secure-message" || message.type === "provider-secure-message") _scheduleIdleLock();
    _wsHandleProtocolMessage(message, sender).catch(e => console.warn("[WalletSDK]", e.message));
    return false; // fire-and-forget, no sendResponse needed
  }

  // Skip messages tagged for offscreen document (prevents routing loop)
  if (message._target === "offscreen") return false;

  switch (message.type) {
    case "OFFSCREEN_READY":
      offscreenListenerReady = true;
      console.log("Offscreen JS loaded — listener active");
      sendResponse({ success: true });
      return;

    // Idle lock control — popup uses these to defer locking instead of
    // wiping session immediately on close.
    case "SCHEDULE_IDLE_LOCK":
      _scheduleIdleLock();
      sendResponse({ success: true, lockInMinutes: IDLE_LOCK_MINUTES });
      return;
    case "CLEAR_IDLE_LOCK":
      _clearIdleLock();
      sendResponse({ success: true });
      return;

    // Offscreen document proxy for chrome.storage.local — offscreen pages
    // cannot reach chrome.storage themselves (only chrome.runtime is
    // available there), so dApp-driven flows like getAccounts route through
    // here.
    case "GET_STORED_ACCOUNTS":
      chrome.storage.local.get("celari_accounts", (data) => {
        sendResponse({ success: true, accounts: data?.celari_accounts || [] });
      });
      return true; // async sendResponse

    // Bundle stored account metadata + in-session plaintext signing material
    // so offscreen can lazy-register the account in PXE when a dApp method
    // (simulateTx / sendTx / createAuthWit) needs it after a fresh offscreen
    // boot. Requires the wallet to be unlocked (celari_secret in session) —
    // returns locked=true otherwise.
    case "GET_ACCOUNT_BUNDLE":
      (async () => {
        try {
          const [localR, sessionR] = await Promise.all([
            chrome.storage.local.get("celari_accounts"),
            chrome.storage.session.get(["celari_secret", "celari_private_key"]),
          ]);
          const accounts = (localR?.celari_accounts || []).filter(a => a?.deployed && a?.address);
          if (accounts.length === 0) {
            // Intentionally deployed-only: an undeployed account can't sign/send
            // a tx. The caller turns this code into a "deploy first" message.
            sendResponse({ success: false, error: "No deployed accounts", code: "NO_DEPLOYED_ACCOUNT" });
            return;
          }
          const target = message.address
            ? accounts.find(a => a.address?.toLowerCase() === String(message.address).toLowerCase())
            : accounts[0];
          if (!target) {
            sendResponse({ success: false, error: `No stored account for address ${message.address}` });
            return;
          }
          const secret = sessionR?.celari_secret;
          const privateKey = sessionR?.celari_private_key;
          if (!secret || !privateKey) {
            sendResponse({ success: false, error: "Wallet locked", code: "WALLET_LOCKED" });
            return;
          }
          sendResponse({
            success: true,
            bundle: {
              address: target.address,
              publicKeyX: target.publicKeyX,
              publicKeyY: target.publicKeyY,
              salt: target.salt,
              secretKey: secret,
              privateKeyPkcs8: privateKey,
            },
          });
        } catch (e) {
          sendResponse({ success: false, error: e?.message || String(e) });
        }
      })();
      return true;

    // Wallet-SDK v4.2.0: popup approval flow for dApp discovery
    case "WS_GET_PENDING_DISCOVERY": {
      const d = _wsPendingDiscoveries.get(message.requestId);
      if (d) {
        sendResponse({
          success: true,
          discovery: {
            requestId: message.requestId,
            origin: d.origin,
            appId: d.appId,
            chainInfo: d.chainInfo,
            createdAt: d.createdAt,
          },
        });
      } else {
        sendResponse({ success: false, error: "No pending discovery" });
      }
      break;
    }

    case "WS_APPROVE_DISCOVERY": {
      const d = _wsPendingDiscoveries.get(message.requestId);
      if (!d) { sendResponse({ success: false, error: "Not found" }); break; }
      chrome.tabs.sendMessage(d.tabId, {
        origin: _WS_BG,
        type: "discovery-approved",
        sessionId: message.requestId,
        content: {
          id: CELARI_WALLET_ID_WS,
          name: "Celari Wallet",
          version: "0.5.0",
          icon: chrome.runtime.getURL("icons/icon-48.png"),
        },
      }).catch(() => {});
      sendResponse({ success: true });
      break;
    }

    case "WS_REJECT_DISCOVERY": {
      _wsPendingDiscoveries.delete(message.requestId);
      sendResponse({ success: true });
      break;
    }

    // Wallet-SDK v4.2.0: popup approval flow for sendTx / createAuthWit
    case "WS_GET_PENDING_SIGN": {
      const req = _wsPendingSignRequests.get(message.requestId);
      if (!req) { sendResponse({ success: false, error: "No pending sign request" }); break; }
      let summary = "";
      try { summary = JSON.stringify(req.decrypted?.args || [], null, 2); }
      catch { summary = "(args not serializable)"; }
      if (summary.length > 3000) summary = summary.slice(0, 3000) + "\n… (truncated)";
      sendResponse({
        success: true,
        request: {
          id: message.requestId,
          origin: req.origin,
          method: req.method,
          summary,
          createdAt: req.createdAt,
        },
      });
      break;
    }

    case "WS_APPROVE_SIGN": {
      (async () => {
        if (await _bgIsLocked()) {
          sendResponse({ success: false, error: "Wallet is locked", code: "WALLET_LOCKED" });
          return;
        }
        const req = _wsPendingSignRequests.get(message.requestId);
        if (!req) { sendResponse({ success: false, error: "Not found" }); return; }
        _wsPendingSignRequests.delete(message.requestId);
        // Ack the popup immediately, run PXE async in background
        sendResponse({ success: true });
        const sessionForForward = { encryptionKey: req.encryptionKey, tabId: req.tabId };
        _wsForwardToPxe(req.decrypted, sessionForForward, req.sessionId)
          .catch((e) => console.warn("[WalletSDK] approved sign forward failed:", e?.message || e));
      })();
      return true;
    }

    case "WS_REJECT_SIGN": {
      const req = _wsPendingSignRequests.get(message.requestId);
      if (!req) { sendResponse({ success: false, error: "Not found" }); break; }
      _wsPendingSignRequests.delete(message.requestId);
      sendResponse({ success: true });
      _wsSendSignError(req, "User rejected the request").catch(() => {});
      break;
    }

    // Popup unlocked the wallet — replay any dApp read-class requests that
    // were parked while locked (e.g. a connect handshake). Fired from the
    // dedicated unlock popup and from a normal manual unlock alike.
    case "WS_WALLET_UNLOCKED": {
      _wsDrainLockedReads();
      sendResponse({ success: true });
      break;
    }

    case "GET_STATE":
      sendResponse({
        success: true,
        state: { ...state, offscreenInitError },
      });
      break;

    case "GET_NETWORKS": {
      chrome.storage.local.get("celari_custom_networks", (result) => {
        const customNetworks = result.celari_custom_networks || [];
        sendResponse({ success: true, networks: NETWORKS, customNetworks });
      });
      return true;
    }

    case "SET_NETWORK": {
      const preset = NETWORKS[message.network];
      if (preset) {
        state.nodeUrl = preset.url;
        state.network = message.network;
      } else if (message.nodeUrl) {
        state.nodeUrl = message.nodeUrl;
        state.network = message.networkId || "custom";
      }
      state.connected = false;
      state.nodeInfo = null;
      _providerBroadcastEvent("networkChanged", { network: state.network, nodeUrl: state.nodeUrl });

      // Save config
      chrome.storage.local.set({
        celari_config: { nodeUrl: state.nodeUrl, network: state.network },
      });

      checkConnection().then(() => sendResponse({ success: true, state }));
      return true; // async response
    }

    case "SAVE_CUSTOM_NETWORK": {
      chrome.storage.local.get("celari_custom_networks", (result) => {
        const networks = result.celari_custom_networks || [];
        // Prevent duplicate URLs
        const exists = networks.find(n => n.url === message.networkData.url);
        if (exists) {
          sendResponse({ success: false, error: "Network URL already exists" });
          return;
        }
        networks.push(message.networkData);
        chrome.storage.local.set({ celari_custom_networks: networks });
        sendResponse({ success: true, networks });
      });
      return true;
    }

    case "DELETE_CUSTOM_NETWORK": {
      chrome.storage.local.get("celari_custom_networks", (result) => {
        const networks = (result.celari_custom_networks || []).filter(n => n.id !== message.networkId);
        chrome.storage.local.set({ celari_custom_networks: networks });
        // If the deleted network was active, switch to testnet
        if (state.network === message.networkId) {
          state.nodeUrl = NETWORKS.testnet.url;
          state.network = "testnet";
          state.connected = false;
          state.nodeInfo = null;
          chrome.storage.local.set({
            celari_config: { nodeUrl: state.nodeUrl, network: state.network },
          });
          checkConnection();
        }
        sendResponse({ success: true, networks, state });
      });
      return true;
    }

    case "CONNECT":
      checkConnection().then((connected) => {
        sendResponse({ success: true, connected, nodeInfo: state.nodeInfo });
      });
      return true;

    case "SAVE_ACCOUNT":
      state.accounts.push(message.account);
      chrome.storage.local.set({ celari_accounts: state.accounts });
      sendResponse({ success: true });
      break;

    // Faucet cache — offscreen has no chrome.storage, relay through background
    case "GET_FAUCET_CACHE":
      chrome.storage.local.get("celari_faucet_admin", (stored) => {
        sendResponse({ data: stored.celari_faucet_admin || null });
      });
      return true;

    case "SET_FAUCET_CACHE":
      chrome.storage.local.set({ celari_faucet_admin: message.data });
      sendResponse({ success: true });
      break;

    case "GET_FAUCET_RATE":
      chrome.storage.local.get("celari_last_faucet", (stored) => {
        sendResponse({ lastFaucetTime: stored.celari_last_faucet || 0 });
      });
      return true;

    case "SET_FAUCET_RATE":
      chrome.storage.local.set({ celari_last_faucet: message.lastFaucetTime });
      sendResponse({ success: true });
      break;

    case "GET_ACCOUNTS":
      sendResponse({ success: true, accounts: state.accounts });
      break;

    case "SET_ACTIVE_ACCOUNT":
      state.activeAccountIndex = message.index;
      _providerActiveAddress().then((addr) => _providerBroadcastEvent("accountsChanged", addr ? [addr] : []));
      sendResponse({ success: true });
      break;

    case "UPDATE_ACCOUNT": {
      // Update account fields (e.g. deployed address, deployment status)
      const idx = message.index ?? state.activeAccountIndex;
      if (state.accounts[idx]) {
        Object.assign(state.accounts[idx], message.updates);
        chrome.storage.local.set({ celari_accounts: state.accounts });
        sendResponse({ success: true, account: state.accounts[idx] });
      } else {
        sendResponse({ success: false, error: "Account not found" });
      }
      break;
    }

    case "RENAME_ACCOUNT": {
      const idx = message.index ?? state.activeAccountIndex;
      if (state.accounts[idx] && message.label) {
        state.accounts[idx].label = message.label.slice(0, 24);
        chrome.storage.local.set({ celari_accounts: state.accounts });
        sendResponse({ success: true, account: state.accounts[idx] });
      } else {
        sendResponse({ success: false, error: "Account not found or missing label" });
      }
      break;
    }

    case "DELETE_ACCOUNT": {
      const idx = message.index;
      if (!(idx >= 0 && idx < state.accounts.length && state.accounts.length > 1)) {
        sendResponse({ success: false, error: "Cannot delete: invalid index or last account" });
        break;
      }
      const account = state.accounts[idx];
      // Try PXE deletion first; only mutate local state on success. Previously
      // local state was deleted before PXE, so a PXE failure would silently
      // desync the popup from the offscreen registry.
      sendToPXE({ type: "PXE_DELETE_ACCOUNT", data: { address: account.address } })
        .then(() => {
          state.accounts.splice(idx, 1);
          if (state.activeAccountIndex >= state.accounts.length) {
            state.activeAccountIndex = state.accounts.length - 1;
          }
          chrome.storage.local.set({ celari_accounts: state.accounts });
          sendResponse({
            success: true,
            accounts: state.accounts,
            activeAccountIndex: state.activeAccountIndex,
          });
        })
        .catch((e) => {
          sendResponse({
            success: false,
            error: `PXE deletion failed: ${sanitizeRpcError(e)}`,
          });
        });
      return true; // keep sendResponse channel open for the async path
    }

    case "GET_BACKUP_DATA": {
      // Collect sensitive key data from session storage for encrypted backup
      chrome.storage.session.get(["celari_keys", "celari_secret", "celari_private_key"], (session) => {
        const backupData = {
          accounts: state.accounts,
          keys: session.celari_keys || null,
          secret: session.celari_secret || null,
          privateKey: session.celari_private_key || null,
          network: state.network,
          nodeUrl: state.nodeUrl,
          exportedAt: new Date().toISOString(),
          version: 1,
        };
        sendResponse({ success: true, data: backupData });
      });
      return true;
    }

    case "IMPORT_BACKUP": {
      // Import decrypted backup data: merge accounts and keys
      const imported = message.data;
      if (!imported?.accounts?.length) {
        sendResponse({ success: false, error: "No accounts in backup" });
        break;
      }
      for (const acc of imported.accounts) {
        const exists = state.accounts.some(a => a.address && a.address === acc.address);
        if (!exists) {
          state.accounts.push(acc);
        }
      }
      chrome.storage.local.set({ celari_accounts: state.accounts });
      // Restore session keys if present
      const sessionData = {};
      if (imported.keys) sessionData.celari_keys = imported.keys;
      if (imported.secret) sessionData.celari_secret = imported.secret;
      if (imported.privateKey) sessionData.celari_private_key = imported.privateKey;
      if (Object.keys(sessionData).length) chrome.storage.session.set(sessionData);
      // Register imported accounts with PXE
      for (const acc of imported.accounts) {
        if (acc.deployed && acc.secretKey && acc.salt) {
          sendToPXE({
            type: "PXE_REGISTER_ACCOUNT",
            data: {
              publicKeyX: acc.publicKeyX || "",
              publicKeyY: acc.publicKeyY || "",
              secretKey: acc.secretKey,
              salt: acc.salt,
              privateKeyPkcs8: acc.privateKeyPkcs8 || "",
            },
          }).catch(() => {});
        }
      }
      sendResponse({ success: true, accounts: state.accounts });
      break;
    }

    case "GET_DEPLOY_INFO": {
      // Check if a .celari-passkey-account.json was saved by CLI deploy
      chrome.storage.local.get("celari_deploy_info", (result) => {
        sendResponse({ success: true, deployInfo: result.celari_deploy_info || null });
      });
      return true;
    }

    case "SAVE_DEPLOY_INFO":
      chrome.storage.local.set({ celari_deploy_info: message.deployInfo });
      sendResponse({ success: true });
      break;

    case "VERIFY_ACCOUNT": {
      const addr = message.address;
      if (!addr) {
        sendResponse({ success: false, error: "No address" });
        break;
      }
      verifyAccount(addr).then((result) => {
        sendResponse({ success: true, ...result });
      }).catch((e) => {
        sendResponse({ success: false, error: sanitizeRpcError(e) });
      });
      return true;
    }

    case "GET_BLOCK_NUMBER": {
      getBlockNumber().then((blockNumber) => {
        sendResponse({ success: true, blockNumber });
      }).catch((e) => {
        sendResponse({ success: false, error: sanitizeRpcError(e) });
      });
      return true;
    }

    case "FAUCET_REQUEST": {
      sendToPXE({ type: "PXE_FAUCET", data: { address: message.address } })
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((e) => sendResponse({ success: false, error: sanitizeRpcError(e) }));
      return true;
    }

    // WalletConnect relay: offscreen → popup
    case "WC_SESSION_PROPOSAL": {
      // Relay WalletConnect session proposal to popup for user approval
      chrome.runtime.sendMessage({
        type: "WC_SESSION_PROPOSAL",
        proposal: message.proposal,
      }).catch(() => {});
      sendResponse({ success: true });
      break;
    }

    case "WC_SESSION_REQUEST": {
      // Relay WalletConnect session request to popup for user confirmation
      chrome.runtime.sendMessage({
        type: "WC_SESSION_REQUEST",
        request: message.request,
        topic: message.topic,
      }).catch(() => {});
      sendResponse({ success: true });
      break;
    }

    // dApp requests (forwarded from content script)
    case "DAPP_CONNECT":
      chrome.action.openPopup();
      sendResponse({ success: true, pending: true });
      break;

    case "DAPP_SIGN": {
      // Store the pending sign request and open a confirmation popup
      const signRequestId = `sign_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      pendingSignRequests.set(signRequestId, {
        payload: message.payload,
        origin: sender.origin || sender.tab?.url || "unknown",
        tabId: sender.tab?.id,
        sendResponse,
      });

      // Open confirmation popup
      chrome.windows.create({
        url: `popup.html?confirm=${signRequestId}`,
        type: "popup",
        width: 380,
        height: 560,
        focused: true,
      });

      return true; // async response — will be sent when user approves/rejects
    }

    case "GET_SIGN_REQUEST": {
      // Popup asks for the pending request details to display confirmation UI
      const reqId = message.requestId;
      const pending = pendingSignRequests.get(reqId);
      if (pending) {
        sendResponse({
          success: true,
          request: {
            id: reqId,
            origin: pending.origin,
            payload: pending.payload,
            verificationHash: pending.verificationHash,
          },
        });
      } else {
        sendResponse({ success: false, error: "No pending request" });
      }
      break;
    }

    case "SIGN_APPROVE": {
      (async () => {
        if (await _bgIsLocked()) {
          sendResponse({ success: false, error: "Wallet is locked", code: "WALLET_LOCKED" });
          return;
        }
        const pending = pendingSignRequests.get(message.requestId);
        if (!pending) { sendResponse({ success: false, error: "Request not found or expired" }); return; }
        pendingSignRequests.delete(message.requestId);

        if (pending.kind === "bridge_exit") {
          // Ack the popup right away; proving/mining can take minutes.
          sendResponse({ success: true });
          const tx = pending.payload?.transaction || {};
          try {
            const r = await sendToPXE({ type: "PXE_BRIDGE_EXIT", data: { amount: tx.amount, recipient: tx.recipient } });
            pending.sendResponse(
              r?.success
                ? { success: true, txHash: r.txHash, blockNumber: r.blockNumber }
                : { success: false, error: r?.error || "Bridge exit failed" }
            );
          } catch (e) {
            pending.sendResponse({ success: false, error: sanitizeRpcError(e) });
          }
          return;
        }

        if (pending.kind === "rpc-write") {
          sendResponse({ success: true }); // ack popup
          _wsForwardToPxe(pending.walletMsg, pending.session, pending.sessionId)
            .catch((e) => _providerRespond(pending.session, pending.sessionId, pending.requestId, { success: false, error: sanitizeRpcError(e) }));
          return;
        }

        pending.sendResponse({ success: true, approved: true });
        sendResponse({ success: true });
      })();
      return true;
    }

    case "SIGN_REJECT": {
      const pending = pendingSignRequests.get(message.requestId);
      if (pending) {
        pendingSignRequests.delete(message.requestId);
        if (pending.kind === "rpc-write") {
          _providerRespond(pending.session, pending.sessionId, pending.requestId, { success: false, error: "User rejected the request" });
          sendResponse({ success: true });
          return;
        }
        pending.sendResponse({ success: false, error: "User rejected the transaction" });
      } else {
        sendResponse({ success: false, error: "Request not found or expired" });
      }
      break;
    }

    // Wallet-SDK protocol: forward wallet method calls to offscreen PXE
    case "WALLET_METHOD_CALL": {
      (async () => {
        if (await _bgIsLocked()) {
          sendResponse({ success: false, error: "Wallet is locked", code: "WALLET_LOCKED" });
          return;
        }
        sendToPXE({
          type: "PXE_WALLET_METHOD",
          rawMessage: message.rawMessage,
        })
          .then((result) => sendResponse(result))
          .catch((e) => sendResponse({ error: sanitizeRpcError(e) }));
      })();
      return true; // async response
    }

    case "GET_WITHDRAW_PROOF": {
      handleGetWithdrawProof(message.payload.l2TxHash).then(
        (result) => sendResponse(result),
        (err) => sendResponse({ success: false, error: sanitizeRpcError(err) })
      );
      return true;
    }

    default:
      // Forward PXE_* messages to offscreen document
      if (message.type?.startsWith("PXE_")) {
        // PXE_INIT takes minutes — ack immediately, run in background
        if (message.type === "PXE_INIT") {
          sendToPXE(message)
            .then((r) => console.log("PXE_INIT completed:", r?.status || "ok"))
            .catch((e) => console.warn("PXE_INIT failed:", e.message));
          sendResponse({ success: true, ack: true });
          return;
        }
        // PXE_DEPLOY_ACCOUNT can take 2-3 minutes — persist result to storage
        // so popup can pick it up even if the message port closed
        if (message.type === "PXE_DEPLOY_ACCOUNT") {
          const deployData = message.data || {};
          sendToPXE(message)
            .then((result) => {
              if (result?.address) {
                // Persist deploy result so popup can read it even if message port closed
                chrome.storage.local.get("celari_accounts", (data) => {
                  const accounts = data.celari_accounts || [];
                  const pending = accounts.find(a => !a.deployed);
                  if (pending) {
                    pending.deployed = true;
                    pending.address = result.address;
                    pending.publicKeyX = deployData.publicKeyX || pending.publicKeyX;
                    pending.publicKeyY = deployData.publicKeyY || pending.publicKeyY;
                    pending.salt = result.salt;
                    pending.txHash = result.txHash;
                    pending.blockNumber = result.blockNumber;
                    pending.deployedAt = new Date().toISOString();
                    // Persist the signing material alongside the account so PXE
                    // re-registration after browser restart / SW eviction works
                    // without re-prompting passkey. Session storage (where these
                    // also live for the current session) is wiped on restart.
                    // TODO: encrypt at rest with passkey-derived key.
                    if (result.secretKey) pending.secretKey = result.secretKey;
                    if (deployData.privateKeyPkcs8) pending.privateKeyPkcs8 = deployData.privateKeyPkcs8;
                    chrome.storage.local.set({ celari_accounts: accounts });
                    console.log("Deploy result persisted to storage:", result.address);
                  }
                });
                if (result.secretKey) {
                  chrome.storage.session.set({ celari_secret: result.secretKey });
                }
                if (deployData.privateKeyPkcs8) {
                  chrome.storage.session.set({ celari_private_key: deployData.privateKeyPkcs8 });
                }
              }
              sendResponse({ success: true, ...result });
            })
            .catch((e) => sendResponse({ success: false, error: sanitizeRpcError(e) }));
          return true;
        }
        sendToPXE(message)
          .then((result) => sendResponse({ success: true, ...result }))
          .catch((e) => sendResponse({ success: false, error: sanitizeRpcError(e) }));
        return true; // async response
      }
      sendResponse({ success: false, error: "Unknown message type" });
  }
});

// --- Withdraw Proof --------------------------------------------------

/**
 * Query Aztec node for the Merkle proof needed to claim a withdrawal on L1.
 *
 * 1. Get TX receipt → find block number
 * 2. Check if block is proven (finalized on L1)
 * 3. Get Outbox message proof (leafIndex + Merkle siblings)
 */
async function handleGetWithdrawProof(l2TxHash) {
  if (!state.connected) {
    return { success: false, error: "Not connected to Aztec node" };
  }

  const url = state.nodeUrl.replace(/\/$/, "");

  // Step 1: Get TX receipt to find block number
  const receiptRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "aztec_getTxReceipt",
      params: [l2TxHash],
      id: 1,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!receiptRes.ok) {
    return { success: false, error: "Failed to query Aztec node" };
  }

  const receiptData = await receiptRes.json();
  const receipt = receiptData.result;

  if (!receipt || !receipt.blockNumber) {
    return { success: false, error: "Transaction not yet included in a block" };
  }

  // Step 2: Check if block is proven on L1
  const blockRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "aztec_getBlock",
      params: [receipt.blockNumber],
      id: 2,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!blockRes.ok) {
    return { success: false, error: "Block info unavailable" };
  }

  const blockData = await blockRes.json();
  const block = blockData.result;

  if (!block || !block.proven) {
    return { success: false, error: "Block not yet finalized" };
  }

  // Step 3: Get Outbox message Merkle proof
  const proofRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "aztec_getOutboxMessageProof",
      params: [receipt.blockNumber, l2TxHash],
      id: 3,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!proofRes.ok) {
    return { success: false, error: "Outbox proof not available" };
  }

  const proofData = await proofRes.json();
  const proof = proofData.result;

  if (!proof) {
    return { success: false, error: "Proof data not found" };
  }

  return {
    success: true,
    proof: {
      blockNumber: String(receipt.blockNumber),
      leafIndex: String(proof.leafIndex),
      path: proof.siblings,
    },
  };
}

// --- Connection Check ------------------------------------------------

async function checkConnection() {
  try {
    const url = state.nodeUrl.replace(/\/$/, "");

    // Try JSON-RPC first (devnet/testnet)
    const rpcResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "node_getNodeInfo",
        params: [],
        id: 1,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (rpcResponse.ok) {
      const rpcData = await rpcResponse.json();
      if (rpcData.result) {
        state.connected = true;
        state.nodeInfo = {
          nodeVersion: rpcData.result.nodeVersion || "unknown",
          l1ChainId: rpcData.result.l1ChainId,
          protocolVersion: rpcData.result.protocolVersion || rpcData.result.rollupVersion,
        };
        return true;
      }
    }

    // Fallback: REST API (sandbox)
    const restResponse = await fetch(`${url}/api/node-info`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (restResponse.ok) {
      const info = await restResponse.json();
      state.connected = true;
      state.nodeInfo = {
        nodeVersion: info.nodeVersion || info.sandboxVersion || "unknown",
        l1ChainId: info.l1ChainId,
        protocolVersion: info.protocolVersion,
      };
      return true;
    }
  } catch (e) {
    state.connected = false;
    state.nodeInfo = null;
  }
  return false;
}

// --- Account Verification --------------------------------------------

async function verifyAccount(address) {
  const url = state.nodeUrl.replace(/\/$/, "");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "node_getContract",
        params: [address],
        id: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.result) {
        return { verified: true, contractData: data.result };
      }
    }
  } catch {}

  // Fallback: node responded but contract query unavailable — cannot confirm deployment
  try {
    const blockNum = await getBlockNumber();
    return { verified: false, blockNumber: blockNum, note: "Node responded but contract query unavailable — cannot confirm deployment" };
  } catch {}

  return { verified: false };
}

async function getBlockNumber() {
  const url = state.nodeUrl.replace(/\/$/, "");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "node_getBlockNumber",
      params: [],
      id: 1,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  return data.result ?? null;
}

// --- Initialization --------------------------------------------------

// Restore state on every service worker wake-up (not just onInstalled)
async function restoreState() {
  const stored = await chrome.storage.local.get("celari_accounts");
  if (stored.celari_accounts) {
    state.accounts = stored.celari_accounts;
  }

  const config = await chrome.storage.local.get("celari_config");
  if (config.celari_config) {
    state.nodeUrl = config.celari_config.nodeUrl || state.nodeUrl;
    state.network = config.celari_config.network || state.network;
  }
}

async function initPXEAndAccounts() {
  await ensureOffscreen();
  if (state.connected) {
    sendToPXE({ type: "PXE_INIT", nodeUrl: state.nodeUrl })
      .then(async (res) => {
        console.log("PXE initialized:", res);

        // Retrieve session-only keys (available in current browser session only)
        let sessionSecret = null;
        let sessionPrivateKey = null;
        try {
          const sessionData = await chrome.storage.session.get(["celari_secret", "celari_private_key"]);
          sessionSecret = sessionData.celari_secret || null;
          sessionPrivateKey = sessionData.celari_private_key || null;
        } catch {}

        for (const account of state.accounts) {
          // Determine where the secret key comes from: local storage (deployed)
          // or session storage (just created, not yet deployed).
          const secretKey = account.secretKey || sessionSecret;
          const privateKey = account.privateKeyPkcs8 || sessionPrivateKey || "";

          if (secretKey && account.salt && account.publicKeyX) {
            try {
              const regRes = await sendToPXE({
                type: "PXE_REGISTER_ACCOUNT",
                data: {
                  publicKeyX: account.publicKeyX,
                  publicKeyY: account.publicKeyY,
                  secretKey,
                  salt: account.salt,
                  privateKeyPkcs8: privateKey,
                },
              });
              console.log(`PXE account registered: ${account.address?.slice(0, 16)}...`, regRes);
            } catch (e) {
              console.warn(`PXE account registration failed for ${account.address?.slice(0, 16)}:`, e.message);
            }
          }
        }
      })
      .catch((e) => console.warn("PXE init deferred:", e.message));
  }
}

// Run on every SW startup (module top-level IIFE)
(async () => {
  try {
    await restoreState();
    await checkConnection();
    await initPXEAndAccounts();
  } catch (e) {
    console.error("Celari: initialization failed —", e.message || e);
  }
})();

chrome.runtime.onInstalled.addListener(() => {
  console.log("Celari Wallet installed");
});

// Replace setInterval with chrome.alarms for MV3 reliability
chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "keepAlive") {
    try {
      await checkConnection();
      await ensureOffscreen();
    } catch (e) {
      console.warn("Celari: keep-alive cycle failed —", e.message || e);
    }
  } else if (alarm.name === IDLE_LOCK_ALARM) {
    await _runIdleLock();
  }
});

// Clean up wallet-sdk sessions when a tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [sid, session] of _wsActiveSessions) {
    if (session.tabId === tabId) _wsActiveSessions.delete(sid);
  }
  for (const [rid, disc] of _wsPendingDiscoveries) {
    if (disc.tabId === tabId) _wsPendingDiscoveries.delete(rid);
  }
  for (const [signId, req] of _wsPendingSignRequests) {
    if (req.tabId === tabId) {
      _wsPendingSignRequests.delete(signId);
      // No need to send error — the tab is gone
    }
  }
  for (const [id, req] of pendingSignRequests) {
    if (req?.tabId === tabId) pendingSignRequests.delete(id);
  }
});
