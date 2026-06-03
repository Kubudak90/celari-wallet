// extension/test/ws-crypto.test.ts
import { describe, it, expect } from "@jest/globals";

import {
  wsGenerateKeyPair,
  wsExportPublicKey,
  wsImportPublicKey,
  wsDeriveSessionKeys,
  wsEncrypt,
  wsDecrypt,
} from "../public/src/lib/ws-crypto.js";

describe("ws-crypto", () => {
  it("derives identical session keys on app and wallet sides (isApp symmetry)", async () => {
    const app = await wsGenerateKeyPair();
    const wallet = await wsGenerateKeyPair();
    const appPubExp = await wsExportPublicKey(app.publicKey);
    const walletPubExp = await wsExportPublicKey(wallet.publicKey);

    const appSide = await wsDeriveSessionKeys(app, await wsImportPublicKey(walletPubExp), true);
    const walletSide = await wsDeriveSessionKeys(wallet, await wsImportPublicKey(appPubExp), false);

    expect(appSide.verificationHash).toEqual(walletSide.verificationHash);
  });

  it("round-trips an encrypted message app -> wallet", async () => {
    const app = await wsGenerateKeyPair();
    const wallet = await wsGenerateKeyPair();
    const appPub = await wsExportPublicKey(app.publicKey);
    const walletPub = await wsExportPublicKey(wallet.publicKey);
    const appSide = await wsDeriveSessionKeys(app, await wsImportPublicKey(walletPub), true);
    const walletSide = await wsDeriveSessionKeys(wallet, await wsImportPublicKey(appPub), false);

    const payload = JSON.stringify({ method: "GET_ADDRESS", requestId: "celari_1_42" });
    const enc = await wsEncrypt(appSide.encryptionKey, payload);
    expect(typeof enc.iv).toBe("string");
    expect(typeof enc.ciphertext).toBe("string");

    const dec = await wsDecrypt(walletSide.encryptionKey, enc);
    expect(dec).toEqual({ method: "GET_ADDRESS", requestId: "celari_1_42" });
  });

  it("rejects a tampered ciphertext (AES-GCM auth tag)", async () => {
    const app = await wsGenerateKeyPair();
    const wallet = await wsGenerateKeyPair();
    const appPub = await wsExportPublicKey(app.publicKey);
    const walletPub = await wsExportPublicKey(wallet.publicKey);
    const appSide = await wsDeriveSessionKeys(app, await wsImportPublicKey(walletPub), true);
    const walletSide = await wsDeriveSessionKeys(wallet, await wsImportPublicKey(appPub), false);

    const enc = await wsEncrypt(appSide.encryptionKey, JSON.stringify({ x: 1 }));
    // Corrupt one base64 char of the ciphertext deterministically.
    const bytes = Buffer.from(enc.ciphertext, "base64");
    bytes[0] ^= 0x01;
    const tampered = { iv: enc.iv, ciphertext: bytes.toString("base64") };

    await expect(wsDecrypt(walletSide.encryptionKey, tampered)).rejects.toThrow();
  });
});
