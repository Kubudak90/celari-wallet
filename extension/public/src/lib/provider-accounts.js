// extension/public/src/lib/provider-accounts.js
// Pick the address the provider should expose to a dApp: the active account's
// address, else the first account that has an address, else null.
//
// NOTE: we intentionally do NOT gate on `deployed`. An Aztec address is
// deterministic (derived from the public keys + salt + contract class) and
// exists before deployment. dApps need it pre-deploy to receive funds — most
// importantly to claim Fee Juice, which is exactly what funds the deploy
// (chicken-and-egg: gating on `deployed` makes it impossible to ever fund the
// first deploy). Transactions still require a deployed account and fail
// naturally if attempted against one that isn't on-chain yet.
export function selectActiveAddress(accounts, index) {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  const at = accounts[index];
  if (at?.address) return at.address;
  const firstWithAddress = accounts.find((a) => a?.address);
  return firstWithAddress?.address ?? null;
}
