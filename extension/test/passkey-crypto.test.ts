// extension/test/passkey-crypto.test.ts

import {
  generatePrfSalt,
  encryptWithKek,
  decryptWithKek,
  bytesToBase64,
  base64ToBytes,
  base64UrlToBytes,
} from "../public/src/lib/passkey-crypto.js";

async function fakeKek(seed = 0): Promise<CryptoKey> {
  // Deterministic 32-byte key for tests — NOT for production
  const raw = new Uint8Array(32);
  for (let i = 0; i < 32; i++) raw[i] = (i + seed) & 0xff;
  return crypto.subtle.importKey(
    "raw", raw,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt", "decrypt"],
  );
}

describe("passkey-crypto", () => {
  describe("generatePrfSalt", () => {
    it("returns 32 bytes", () => {
      expect(generatePrfSalt().length).toBe(32);
    });

    it("returns different bytes on each call (randomness sanity)", () => {
      const a = bytesToBase64(generatePrfSalt());
      const b = bytesToBase64(generatePrfSalt());
      expect(a).not.toBe(b);
    });
  });

  describe("base64 codec", () => {
    it("bytesToBase64 round-trips through base64ToBytes", () => {
      const input = new Uint8Array([1, 2, 3, 250, 0, 255]);
      const b64 = bytesToBase64(input);
      const out = base64ToBytes(b64);
      expect(Array.from(out)).toEqual(Array.from(input));
    });

    it("base64UrlToBytes accepts unpadded base64url", () => {
      const padded = base64ToBytes("aGVsbG8=");
      const unpadded = base64UrlToBytes("aGVsbG8");
      expect(Array.from(padded)).toEqual(Array.from(unpadded));
    });

    it("base64UrlToBytes maps -/_ back to +/", () => {
      const original = new Uint8Array([0x3e, 0x3f]);
      const url = bytesToBase64(original).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const standard = bytesToBase64(original);
      expect(Array.from(base64UrlToBytes(url))).toEqual(Array.from(base64ToBytes(standard)));
    });
  });

  describe("AES-GCM round-trip", () => {
    it("encryptWithKek + decryptWithKek returns the original plaintext", async () => {
      const kek = await fakeKek();
      const blob = await encryptWithKek(kek, "hello celari");
      const out = await decryptWithKek(kek, blob);
      expect(out).toBe("hello celari");
    });

    it("encryption produces fresh IVs per call (no IV reuse)", async () => {
      const kek = await fakeKek();
      const a = await encryptWithKek(kek, "same plaintext");
      const b = await encryptWithKek(kek, "same plaintext");
      expect(a.iv).not.toBe(b.iv);
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it("schema field is set to aes-gcm-prf-v1", async () => {
      const kek = await fakeKek();
      const blob = await encryptWithKek(kek, "x");
      expect(blob.schema).toBe("aes-gcm-prf-v1");
    });

    it("decryptWithKek throws on tampered ciphertext", async () => {
      const kek = await fakeKek();
      const blob = await encryptWithKek(kek, "secret");
      const tampered = { ...blob, ciphertext: blob.ciphertext.replace(/.$/, "A") };
      await expect(decryptWithKek(kek, tampered)).rejects.toBeDefined();
    });

    it("decryptWithKek throws on wrong KEK", async () => {
      const kek1 = await fakeKek(0);
      const kek2 = await fakeKek(1);
      const blob = await encryptWithKek(kek1, "secret");
      await expect(decryptWithKek(kek2, blob)).rejects.toBeDefined();
    });

    it("decryptWithKek throws on unknown schema", async () => {
      const kek = await fakeKek();
      const blob = await encryptWithKek(kek, "x");
      const wrongSchema = { ...blob, schema: "future-v9" };
      await expect(decryptWithKek(kek, wrongSchema as any)).rejects.toThrow(/schema/);
    });

    it("survives unicode plaintext", async () => {
      const kek = await fakeKek();
      const text = "🔐 Türkçe karakterler é è ñ あいう 中文";
      const blob = await encryptWithKek(kek, text);
      expect(await decryptWithKek(kek, blob)).toBe(text);
    });

    it("handles empty plaintext", async () => {
      const kek = await fakeKek();
      const blob = await encryptWithKek(kek, "");
      expect(await decryptWithKek(kek, blob)).toBe("");
    });

    it("handles long plaintext (10kb)", async () => {
      const kek = await fakeKek();
      const text = "x".repeat(10_000);
      const blob = await encryptWithKek(kek, text);
      expect(await decryptWithKek(kek, blob)).toBe(text);
    });
  });
});
