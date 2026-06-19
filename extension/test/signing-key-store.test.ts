// Unit tests for the security-critical crypto core of signing-key-store.
// (The IndexedDB persistence layer is runtime plumbing verified at load time.)
import { webcrypto } from "node:crypto";
import {
  importNonExtractableSigningKey,
  signP256,
  normalizeLowS,
  pkcs8BytesFromBase64,
} from "../public/src/lib/signing-key-store.js";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;

// P-256 order n and n/2
const P256_N = [
  0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xBC, 0xE6, 0xFA, 0xAD, 0xA7, 0x17, 0x9E, 0x84, 0xF3, 0xB9, 0xCA, 0xC2, 0xFC, 0x63, 0x25, 0x51,
];
const P256_HALF_N = [
  0x7F, 0xFF, 0xFF, 0xFF, 0x80, 0x00, 0x00, 0x00, 0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xDE, 0x73, 0x7D, 0x56, 0xD3, 0x8B, 0xCF, 0x42, 0x79, 0xDC, 0xE5, 0x61, 0x7E, 0x31, 0x92, 0xA8,
];

function isLowS(sig: Uint8Array): boolean {
  const s = sig.slice(32, 64);
  for (let i = 0; i < 32; i++) {
    if (s[i] > P256_HALF_N[i]) return false;
    if (s[i] < P256_HALF_N[i]) return true;
  }
  return true; // equal to n/2 counts as low
}

async function genKeyPair() {
  const kp = (await subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", kp.privateKey));
  return { kp, pkcs8 };
}

describe("signing-key-store crypto core", () => {
  it("imports a NON-EXTRACTABLE signing key that cannot be re-exported", async () => {
    const { pkcs8 } = await genKeyPair();
    const key = await importNonExtractableSigningKey(pkcs8, subtle);
    expect(key.extractable).toBe(false);
    await expect(subtle.exportKey("pkcs8", key)).rejects.toThrow();
    await expect(subtle.exportKey("jwk", key)).rejects.toThrow();
  });

  it("produces a valid, low-s P256 signature verifiable against the public key", async () => {
    const { kp, pkcs8 } = await genKeyPair();
    const key = await importNonExtractableSigningKey(pkcs8, subtle);
    const msgHash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) msgHash[i] = (i * 7 + 3) & 0xff;

    const sig = await signP256(key, msgHash, subtle);
    expect(sig.length).toBe(64);

    const ok = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      kp.publicKey,
      sig,
      msgHash,
    );
    expect(ok).toBe(true);
    expect(isLowS(sig)).toBe(true);
  });

  it("signs deterministically-verifiable output across many messages (all low-s)", async () => {
    const { kp, pkcs8 } = await genKeyPair();
    const key = await importNonExtractableSigningKey(pkcs8, subtle);
    for (let n = 0; n < 12; n++) {
      const h = new Uint8Array(32);
      for (let i = 0; i < 32; i++) h[i] = (n * 31 + i * 13) & 0xff;
      const sig = await signP256(key, h, subtle);
      expect(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, kp.publicKey, sig, h)).toBe(true);
      expect(isLowS(sig)).toBe(true);
    }
  });

  it("normalizeLowS flips high-s (n-1 -> 1) and is idempotent on low-s", () => {
    const sig = new Uint8Array(64);
    for (let i = 0; i < 32; i++) sig[i] = 0x11; // arbitrary r
    const nMinus1 = [...P256_N];
    nMinus1[31] -= 1; // s = n - 1 (high)
    for (let i = 0; i < 32; i++) sig[32 + i] = nMinus1[i];
    expect(isLowS(sig)).toBe(false);

    const out = normalizeLowS(sig.slice()); // s' = n - (n-1) = 1
    const s2 = out.slice(32, 64);
    expect([...s2.slice(0, 31)].every((b) => b === 0)).toBe(true);
    expect(s2[31]).toBe(1);
    expect(isLowS(out)).toBe(true);

    const again = normalizeLowS(out.slice());
    expect([...again.slice(32, 64)]).toEqual([...out.slice(32, 64)]);
  });

  it("pkcs8BytesFromBase64 round-trips PKCS8 bytes", async () => {
    const { pkcs8 } = await genKeyPair();
    const b64 = Buffer.from(pkcs8).toString("base64");
    expect([...pkcs8BytesFromBase64(b64)]).toEqual([...pkcs8]);
  });
});
