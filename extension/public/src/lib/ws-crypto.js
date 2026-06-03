// extension/public/src/lib/ws-crypto.js
// Aztec wallet-sdk ECDH crypto — pure WebCrypto, no imports.
// Mirrors @aztec/wallet-sdk/dest/crypto.js exactly. Single source of truth,
// shared by background.js (wallet side) and inpage.js (app side).

const _WS_P256_SZ = 32;
const _WS_HKDF_INFO = new TextEncoder().encode("Aztec Wallet DAPP Key derivation");
const _WS_FP_DATA   = new TextEncoder().encode("aztec-wallet-verification-verificationHash");

export async function wsGenerateKeyPair() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
}

export async function wsExportPublicKey(pk) {
  const jwk = await crypto.subtle.exportKey("jwk", pk);
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

export function wsImportPublicKey(exported) {
  return crypto.subtle.importKey("jwk", exported, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

function _wsB64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function _wsFixedCoord(b64url) {
  const decoded = _wsB64urlToBytes(b64url);
  if (decoded.length === _WS_P256_SZ) return decoded;
  if (decoded.length > _WS_P256_SZ) {
    throw new Error(`Invalid P-256 coordinate: expected ${_WS_P256_SZ} bytes, got ${decoded.length}`);
  }
  const padded = new Uint8Array(_WS_P256_SZ);
  padded.set(decoded, _WS_P256_SZ - decoded.length);
  return padded;
}

function _wsSaltFromKeys(appKey, walletKey) {
  const salt = new Uint8Array(4 * _WS_P256_SZ);
  salt.set(_wsFixedCoord(appKey.x),    0);
  salt.set(_wsFixedCoord(appKey.y),    _WS_P256_SZ);
  salt.set(_wsFixedCoord(walletKey.x), 2 * _WS_P256_SZ);
  salt.set(_wsFixedCoord(walletKey.y), 3 * _WS_P256_SZ);
  return salt.buffer;
}

export async function wsDeriveSessionKeys(ownKeyPair, peerPublicKey, isApp) {
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerPublicKey }, ownKeyPair.privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, ["deriveBits"]);
  const ownExp  = await wsExportPublicKey(ownKeyPair.publicKey);
  const peerExp = await wsExportPublicKey(peerPublicKey);
  const appKey    = isApp ? ownExp  : peerExp;
  const walletKey = isApp ? peerExp : ownExp;
  const salt = _wsSaltFromKeys(appKey, walletKey);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: _WS_HKDF_INFO }, hkdfKey, 512
  );
  const encryptionKey = await crypto.subtle.importKey(
    "raw", derivedBits.slice(0, 32), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
  const hmacKey = await crypto.subtle.importKey(
    "raw", derivedBits.slice(32, 64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const hashBuf = await crypto.subtle.sign("HMAC", hmacKey, _WS_FP_DATA);
  const verificationHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return { encryptionKey, verificationHash };
}

function _wsAb2b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function _wsB642ab(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function wsEncrypt(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(data));
  return { iv: _wsAb2b64(iv), ciphertext: _wsAb2b64(ciphertext) };
}

export async function wsDecrypt(key, payload) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: _wsB642ab(payload.iv) },
    key,
    _wsB642ab(payload.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
