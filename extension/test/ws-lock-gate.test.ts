// extension/test/ws-lock-gate.test.ts

import {
  classifySecureMessage,
  WS_WRITE_METHODS,
} from "../public/src/lib/ws-lock-gate.js";

describe("ws-lock-gate", () => {
  describe("classifySecureMessage", () => {
    it("routes write methods to the sign popup when unlocked", () => {
      expect(classifySecureMessage({ method: "sendTx", locked: false })).toBe("sign-popup");
      expect(classifySecureMessage({ method: "createAuthWit", locked: false })).toBe("sign-popup");
    });

    it("routes write methods to the sign popup even when locked (popup self-gates unlock)", () => {
      expect(classifySecureMessage({ method: "sendTx", locked: true })).toBe("sign-popup");
      expect(classifySecureMessage({ method: "createAuthWit", locked: true })).toBe("sign-popup");
    });

    it("forwards read methods straight to PXE when unlocked", () => {
      expect(classifySecureMessage({ method: "getAccounts", locked: false })).toBe("forward");
      expect(classifySecureMessage({ method: "requestCapabilities", locked: false })).toBe("forward");
      expect(classifySecureMessage({ method: "getChainInfo", locked: false })).toBe("forward");
      expect(classifySecureMessage({ method: "executeUtility", locked: false })).toBe("forward");
    });

    // The bug this fix addresses: a locked read (the connect handshake) used to
    // forward → fail with "Wallet locked" and show no unlock UI. It must now
    // route to unlock-then-resume so the unlock screen appears on connect.
    it("routes locked read methods to unlock-then-resume (the connect-while-locked fix)", () => {
      expect(classifySecureMessage({ method: "requestCapabilities", locked: true })).toBe("unlock-then-resume");
      expect(classifySecureMessage({ method: "getAccounts", locked: true })).toBe("unlock-then-resume");
      expect(classifySecureMessage({ method: "getChainInfo", locked: true })).toBe("unlock-then-resume");
      expect(classifySecureMessage({ method: "executeUtility", locked: true })).toBe("unlock-then-resume");
    });

    it("treats an unknown method as read-class", () => {
      expect(classifySecureMessage({ method: "somethingNew", locked: false })).toBe("forward");
      expect(classifySecureMessage({ method: "somethingNew", locked: true })).toBe("unlock-then-resume");
    });

    it("honours a custom writeMethods set", () => {
      const writeMethods = new Set(["sendTx", "createAuthWit", "registerSender"]);
      expect(classifySecureMessage({ method: "registerSender", locked: true, writeMethods })).toBe("sign-popup");
      // default set treats registerSender as read-class
      expect(classifySecureMessage({ method: "registerSender", locked: true })).toBe("unlock-then-resume");
    });

    it("WS_WRITE_METHODS contains exactly the mutating methods", () => {
      expect([...WS_WRITE_METHODS].sort()).toEqual(["createAuthWit", "sendTx"]);
    });
  });
});
