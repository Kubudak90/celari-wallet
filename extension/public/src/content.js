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

// ─── Message Relay: page ↔ background ─────────────────

// Listen for messages from the dApp (inpage script)
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (event.data?.target !== "celari-content") return;

  // Only allow known dApp message types
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

  try {
    // Forward to background service worker
    const response = await chrome.runtime.sendMessage({ type, payload });

    // Send response back to dApp
    window.postMessage({
      target: "celari-inpage",
      requestId,
      response,
    }, window.location.origin);
  } catch (error) {
    window.postMessage({
      target: "celari-inpage",
      requestId,
      response: { success: false, error: error.message },
    }, window.location.origin);
  }
});

// Listen for messages from background (e.g., transaction results)
chrome.runtime.onMessage.addListener((message) => {
  if (message.target === "content") {
    window.postMessage({
      target: "celari-inpage",
      ...message,
    }, window.location.origin);
  }
});

console.log("[Celari] Content script loaded");
