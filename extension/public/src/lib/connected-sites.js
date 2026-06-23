// extension/public/src/lib/connected-sites.js
//
// Pure helpers for the dApp connection allowlist ("Connected Sites").
// A site is identified by its origin. Once the user approves a connection the
// origin is remembered here so future discovery requests from it are
// auto-approved (no popup) — mirroring azguard's connected-sites behavior.
//
// Stored at chrome.storage.local.celari_connected_sites as an array of
// { origin, account, appId, name, addedAt }. These functions are
// storage-agnostic and side-effect free so they can be unit tested.
//
// Approval is scoped to the ACCOUNT that granted it (audit: connected-sites
// auto-approval must not leak across account rotation). A site approved under
// account A is NOT auto-approved once the user switches to account B.

/** Normalize a URL/origin to a bare origin string (scheme://host[:port]). */
export function normalizeOrigin(o) {
  if (!o) return "";
  try {
    return new URL(o).origin;
  } catch {
    return String(o).replace(/\/+$/, "");
  }
}

/** Normalize an account address for comparison (lowercased, trimmed). */
export function normalizeAccount(a) {
  return typeof a === "string" ? a.trim().toLowerCase() : "";
}

function originOf(entry) {
  return normalizeOrigin(typeof entry === "string" ? entry : entry?.origin);
}

function accountOf(entry) {
  return normalizeAccount(typeof entry === "string" ? "" : entry?.account);
}

/**
 * True if `origin` is already approved FOR `account`.
 * - With an `account`: an entry must match BOTH origin and that account.
 *   Legacy entries (saved before account-binding) carry no account and so do
 *   NOT match → the user re-approves once per account. This is the safe choice.
 * - Without an `account` (omitted/empty): falls back to origin-only matching
 *   for account-agnostic callers.
 */
export function isSiteApproved(sites, origin, account) {
  const target = normalizeOrigin(origin);
  if (!target) return false;
  if (!Array.isArray(sites)) return false;
  const acct = normalizeAccount(account);
  return sites.some((s) => {
    if (originOf(s) !== target) return false;
    if (!acct) return true;            // no account scoping requested
    return accountOf(s) === acct;      // entry must be bound to this account
  });
}

/**
 * Return a new list with `entry` added. Idempotent on (origin, account): the
 * same site under the same account is not duplicated, but the same site under
 * a different account is recorded as a distinct grant.
 */
export function addSite(sites, entry, now = Date.now()) {
  const list = Array.isArray(sites) ? sites.slice() : [];
  const target = normalizeOrigin(entry?.origin);
  if (!target) return list;
  const acct = normalizeAccount(entry?.account);
  if (list.some((s) => originOf(s) === target && accountOf(s) === acct)) return list;
  list.push({
    origin: target,
    account: acct,
    appId: entry?.appId || "",
    name: entry?.name || "",
    addedAt: entry?.addedAt || now,
  });
  return list;
}

/** Return a new list with `origin` removed. */
export function removeSite(sites, origin) {
  const target = normalizeOrigin(origin);
  return (Array.isArray(sites) ? sites : []).filter((s) => originOf(s) !== target);
}
