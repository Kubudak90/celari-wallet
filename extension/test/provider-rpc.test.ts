// extension/test/provider-rpc.test.ts
import { describe, it, expect } from "@jest/globals";
import { parseProviderRpc, isAllowedRpc, ALLOWED_RPC_METHODS } from "../public/src/lib/provider-rpc.js";

describe("provider-rpc", () => {
  it("strips the aztec_ prefix to the bare method", () => {
    expect(parseProviderRpc("aztec_getAccounts").bare).toBe("getAccounts");
    expect(parseProviderRpc("getAccounts").bare).toBe("getAccounts");
  });
  it("flags write methods", () => {
    expect(parseProviderRpc("aztec_sendTx").isWrite).toBe(true);
    expect(parseProviderRpc("aztec_createAuthWit").isWrite).toBe(true);
    expect(parseProviderRpc("aztec_getAccounts").isWrite).toBe(false);
    expect(parseProviderRpc("aztec_simulateTx").isWrite).toBe(false);
  });
  it("allowlists only the supported wallet-sdk methods", () => {
    expect(isAllowedRpc("aztec_registerContract")).toBe(true);
    expect(isAllowedRpc("registerSender")).toBe(true);
    expect(isAllowedRpc("aztec_getContractMetadata")).toBe(true);
    expect(isAllowedRpc("aztec_evilMethod")).toBe(false);
    expect(isAllowedRpc("eth_sendTransaction")).toBe(false);
  });
  it("exposes the method set", () => {
    expect(ALLOWED_RPC_METHODS).toContain("sendTx");
    expect(ALLOWED_RPC_METHODS).toContain("getContractClassMetadata");
  });
});
