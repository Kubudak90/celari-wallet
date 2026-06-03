// extension/test/bridge-config.test.ts
import { describe, it, expect } from "@jest/globals";
import { BRIDGE } from "../public/src/lib/bridge-config.js";

describe("bridge-config", () => {
  it("exposes 0x-hex addresses", () => {
    for (const k of ["TOKEN_BRIDGE_ADDRESS", "BRIDGED_TOKEN_ADDRESS", "L1_PORTAL_ADDRESS", "L1_ETH_TOKEN"]) {
      expect((BRIDGE as any)[k]).toMatch(/^0x[0-9a-fA-F]+$/);
    }
  });
  it("L1 ETH token is the zero address", () => {
    expect(BRIDGE.L1_ETH_TOKEN).toBe("0x0000000000000000000000000000000000000000");
  });
});
