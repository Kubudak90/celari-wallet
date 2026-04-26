// extension/public/src/lib/passkey-crypto.js
// WebAuthn PRF + AES-GCM-256 envelope encryption for wallet secrets.

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - b64url.length % 4) % 4);
  return base64ToBytes(b64);
}

export function generatePrfSalt() {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function probePrfSupport() {
  // PRF eval requires a credential — full probe happens during onboarding.
  // This is a baseline API surface check.
  return typeof PublicKeyCredential !== "undefined"
    && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function";
}

async function importKekFromPrfOutput(prfOutput) {
  return crypto.subtle.importKey(
    "raw", prfOutput,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt", "decrypt"],
  );
}

export async function evalPrf({ credentialId, prfSaltBase64 }) {
  const prfSalt = base64ToBytes(prfSaltBase64);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge, rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: base64UrlToBytes(credentialId) }],
      userVerification: "required",
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  if (!assertion) throw new Error("Passkey assertion cancelled");
  const ext = assertion.getClientExtensionResults?.();
  const out = ext?.prf?.results?.first;
  if (!out || out.byteLength !== 32) throw new Error("PRF unavailable on this passkey/browser");
  return new Uint8Array(out);
}

export async function encryptWithKek(kek, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, kek,
    new TextEncoder().encode(plaintext),
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ct)),
    schema: "aes-gcm-prf-v1",
  };
}

export async function decryptWithKek(kek, blob) {
  if (!blob || blob.schema !== "aes-gcm-prf-v1") {
    throw new Error(`Unknown encryption schema: ${blob?.schema}`);
  }
  const iv = base64ToBytes(blob.iv);
  const ct = base64ToBytes(blob.ciphertext);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, kek, ct);
  return new TextDecoder().decode(pt);
}

export async function deriveKek({ credentialId, prfSaltBase64 }) {
  const prfOutput = await evalPrf({ credentialId, prfSaltBase64 });
  return importKekFromPrfOutput(prfOutput);
}

export const saltCodec = {
  toBase64: bytesToBase64,
  fromBase64: base64ToBytes,
};

export { bytesToBase64, base64ToBytes, base64UrlToBytes };
