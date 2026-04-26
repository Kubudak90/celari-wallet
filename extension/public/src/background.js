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

// ─── Wallet-SDK v4.1.3: Inline ECDH Crypto (pure WebCrypto, no imports) ──
// Mirrors @aztec/wallet-sdk/dest/crypto.js exactly.

const _WS_P256_SZ = 32;
const _WS_HKDF_INFO = new TextEncoder().encode("Aztec Wallet DAPP Key derivation");
const _WS_FP_DATA   = new TextEncoder().encode("aztec-wallet-verification-verificationHash");

async function _wsGenerateKeyPair() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
}

async function _wsExportPublicKey(pk) {
  const jwk = await crypto.subtle.exportKey("jwk", pk);
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

function _wsImportPublicKey(exported) {
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

async function _wsDeriveSessionKeys(ownKeyPair, peerPublicKey, isApp) {
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerPublicKey }, ownKeyPair.privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, ["deriveBits"]);
  const ownExp  = await _wsExportPublicKey(ownKeyPair.publicKey);
  const peerExp = await _wsExportPublicKey(peerPublicKey);
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

async function _wsEncrypt(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(data));
  return { iv: _wsAb2b64(iv), ciphertext: _wsAb2b64(ciphertext) };
}

async function _wsDecrypt(key, payload) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: _wsB642ab(payload.iv) },
    key,
    _wsB642ab(payload.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ─── Wallet-SDK v4.1.3: Session State ──────────────────────────────────
const CELARI_WALLET_ID_WS = "celari-wallet";
const _WS_BG = "background";
const _WS_CS = "content-script";

const _wsPendingDiscoveries  = new Map(); // requestId → { tabId, origin, appId, chainInfo }
const _wsActiveSessions      = new Map(); // sessionId → { tabId, origin, appId, encryptionKey, verificationHash }
const _wsPendingSignRequests = new Map(); // signId → { sessionId, tabId, origin, method, decrypted, encryptionKey }

// Methods that mutate wallet state and require explicit user confirmation
const _WS_WRITE_METHODS = new Set(["sendTx", "createAuthWit"]);

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
      if (!session || session.tabId !== tabId) return;

      let decrypted;
      try {
        decrypted = await _wsDecrypt(session.encryptionKey, content);
      } catch (e) {
        console.warn("[WalletSDK] Decrypt failed:", e.message);
        return;
      }

      // Write-class methods (sendTx, createAuthWit) must show a user
      // confirmation popup. Read-class methods go through immediately.
      const methodName = decrypted?.type;
      if (_WS_WRITE_METHODS.has(methodName)) {
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

      // Read-class methods: run immediately
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
  }
}

