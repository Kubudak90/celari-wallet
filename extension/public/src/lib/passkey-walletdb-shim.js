// extension/public/src/lib/passkey-walletdb-shim.js
//
// Why this exists
// ───────────────
// Celari registers its custom CelariPasskey account via `AccountManager.create`
// + `wallet.registerContract(...)` (offscreen.js registerAccount) and NEVER calls
// `walletDB.storeAccount()`. So the base @aztec/wallets EmbeddedWallet has no
// walletDB record (`sk/type/salt`) for a passkey address.
//
// The existing `wallet.getAccountFromAddress` override fixes account RESOLUTION
// for the REAL send (which already works — real P256 signing via the overridden
// path). BUT the base `EmbeddedWallet.simulateViaEntrypoint` (the pre-send gas
// estimate) reads the RAW `this.walletDB.retrieveAccount(from)` to pick a
// kernelless-simulation stub by `type` (embedded_wallet.ts:260). For a passkey
// `from` that raw read throws:
//   `Account "0x..." does not exist on this wallet.`
// for EVERY authenticated tx (dApp orders AND in-wallet transfers).
//
// Fix
// ───
// Wrap `walletDB.retrieveAccount` so that, for addresses Celari owns
// (`accountWallets`), it returns a synthetic record with a REAL account type,
// `"ecdsasecp256r1"`. The ECDSA simulation stub's entrypoint selector and its
// `[u8;32] x2` constructor shape match the CelariPasskey contract, so the
// kernelless gas estimate is valid. Only `type` is consumed downstream by the
// simulate path; `secretKey`/`salt` are passed through for completeness. The
// REAL send is untouched — it still goes through `getAccountFromAddress` → the
// real P256 account. Unknown addresses delegate to the original (still throwing
// for genuinely-unknown accounts, as before).

// A real @aztec/wallets AccountType whose simulation stub is wire-compatible
// with CelariPasskey (DefaultAccountEntrypoint + [u8;32]x2 constructor).
export const PASSKEY_STUB_TYPE = "ecdsasecp256r1";

/**
 * Monkey-patch wallet.walletDB.retrieveAccount in place.
 * @param wallet the EmbeddedWallet instance (must expose .walletDB.retrieveAccount)
 * @param accountWallets the offscreen Map<addressString, { manager, wallet, secretKey?, salt? }>
 * @returns the same wallet (for chaining)
 */
export function installPasskeyWalletDbShim(wallet, accountWallets) {
  const db = wallet && wallet.walletDB;
  if (!db || typeof db.retrieveAccount !== "function") {
    throw new Error("installPasskeyWalletDbShim: wallet.walletDB.retrieveAccount unavailable");
  }
  const orig = db.retrieveAccount.bind(db);
  db.retrieveAccount = async function (address) {
    const key = address && typeof address.toString === "function" ? address.toString() : String(address);
    const entry = accountWallets.get(key);
    if (entry) {
      return {
        address,
        secretKey: entry.secretKey,
        salt: entry.salt,
        type: PASSKEY_STUB_TYPE,
        signingKey: new Uint8Array(32),
      };
    }
    return orig(address);
  };

  // IMPORTANT: do NOT override accountContracts.createStubAccount.
  //
  // The base EmbeddedWallet.sendTx gas-estimate (simulateViaEntrypoint) must use
  // the UPSTREAM PERMISSIVE stub (SimulatedEcdsaAccount: its entrypoint asserts
  // is_valid()==true and verify_private_authwit returns IS_VALID unconditionally
  // — it never reads the auth-witness oracle). That permissiveness is what lets
  // EmbeddedWallet.sendTx's offchain-effect AUTO-CAPTURE (embedded_wallet.ts:147-165)
  // run AFTER the estimate and create the real inner auth witnesses (e.g. a DEX
  // orderbook's Token.transfer_private_to_public), which the REAL send then
  // verifies with the real P256 witness.
  //
  // A previous "Option C" substituted the REAL account here to fix an
  // "Expected 64 but got 0" seen in a (confounded) guardian-setup test. That made
  // the estimate run the real passkey entrypoint + real verify_private_authwit,
  // which DEMAND auth witnesses before auto-capture has created them →
  // "Unknown auth witness for message hash" on any real dApp authwit tx. Reverted.
  //
  // The synthetic "ecdsasecp256r1" type from the retrieveAccount shim above is all
  // that's needed: it routes resolution (getStubAccountContractArtifact /
  // createStubAccount) to the permissive SimulatedEcdsaAccount stub.

  return wallet;
}
