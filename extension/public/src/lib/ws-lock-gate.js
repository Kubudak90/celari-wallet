// extension/public/src/lib/ws-lock-gate.js
//
// Routing decision for an incoming wallet-sdk secure-message, given the
// requested RPC method and the wallet's lock state.
//
// The wallet-sdk connect handshake (requestCapabilities / getAccounts /
// getChainInfo …) is read-class. When the wallet was locked these used to
// fail immediately with "Wallet locked" and NO unlock UI — so a dApp could
// never trigger an unlock by connecting. classifySecureMessage() resolves a
// locked read to "unlock-then-resume" instead, so the caller opens the
// unlock popup and replays the request once the user unlocks.

// Methods that mutate wallet state and require explicit per-call user
// confirmation. These always route to the sign popup, which runs its own
// locked → unlock → approve gate, so they don't need unlock-then-resume here.
export const WS_WRITE_METHODS = new Set(["sendTx", "createAuthWit"]);

/**
 * Decide how the background should handle a decrypted secure-message.
 *
 * @param {object} opts
 * @param {string} opts.method - the wallet-sdk RPC method name (decrypted.type)
 * @param {boolean} opts.locked - whether the wallet is currently locked
 *   (no celari_secret in session storage)
 * @param {Set<string>} [opts.writeMethods] - override the write-method set
 * @returns {"sign-popup" | "unlock-then-resume" | "forward"}
 *   - "sign-popup": open the wssign confirmation popup (write methods)
 *   - "unlock-then-resume": open the unlock popup, queue, replay on unlock
 *   - "forward": send straight to PXE (unlocked read)
 */
export function classifySecureMessage({ method, locked, writeMethods = WS_WRITE_METHODS }) {
  if (writeMethods.has(method)) return "sign-popup";
  if (locked) return "unlock-then-resume";
  return "forward";
}
