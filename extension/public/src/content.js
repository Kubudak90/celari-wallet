/**
 * Celari Wallet — Content Script
 *
 * Injected into every web page.
 * Bridges communication between:
 *   dApp page ↔ content script ↔ background service worker
 *
 * Injects `window.celari` provider for dApp interaction.
 */

// Inject the inpage provider script
const script = document.createElement("script");
script.src = chrome.runtime.getURL("src/inpage.js");
script.type = "module";
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

// ─── Wallet-SDK v4.1.3 Protocol: Discovery + Encrypted Channel ─────
// Implements ContentScriptConnectionHandler behavior.
// Acts as a pure relay between the page (MessageChannel) and background.
// The background owns all session state and crypto.

const WS_ORIGIN_BG = "background";
const WS_ORIGIN_CS = "content-script";
const INTERNAL = {
  DISCOVERY_REQUEST: "discovery-request",
  KEY_EXCHANGE_REQUEST: "key-exchange-request",
  SECURE_MESSAGE: "secure-message",
  DISCONNECT_REQUEST: "disconnect-request",
  DISCOVERY_APPROVED: "discovery-approved",
  KEY_EXCHANGE_RESPONSE: "key-exchange-response",
  SECURE_RESPONSE: "secure-response",
  SESSION_DISCONNECTED: "session-disconnected",
};

// port1 map: sessionId → MessagePort (holds port1, gives port2 to page)
const wsPorts = new Map();

// Listen for discovery requests from the page
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  // Legacy protocol uses object data, not JSON strings — hand off early.
  if (typeof event.data !== "string") {
    handleLegacyMessage(event);
    return;
  }

  let data;
  try { data = JSON.parse(event.data); } catch { return; }

  if (data?.type === "aztec-wallet-discovery") {
    // Forward discovery to background for approval
    chrome.runtime.sendMessage({
      origin: WS_ORIGIN_CS,
      type: INTERNAL.DISCOVERY_REQUEST,
      content: data,
    }).catch((e) => console.warn("[Celari] discovery-request send failed:", e?.message || e));
    return;
  }
});

// Listen for messages from background (session management responses)
chrome.runtime.onMessage.addListener((message) => {
  if (message?.origin !== WS_ORIGIN_BG) {
    // Pass non-wallet-sdk messages to the legacy handler below
    if (message?.target === "content") {
      window.postMessage({ target: "celari-inpage", ...message }, window.location.origin);
    }
    return;
  }

  const { type, sessionId, content } = message;

  switch (type) {
    case INTERNAL.DISCOVERY_APPROVED: {
      // Create MessageChannel — port1 stays here, port2 goes to the page
      const channel = new MessageChannel();
      wsPorts.set(sessionId, channel.port1);

      channel.port1.onmessage = (e) => {
        const data = e.data;
        let internalType;
        if (data?.type === "aztec-wallet-key-exchange-request") {
          internalType = INTERNAL.KEY_EXCHANGE_REQUEST;
        } else if (data?.type === "aztec-wallet-disconnect") {
          internalType = INTERNAL.DISCONNECT_REQUEST;
        } else {
          internalType = INTERNAL.SECURE_MESSAGE;
        }
        chrome.runtime.sendMessage({
          origin: WS_ORIGIN_CS,
          type: internalType,
          sessionId,
          content: data,
        }).catch((e) => console.warn("[Celari] port relay send failed:", e?.message || e));
      };
      channel.port1.start();

      // Send discovery response with port2 transferred to page
      // Must use '*' as target origin — security comes from ECDH encryption
      window.postMessage(JSON.stringify({
        type: "aztec-wallet-discovery-response",
        requestId: sessionId,
        walletInfo: content,
      }), "*", [channel.port2]);
      break;
    }

    case INTERNAL.KEY_EXCHANGE_RESPONSE: {
      wsPorts.get(sessionId)?.postMessage(content);
      break;
    }

    case INTERNAL.SECURE_RESPONSE: {
      wsPorts.get(sessionId)?.postMessage(content);
      break;
    }

    case INTERNAL.SESSION_DISCONNECTED: {
      const port = wsPorts.get(sessionId);
      if (port) {
        port.postMessage({ type: "aztec-wallet-disconnect" });
        port.close();
        wsPorts.delete(sessionId);
      }
      break;
    }
  }
});

// Clean up ports on page unload so background can reap the sessions
window.addEventListener("pagehide", () => {
  for (const [sessionId, port] of wsPorts) {
    try { port.close(); } catch {}
    chrome.runtime.sendMessage({
      origin: WS_ORIGIN_CS,
      type: INTERNAL.DISCONNECT_REQUEST,
      sessionId,
    }).catch(() => {});
  }
  wsPorts.clear();
});

// ─── Legacy Protocol: celari-content/celari-inpage ─────
// Keeps backward compatibility with existing window.celari API.

function handleLegacyMessage(event) {
  if (event.data?.target !== "celari-content") return;

  const ALLOWED_DAPP_TYPES = [
    "DAPP_CONNECT",
    "DAPP_SIGN",
    "GET_ADDRESS",
    "GET_COMPLETE_ADDRESS",
    "GET_STATE",
    "CREATE_AUTHWIT",
  ];
  if (!ALLOWED_DAPP_TYPES.includes(event.data.type)) return;

  const { type, payload, requestId } = event.data;

  chrome.runtime.sendMessage({ type, payload }).then(response => {
    window.postMessage({
      target: "celari-inpage",
      requestId,
      response,
    }, window.location.origin);
  }).catch(error => {
    window.postMessage({
      target: "celari-inpage",
      requestId,
      response: { success: false, error: error.message },
    }, window.location.origin);
  });
}

console.log("[Celari] Content script loaded");
