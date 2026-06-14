// extension/public/src/lib/connected-sites.js
//
// Pure helpers for the dApp connection allowlist ("Connected Sites").
// A site is identified by its origin. Once the user approves a connection the
// origin is remembered here so future discovery requests from it are
// auto-approved (no popup) — mirroring azguard's connected-sites behavior.
//
// Stored at chrome.storage.local.celari_connected_sites as an array of
// { origin, appId, name, addedAt }. These functions are storage-agnostic and
// side-effect free so they can be unit tested.

/** Normalize a URL/origin to a bare origin string (scheme://host[:port]). */
export function normalizeOrigin(o) {
  if (!o) return "";
  try {
    return new URL(o).origin;
  } catch {
    return String(o).replace(/\/+$/, "");
  }
}

function originOf(entry) {
  return normalizeOrigin(typeof entry === "string" ? entry : entry?.origin);
}

/** True if `origin` is already in the approved-sites list. */
export function isSiteApproved(sites, origin) {
  const target = normalizeOrigin(origin);
  if (!target) return false;
  return Array.isArray(sites) && sites.some((s) => originOf(s) === target);
}

/** Return a new list with `entry`'s origin added (idempotent). */
export function addSite(sites, entry, now = Date.now()) {
  const list = Array.isArray(sites) ? sites.slice() : [];
  const target = normalizeOrigin(entry?.origin);
  if (!target || list.some((s) => originOf(s) === target)) return list;
  list.push({
    origin: target,
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
