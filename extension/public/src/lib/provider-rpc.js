// extension/public/src/lib/provider-rpc.js
// Parse + allowlist generic dApp RPC methods routed over the window.celari
// provider channel. Mirrors the wallet-sdk method set that offscreen's
// handleWalletMethod already implements.
import { WS_WRITE_METHODS } from "./ws-lock-gate.js";

export const ALLOWED_RPC_METHODS = new Set([
  "getAccounts", "getChainInfo", "getAddressBook",
  "registerSender", "registerContract",
  "getContractMetadata", "getContractClassMetadata",
  "executeUtility", "simulateTx", "sendTx", "profileTx",
  "createAuthWit", "getPrivateEvents",
]);

// Strip a leading "aztec_" and classify.
export function parseProviderRpc(method, writeMethods = WS_WRITE_METHODS) {
  const m = String(method || "");
  const bare = m.startsWith("aztec_") ? m.slice(6) : m;
  return { bare, isWrite: writeMethods.has(bare) };
}

export function isAllowedRpc(method) {
  return ALLOWED_RPC_METHODS.has(parseProviderRpc(method).bare);
}
