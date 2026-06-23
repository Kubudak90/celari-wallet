// extension/public/src/lib/signing-key-store.js
//
// Holds the account's P256 signing key as a NON-EXTRACTABLE CryptoKey, persisted
// in IndexedDB (shared across the extension's contexts via the chrome-extension
// origin) so it survives service-worker / offscreen restarts WITHOUT keeping a
// plaintext PKCS8 copy in chrome.storage.session (audit C1).
//
// Two layers, kept separate so the security-critical crypto core is unit-testable
// without IndexedDB:
//   - crypto core: import-non-extractable + low-s P256 signing (pure WebCrypto)
//   - persistence: IndexedDB put/get/clear (idbFactory injectable for tests)
//
// Backup/sync is unaffected and MUST NOT use this key: it uses the separately
// stored ENCRYPTED PKCS8 blob (account.encryptedPrivateKey). A non-extractable
// CryptoKey cannot be exported, which is exactly the point.

const DB_NAME = "celari-signing-keys";
const STORE = "keys";
const DB_VERSION = 1;

/** Decode base64 PKCS8 → Uint8Array. */
export function pkcs8BytesFromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Import PKCS8 bytes as a NON-EXTRACTABLE P-256 signing key (sign-only). */
export async function importNonExtractableSigningKey(pkcs8Bytes, subtle = crypto.subtle) {
  return subtle.importKey(
    "pkcs8",
    pkcs8Bytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false, // non-extractable: can sign, can never be re-exported
    ["sign"],
  );
}

// P-256 order n and n/2 — Noir's verify_ecdsa_p256 requires s <= n/2 (low-s).
const P256_N = [
  0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xBC, 0xE6, 0xFA, 0xAD, 0xA7, 0x17, 0x9E, 0x84, 0xF3, 0xB9, 0xCA, 0xC2, 0xFC, 0x63, 0x25, 0x51,
];
const P256_HALF_N = [
  0x7F, 0xFF, 0xFF, 0xFF, 0x80, 0x00, 0x00, 0x00, 0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xDE, 0x73, 0x7D, 0x56, 0xD3, 0x8B, 0xCF, 0x42, 0x79, 0xDC, 0xE5, 0x61, 0x7E, 0x31, 0x92, 0xA8,
];

/** Normalize a 64-byte (r||s) signature in place to low-s. Returns it. */
export function normalizeLowS(sigRaw) {
  const s = sigRaw.slice(32, 64);
  let high = false;
  for (let i = 0; i < 32; i++) {
    if (s[i] > P256_HALF_N[i]) { high = true; break; }
    if (s[i] < P256_HALF_N[i]) break;
  }
  if (high) {
    const newS = new Uint8Array(32);
    let borrow = 0;
    for (let i = 31; i >= 0; i--) {
      const d = P256_N[i] - s[i] - borrow;
      newS[i] = d < 0 ? d + 256 : d;
      borrow = d < 0 ? 1 : 0;
    }
    sigRaw.set(newS, 32);
  }
  return sigRaw;
}

/**
 * Sign a 32-byte message hash with the non-extractable key.
 * WebCrypto SHA-256 hashes internally (matches the Noir contract's
 * sha256(outer_hash)). Returns a low-s normalized 64-byte (r||s) signature.
 */
export async function signP256(cryptoKey, messageHashBytes, subtle = crypto.subtle) {
  const raw = new Uint8Array(
    await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cryptoKey, messageHashBytes),
  );
  return normalizeLowS(raw);
}

// ── IndexedDB persistence (idb injectable so tests need no real IndexedDB) ──

function resolveIdb(idb) {
  if (idb) return idb;
  return typeof indexedDB !== "undefined" ? indexedDB : null;
}

/**
 * Canonicalize an address into a stable IndexedDB key. Every caller must key the
 * SAME entry or signing silently breaks (the core C1 cross-context invariant):
 *   - popup unlock:           storeSigningKey(account.address, …)        [string]
 *   - offscreen deploy/import: storeSigningKey(address.toString(), …)    [string]
 *   - auth-witness provider:   loadSigningKey(this._address)             [string]
 * Lowercasing + String() coercion makes the lookup robust to casing drift and to
 * a string-vs-AztecAddress-object mismatch, regardless of which path stored it.
 * Aztec addresses are already lowercase 0x-hex, so this is a no-op for existing
 * entries (backward-compatible) and a guardrail against future drift.
 */
function keyFor(address) {
  return String(address ?? "").trim().toLowerCase();
}

// One shared connection per idb instance. Concurrent store/load/clear calls must
// NOT each open the DB independently: a 2nd open at the same version can resolve
// before the 1st connection committed the object store, so its transaction throws
// "One of the specified object stores was not found" (observed during the
// offscreen's busy PXE init). Caching the open promise serializes creation so all
// callers await one connection. Also self-heals a DB that exists WITHOUT the store
// (e.g. a bare `open()` with no store-creating onupgradeneeded ran elsewhere) by
// bumping the version to add it — closing the "object store not found" class.
const _dbCache = new Map();

function _rawOpen(idb, version) {
  return new Promise((resolve, reject) => {
    const req = version === undefined ? idb.open(DB_NAME) : idb.open(DB_NAME, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function _openDbOnce(idb) {
  // Open at the CURRENT version (no explicit version → never a VersionError if a
  // prior self-heal bumped it). A fresh DB is created at v1 with the store.
  let db = await _rawOpen(idb);
  if (!db.objectStoreNames.contains(STORE)) {
    const nextVersion = db.version + 1;
    db.close();
    db = await _rawOpen(idb, nextVersion);
  }
  // If another connection upgrades/deletes the DB (or this one closes), drop the
  // cached connection so the next call reopens cleanly.
  db.onversionchange = () => { try { db.close(); } catch {} _dbCache.delete(idb); };
  db.onclose = () => { _dbCache.delete(idb); };
  return db;
}

function openDb(idb) {
  let p = _dbCache.get(idb);
  if (p) return p;
  p = _openDbOnce(idb).catch((e) => { _dbCache.delete(idb); throw e; });
  _dbCache.set(idb, p);
  return p;
}

function runTx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Persist a (non-extractable) CryptoKey under `address`. */
export async function storeSigningKey(address, cryptoKey, idbFactory) {
  const idb = resolveIdb(idbFactory);
  if (!idb) throw new Error("IndexedDB unavailable for signing-key store");
  const db = await openDb(idb);
  await runTx(db, "readwrite", (s) => s.put(cryptoKey, keyFor(address)));
}

/** Load the CryptoKey for `address`, or null if absent. */
export async function loadSigningKey(address, idbFactory) {
  const idb = resolveIdb(idbFactory);
  if (!idb) return null;
  const db = await openDb(idb);
  return (await runTx(db, "readonly", (s) => s.get(keyFor(address)))) ?? null;
}

/** Wipe all signing keys (called on lock). */
export async function clearSigningKeys(idbFactory) {
  const idb = resolveIdb(idbFactory);
  if (!idb) return;
  const db = await openDb(idb);
  await runTx(db, "readwrite", (s) => s.clear());
}
