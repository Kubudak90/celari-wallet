// extension/public/src/lib/provider-accounts.js
// Pick the address the provider should expose: the active account if it is
// deployed, else the first deployed account, else null.
export function selectActiveAddress(accounts, index) {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  const at = accounts[index];
  if (at?.deployed && at?.address) return at.address;
  const firstDeployed = accounts.find((a) => a?.deployed && a?.address);
  return firstDeployed?.address ?? null;
}
