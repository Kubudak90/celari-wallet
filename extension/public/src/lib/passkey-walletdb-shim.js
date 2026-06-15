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
  return wallet;
}
