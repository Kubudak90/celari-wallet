// extension/test/account-schema.test.ts

import {
  detectLegacyPlaintext,
  validateAccountsArray,
  purgePending,
} from "../public/src/lib/account-schema.js";

describe("account-schema", () => {
  describe("detectLegacyPlaintext", () => {
    it("returns true for passkey account with secretKey", () => {
      expect(detectLegacyPlaintext([{ type: "passkey", address: "0x1", secretKey: "x" }])).toBe(true);
    });

    it("returns true for passkey account with privateKeyPkcs8", () => {
      expect(detectLegacyPlaintext([{ type: "passkey", address: "0x1", privateKeyPkcs8: "x" }])).toBe(true);
    });

    it("returns false for fully encrypted passkey account", () => {
      expect(detectLegacyPlaintext([{
        type: "passkey",
        address: "0x1",
        encryptedSecret: { iv: "i", ciphertext: "c", schema: "aes-gcm-prf-v1" },
        encryptedPrivateKey: { iv: "i", ciphertext: "c", schema: "aes-gcm-prf-v1" },
        prfSalt: "salt",
      }])).toBe(false);
    });

    it("returns false for demo accounts (no secrets to leak)", () => {
      expect(detectLegacyPlaintext([{ type: "demo", address: "0xd" }])).toBe(false);
    });

    it("returns false for empty array", () => {
      expect(detectLegacyPlaintext([])).toBe(false);
    });

    it("returns false for non-array input", () => {
      expect(detectLegacyPlaintext(null as any)).toBe(false);
      expect(detectLegacyPlaintext("garbage" as any)).toBe(false);
    });
  });

  describe("validateAccountsArray", () => {
    it("accepts a valid passkey-only array", () => {
      expect(validateAccountsArray([{
        type: "passkey",
        address: "0x1",
        encryptedSecret: {}, encryptedPrivateKey: {}, prfSalt: "s",
      }])).toBe(true);
    });

    it("throws on non-array", () => {
      expect(() => validateAccountsArray("garbage" as any)).toThrow(/not an array/);
    });

    it("throws on entry missing address", () => {
      expect(() => validateAccountsArray([{ type: "passkey" } as any])).toThrow(/missing address/);
    });

    it("throws on passkey account missing encryptedSecret", () => {
      expect(() => validateAccountsArray([{
        type: "passkey", address: "0x1",
        encryptedPrivateKey: {}, prfSalt: "s",
      } as any])).toThrow(/missing encrypted fields/);
    });

    it("throws on passkey account missing encryptedPrivateKey", () => {
      expect(() => validateAccountsArray([{
        type: "passkey", address: "0x1",
        encryptedSecret: {}, prfSalt: "s",
      } as any])).toThrow(/missing encrypted fields/);
    });

    it("throws on passkey account missing prfSalt", () => {
      expect(() => validateAccountsArray([{
        type: "passkey", address: "0x1",
        encryptedSecret: {}, encryptedPrivateKey: {},
      } as any])).toThrow(/missing encrypted fields/);
    });

    it("accepts demo accounts without encryption fields", () => {
      expect(validateAccountsArray([{ type: "demo", address: "0xd" }])).toBe(true);
    });
  });

  describe("purgePending", () => {
    it("removes accounts whose address contains _pending", () => {
      const out = purgePending([
        { address: "0x1" },
        { address: "0x2_pending" },
        { address: "0x3" },
      ]);
      expect(out.length).toBe(2);
      expect(out.map(a => a.address)).toEqual(["0x1", "0x3"]);
    });

    it("returns the same shape on no-op", () => {
      const input = [{ address: "0x1" }, { address: "0x2" }];
      expect(purgePending(input)).toEqual(input);
    });

    it("handles empty array", () => {
      expect(purgePending([])).toEqual([]);
    });
  });
});
