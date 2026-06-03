// extension/public/src/lib/provider-protocol.js
// Shared message vocabulary for the encrypted window.celari provider channel.
export const PROVIDER_MSG = {
  DISCOVERY: "provider-discovery",
  DISCOVERY_APPROVED: "provider-discovery-approved",
  KEY_EXCHANGE: "provider-key-exchange",
  KEY_EXCHANGE_RESPONSE: "provider-key-exchange-response",
  SECURE_MESSAGE: "provider-secure-message",
  SECURE_RESPONSE: "provider-secure-response",
  DISCONNECT: "provider-disconnect",
};

// window.postMessage envelope targets (page <-> content).
export const PROVIDER_TARGET_CONTENT = "celari-provider-content";
export const PROVIDER_TARGET_PAGE = "celari-provider-page";

// Methods the background provider router accepts.
export const PROVIDER_METHODS = [
  "DAPP_CONNECT",
  "DAPP_SIGN",
  "GET_ADDRESS",
  "GET_COMPLETE_ADDRESS",
  "GET_STATE",
  "CREATE_AUTHWIT",
  "GET_WITHDRAW_PROOF",
];

export function newRequestId() {
  return `celari_${crypto.randomUUID()}`;
}
