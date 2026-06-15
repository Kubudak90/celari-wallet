// extension/public/src/lib/faucet-networks.js
// Single source of truth for "does this network offer a testnet faucet?".
// Mirrors the dashboard gate that previously lived inline in popup.js.
export const FAUCET_NETWORKS = ["testnet"];

export function isFaucetNetwork(network) {
  return FAUCET_NETWORKS.includes(network);
}
