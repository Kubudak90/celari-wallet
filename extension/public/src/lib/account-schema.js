// extension/public/src/lib/account-schema.js
//
// Validates celari_accounts entries and detects v0.5 (plaintext) → v0.6
// (encrypted) schema bumps. Pure functions — no chrome.* dependency.

export function detectLegacyPlaintext(accounts) {
  if (!Array.isArray(accounts)) return false;
  return accounts.some(
    a => a?.type === "passkey" && (a.secretKey || a.privateKeyPkcs8),
  );
}

export function validateAccountsArray(accounts) {
  if (!Array.isArray(accounts)) {
    throw new Error("celari_accounts is not an array");
  }
  for (const a of accounts) {
    if (!a || typeof a !== "object" || !a.address) {
      throw new Error("celari_accounts entry missing address");
    }
    if (a.type === "passkey") {
      if (!a.encryptedSecret || !a.encryptedPrivateKey || !a.prfSalt) {
        throw new Error("passkey account missing encrypted fields");
      }
    }
  }
  return true;
}

export function purgePending(accounts) {
  return accounts.filter(a => !a.address?.includes("_pending"));
}
