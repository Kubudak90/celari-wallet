/**
 * Celari Wallet — Content Script
 *
 * Injected into every web page.
 * Bridges communication between:
 *   dApp page ↔ content script ↔ background service worker
 *
 * Injects `window.celari` provider for dApp interaction.
 */

// ─── Extension-context safety ─────
// When the extension is reloaded (chrome://extensions → Reload), any page
// that has this content script loaded keeps a stale reference to
// `chrome.runtime`. Calling `chrome.runtime.sendMessage` against an
// invalidated context throws SYNCHRONOUSLY (not a rejected promise), so
// `.catch()` alone is not enough — we have to wrap every call in try/catch.
// Once we detect an invalidation, we stop issuing further runtime calls for
// the remainder of the page's life (user must reload the tab).

let _celariCtxInvalid = false;

function _celariIsCtxInvalidError(e) {
  const msg = e?.message || String(e || "");
  return msg.includes("Extension context invalidated") || msg.includes("Extension context invalid");
}

function safeRuntimeSend(message) {
  if (_celariCtxInvalid) return;
  try {
    const p = chrome?.runtime?.sendMessage?.(message);
    if (p && typeof p.catch === "function") {
      p.catch((e) => {
        if (_celariIsCtxInvalidError(e)) _celariCtxInvalid = true;
      });
    }
  } catch (e) {
    if (_celariIsCtxInvalidError(e)) _celariCtxInvalid = true;
  }
}

function safeGetURL(path) {
  try { return chrome?.runtime?.getURL?.(path) || ""; }
  catch { return ""; }
}

// Inject the inpage provider script
try {
  const script = document.createElement("script");
  script.src = safeGetURL("src/inpage.js");
  script.type = "module";
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
} catch {}

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
  try {
    if (event.source !== window) return;

    // Legacy protocol uses object data, not JSON strings — hand off early.
    if (typeof event.data !== "string") {
      handleLegacyMessage(event);
      return;
    }

    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    if (data?.type === "aztec-wallet-discovery") {
      safeRuntimeSend({
        origin: WS_ORIGIN_CS,
        type: INTERNAL.DISCOVERY_REQUEST,
        content: data,
      });
      return;
    }
  } catch (e) {
    if (_celariIsCtxInvalidError(e)) _celariCtxInvalid = true;
  }
});

// Listen for messages from background (session management responses)
try {
  chrome.runtime.onMessage.addListener((message) => {
    try {
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
            try {
              const data = e.data;
              let internalType;
              if (data?.type === "aztec-wallet-key-exchange-request") {
                internalType = INTERNAL.KEY_EXCHANGE_REQUEST;
              } else if (data?.type === "aztec-wallet-disconnect") {
                internalType = INTERNAL.DISCONNECT_REQUEST;
              } else {
                internalType = INTERNAL.SECURE_MESSAGE;
              }
              safeRuntimeSend({
                origin: WS_ORIGIN_CS,
                type: internalType,
                sessionId,
                content: data,
              });
            } catch (e) {
              if (_celariIsCtxInvalidError(e)) _celariCtxInvalid = true;
            }
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
    } catch (e) {
      if (_celariIsCtxInvalidError(e)) _celariCtxInvalid = true;
    }
  });
} catch (e) {
  if (_celariIsCtxInvalidError(e)) _celariCtxInvalid = true;
}

// Clean up ports on page unload so background can reap the sessions
window.addEventListener("pagehide", () => {
  try {
    for (const [sessionId, port] of wsPorts) {
      try { port.close(); } catch {}
      safeRuntimeSend({
        origin: WS_ORIGIN_CS,
        type: INTERNAL.DISCONNECT_REQUEST,
        sessionId,
      });
    }
    wsPorts.clear();
  } catch {}
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

  if (_celariCtxInvalid) {
    window.postMessage({
      target: "celari-inpage",
      requestId,
      response: { success: false, error: "Extension reloaded — please refresh this page" },
    }, window.location.origin);
    return;
  }

  try {
    const p = chrome.runtime.sendMessage({ type, payload });
    p.then(response => {
      window.postMessage({
        target: "celari-inpage",
        requestId,
        response,
      }, window.location.origin);
    }).catch(error => {
      if (_celariIsCtxInvalidError(error)) _celariCtxInvalid = true;
      window.postMessage({
        target: "celari-inpage",
        requestId,
        response: { success: false, error: error.message },
      }, window.location.origin);
    });
  } catch (error) {
    if (_celariIsCtxInvalidError(error)) _celariCtxInvalid = true;
    window.postMessage({
      target: "celari-inpage",
      requestId,
      response: { success: false, error: error.message },
    }, window.location.origin);
  }
}

// ─── Nethermind Fee Juice Faucet Auto-Claim ─────
// When the user opens https://aztec-faucet.nethermind.io to request Fee Juice,
// we patch window.fetch in the page's main world to capture the /api/drip and
// /api/claim responses. When claimData is available we forward it to the
// background so the Celari popup's Deploy banner auto-fills the claim payload.
// ─── Nethermind Fee Juice Faucet — Address auto-fill ─────
// No inline script injection (faucet's CSP blocks it). The popup now calls
// the Nethermind API directly, so the fetch-patch is no longer needed. We
// only auto-fill the address field if the user opened the faucet manually.
if (location.hostname === "aztec-faucet.nethermind.io") {
  try {
    chrome.storage.local.get("celari_faucet_pending", (result) => {
      try {
        const req = result?.celari_faucet_pending;
        if (!req?.address) return;
        const fill = () => {
          const inputs = document.querySelectorAll("input");
          for (const el of inputs) {
            const ph = (el.placeholder || "").toLowerCase();
            const nm = (el.name || "").toLowerCase();
            if ((ph.includes("aztec") || ph.includes("address") || nm.includes("address")) && !el.value) {
              const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
              setter?.call(el, req.address);
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              return true;
            }
          }
          return false;
        };
        let tries = 0;
        const tick = () => {
          if (fill() || ++tries > 20) return;
          setTimeout(tick, 300);
        };
        setTimeout(tick, 200);
      } catch {}
    });
  } catch (e) {
    if (_celariIsCtxInvalidError(e)) _celariCtxInvalid = true;
  }
}

console.log("[Celari] Content script loaded");
