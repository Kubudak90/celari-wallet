import { isFaucetNetwork, FAUCET_NETWORKS } from "../public/src/lib/faucet-networks.js";

describe("faucet-networks", () => {
  it("enables faucet on testnet only", () => {
    expect(isFaucetNetwork("testnet")).toBe(true);
    expect(isFaucetNetwork("devnet")).toBe(false);
  });
  it("disables faucet on mainnet and local", () => {
    expect(isFaucetNetwork("mainnet")).toBe(false);
    expect(isFaucetNetwork("local")).toBe(false);
  });
  it("disables faucet for unknown / custom networks", () => {
    expect(isFaucetNetwork("custom-123")).toBe(false);
    expect(isFaucetNetwork(undefined)).toBe(false);
    expect(isFaucetNetwork(null)).toBe(false);
  });
  it("exposes the canonical set", () => {
    expect(FAUCET_NETWORKS).toEqual(["testnet"]);
  });
});
