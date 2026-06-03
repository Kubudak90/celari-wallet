// extension/test/provider-protocol.test.ts
import { describe, it, expect } from "@jest/globals";
import { PROVIDER_MSG, PROVIDER_METHODS, newRequestId } from "../public/src/lib/provider-protocol.js";

describe("provider-protocol", () => {
  it("exposes distinct provider message types", () => {
    const vals = Object.values(PROVIDER_MSG);
    expect(new Set(vals).size).toBe(vals.length);
    expect(PROVIDER_MSG.SECURE_MESSAGE).toBe("provider-secure-message");
  });

  it("lists the methods the provider routes", () => {
    expect(PROVIDER_METHODS).toContain("GET_WITHDRAW_PROOF");
    expect(PROVIDER_METHODS).toContain("DAPP_SIGN");
  });

  it("generates unique, prefixed request ids", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).not.toBe(b);
    expect(a.startsWith("celari_")).toBe(true);
  });
});
