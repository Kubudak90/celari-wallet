import { QUETZAL_FAUCET_URL, QUETZAL_KNOWN_TOKENS, requestQuetzalDrip } from "../public/src/lib/quetzal-faucet.js";

function mockFetch(body: unknown, ok = true) {
  return jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
}

const KNOWN_TUSDC = QUETZAL_KNOWN_TOKENS.find((t: any) => t.symbol === "tUSDC");
const KNOWN_TETH = QUETZAL_KNOWN_TOKENS.find((t: any) => t.symbol === "tETH");

describe("quetzal-faucet", () => {
  it("posts {address, captchaToken} to the Quetzal drip endpoint", async () => {
    const f = mockFetch({ success: true, claimData: { claimSecretHex: "0xabc", messageLeafIndex: 7, claimAmount: "100" }, tUSDCMint: { amount: "1000000000" }, tETHMint: { amount: "500000000000000000" } });
    await requestQuetzalDrip("0xdead", { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(QUETZAL_FAUCET_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ address: "0xdead", captchaToken: "" });
  });

  it("normalizes claimData to {claimSecret, messageLeafIndex, claimAmount} + extra amounts", async () => {
    const f = mockFetch({ success: true, claimData: { claimSecretHex: "0xsecret", messageLeafIndex: 7, claimAmount: "100" }, tUSDCMint: { amount: "1000000000" }, tETHMint: { amount: "500000000000000000" } });
    const out = await requestQuetzalDrip("0xdead", { fetchImpl: f });
    expect(out.claim).toEqual({ claimSecret: "0xsecret", messageLeafIndex: "7", claimAmount: "100" });
    expect(out.tUSDC).toBe("1000000000");
    expect(out.tETH).toBe("500000000000000000");
  });

  it("returns tokens with the known fallback addresses + correct decimals when the response omits addresses", async () => {
    const f = mockFetch({ success: true, claimData: { claimSecretHex: "0xs", messageLeafIndex: 1, claimAmount: "1" }, tUSDCMint: { amount: "1000000" }, tETHMint: { amount: "500000000000000000" } });
    const out = await requestQuetzalDrip("0xdead", { fetchImpl: f });
    expect(out.tokens).toEqual([
      { symbol: "tUSDC", address: KNOWN_TUSDC.address, decimals: 6, amount: "1000000" },
      { symbol: "tETH", address: KNOWN_TETH.address, decimals: 18, amount: "500000000000000000" },
    ]);
  });

  it("prefers the token address from the faucet response over the fallback constant", async () => {
    const respUsdc = "0xaaa0000000000000000000000000000000000000000000000000000000000001";
    const respEth = "0xbbb0000000000000000000000000000000000000000000000000000000000002";
    const f = mockFetch({ success: true, claimData: { claimSecretHex: "0xs", messageLeafIndex: 1, claimAmount: "1" }, tUSDCMint: { amount: "1000000", tokenAddress: respUsdc }, tETHMint: { amount: "5", address: respEth } });
    const out = await requestQuetzalDrip("0xdead", { fetchImpl: f });
    expect(out.tokens[0]).toEqual({ symbol: "tUSDC", address: respUsdc, decimals: 6, amount: "1000000" });
    expect(out.tokens[1]).toEqual({ symbol: "tETH", address: respEth, decimals: 18, amount: "5" });
  });

  it("still returns the known tokens (amount null) when the response carries no mint objects", async () => {
    const f = mockFetch({ success: true, claimData: { claimSecretHex: "0xs", messageLeafIndex: 1, claimAmount: "1" } });
    const out = await requestQuetzalDrip("0xdead", { fetchImpl: f });
    expect(out.tokens).toEqual([
      { symbol: "tUSDC", address: KNOWN_TUSDC.address, decimals: 6, amount: null },
      { symbol: "tETH", address: KNOWN_TETH.address, decimals: 18, amount: null },
    ]);
  });

  it("throws the server error on success:false", async () => {
    const f = mockFetch({ success: false, error: "faucet drained" });
    await expect(requestQuetzalDrip("0xdead", { fetchImpl: f })).rejects.toThrow(/faucet drained/);
  });

  it("throws on non-ok HTTP", async () => {
    const f = mockFetch({ error: "rate-limited" }, false);
    await expect(requestQuetzalDrip("0xdead", { fetchImpl: f })).rejects.toThrow();
  });
});
