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
      setTimeout(() => { if (pending.has(requestId)) { pending.delete(requestId); reject(new Error("Request timed out")); } }, 900000);
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
    /** Generic Aztec RPC: request("aztec_getAccounts", params) → result. */
    async request(method, params = []) {
      const r = await sendRequest("RPC", { rpcMethod: method, params });
      return r.result; // sendRequest already rejected on { success:false }
    },
    /** Azguard-parity client: window.celari.createClient().request(...). */
    createClient() {
      return {
        request: (method, params = []) => api.request(method, params),
        on: (event, cb) => api.on(event, cb),
        off: (event, unsub) => api.off(event, unsub),
      };
    },
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