// Shared helper: forward a decrypted wallet-sdk message to the offscreen PXE,
// encrypt the response with the session key, and send it back to the dApp tab.
async function _wsForwardToPxe(decrypted, session, sessionId) {
  let responsePayload;
  try {
    const pxeResult = await sendToPXE({
      type: "PXE_WALLET_METHOD",
      rawMessage: JSON.stringify(decrypted),
    });
    responsePayload = pxeResult?.rawResponse || JSON.stringify({
      messageId: decrypted.messageId,
      error: pxeResult?.error || "PXE returned no result",
      walletId: CELARI_WALLET_ID_WS,
    });
  } catch (e) {
    responsePayload = JSON.stringify({
      messageId: decrypted.messageId,
      error: e.message,
      walletId: CELARI_WALLET_ID_WS,
    });
  }
  try {
    const encrypted = await _wsEncrypt(session.encryptionKey, responsePayload);
    chrome.tabs.sendMessage(session.tabId, {
      origin: _WS_BG,
      type: "secure-response",
      sessionId,
      content: encrypted,
    }).catch(() => {});
  } catch (e) {
    console.warn("[WalletSDK] Encrypt response failed:", e.message);
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

// --- Offscreen Document (PXE WASM Engine) ----------------------------

let offscreenReady = false;
let offscreenListenerReady = false; // True after offscreen JS has loaded and listener is registered
let offscreenInitError = null;

async function ensureOffscreen() {
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
    }
    // Document doesn't exist (or stalled) — recreate up to 3x
    for (let attempt = 1; attempt <= 3; attempt++) {
      offscreenReady = false;
      offscreenListenerReady = false;
      try {
        // Close any stale doc before recreating
        const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
        if (existing.length > 0) {
          try { await chrome.offscreen.closeDocument(); } catch (e) {}
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
  // Wallet-SDK v4.1.3 internal protocol (content script → background)
  if (message?.origin === _WS_CS) {
    _wsHandleProtocolMessage(message, sender).catch(e => console.warn("[WalletSDK]", e.message));
    return false; // fire-and-forget, no sendResponse needed
  }

  // Skip messages tagged for offscreen document (prevents routing loop)
  if (message._target === "offscreen") return false;

  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: "Unauthorized sender" });
    return;
  }

  switch (message.type) {
    case "OFFSCREEN_READY":
      offscreenListenerReady = true;
      console.log("Offscreen JS loaded — listener active");
      sendResponse({ success: true });
      return;

    // Nethermind Fee Juice faucet auto-claim: content.js intercepts the
    // faucet's /api/drip or /api/claim response and forwards claimData here.
    // Wallet-SDK v4.1.3: popup approval flow for dApp discovery
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

    // Wallet-SDK v4.1.3: popup approval flow for sendTx / createAuthWit
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
      const req = _wsPendingSignRequests.get(message.requestId);
      if (!req) { sendResponse({ success: false, error: "Not found" }); break; }
      _wsPendingSignRequests.delete(message.requestId);
      // Ack the popup immediately, run PXE async in background
      sendResponse({ success: true });
      const sessionForForward = { encryptionKey: req.encryptionKey, tabId: req.tabId };
      _wsForwardToPxe(req.decrypted, sessionForForward, req.sessionId)
        .catch((e) => console.warn("[WalletSDK] approved sign forward failed:", e?.message || e));
      break;
    }

    case "WS_REJECT_SIGN": {
      const req = _wsPendingSignRequests.get(message.requestId);
      if (!req) { sendResponse({ success: false, error: "Not found" }); break; }
      _wsPendingSignRequests.delete(message.requestId);
      sendResponse({ success: true });
      _wsSendSignError(req, "User rejected the request").catch(() => {});
      break;
    }

    case "NETHERMIND_CLAIM_READY": {
      const claim = message.claim;
      if (!claim?.claimSecret || !claim?.messageLeafIndex) {
        sendResponse({ success: false, error: "Missing claim fields" });
        break;
      }
      chrome.storage.local.set({ celari_pending_claim: claim });
      // Clear the pending-drip marker so the next page load doesn't re-fill
      chrome.storage.local.remove("celari_faucet_pending");
      // Notify user — popup may be closed
      chrome.notifications.create("celari-claim-ready", {
        type: "basic",
        iconUrl: "icons/icon-48.png",
        title: "Fee Juice Ready",
        message: "Return to Celari — the claim is loaded. Click Deploy to finish.",
        priority: 2,
      });
      // If the popup is open, tell it to re-render the deploy banner
      chrome.runtime.sendMessage({ type: "CLAIM_READY_REFRESH", claim }).catch(() => {});
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
      if (idx >= 0 && idx < state.accounts.length && state.accounts.length > 1) {
        const deleted = state.accounts.splice(idx, 1)[0];
        if (state.activeAccountIndex >= state.accounts.length) {
          state.activeAccountIndex = state.accounts.length - 1;
        }
        chrome.storage.local.set({ celari_accounts: state.accounts });
        // Tell PXE to remove the account from its registry
        if (deleted.address) {
          sendToPXE({ type: "PXE_DELETE_ACCOUNT", data: { address: deleted.address } }).catch(() => {});
        }
        sendResponse({ success: true, accounts: state.accounts, activeAccountIndex: state.activeAccountIndex });
      } else {
        sendResponse({ success: false, error: "Cannot delete: invalid index or last account" });
      }
      break;
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
        sendResponse({ success: false, error: e.message });
      });
      return true;
    }

    case "GET_BLOCK_NUMBER": {
      getBlockNumber().then((blockNumber) => {
        sendResponse({ success: true, blockNumber });
      }).catch((e) => {
        sendResponse({ success: false, error: e.message });
      });
      return true;
    }

    case "FAUCET_REQUEST": {
      sendToPXE({ type: "PXE_FAUCET", data: { address: message.address } })
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((e) => sendResponse({ success: false, error: e.message }));
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
          },
        });
      } else {
        sendResponse({ success: false, error: "No pending request" });
      }
      break;
    }

    case "SIGN_APPROVE": {
      const pending = pendingSignRequests.get(message.requestId);
      if (pending) {
        pendingSignRequests.delete(message.requestId);
        // Forward the approved sign request back to the content script
        if (pending.tabId) {
          chrome.tabs.sendMessage(pending.tabId, {
            target: "content",
            type: "SIGN_APPROVED",
            payload: pending.payload,
          });
        }
        pending.sendResponse({ success: true, approved: true });
        // Also respond to the popup that sent SIGN_APPROVE
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "Request not found or expired" });
      }
      break;
    }

    case "SIGN_REJECT": {
      const pending = pendingSignRequests.get(message.requestId);
      if (pending) {
        pendingSignRequests.delete(message.requestId);
        pending.sendResponse({ success: false, error: "User rejected the transaction" });
      } else {
        sendResponse({ success: false, error: "Request not found or expired" });
      }
      break;
    }

    // Wallet-SDK protocol: forward wallet method calls to offscreen PXE
    case "WALLET_METHOD_CALL": {
      sendToPXE({
        type: "PXE_WALLET_METHOD",
        rawMessage: message.rawMessage,
      })
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ error: e.message }));
      return true; // async response
    }

    case "GET_WITHDRAW_PROOF": {
      handleGetWithdrawProof(message.payload.l2TxHash).then(
        (result) => sendResponse(result),
        (err) => sendResponse({ success: false, error: err.message })
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
            .catch((e) => sendResponse({ success: false, error: e.message }));
          return true;
        }
        sendToPXE(message)
          .then((result) => sendResponse({ success: true, ...result }))
          .catch((e) => sendResponse({ success: false, error: e.message }));
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
});
