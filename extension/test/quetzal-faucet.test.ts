import { QUETZAL_FAUCET_URL, requestQuetzalDrip } from "../public/src/lib/quetzal-faucet.js";

function mockFetch(body: unknown, ok = true) {
  return jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
}

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

  it("throws the server error on success:false", async () => {
    const f = mockFetch({ success: false, error: "faucet drained" });
    await expect(requestQuetzalDrip("0xdead", { fetchImpl: f })).rejects.toThrow(/faucet drained/);
  });

  it("throws on non-ok HTTP", async () => {
    const f = mockFetch({ error: "rate-limited" }, false);
    await expect(requestQuetzalDrip("0xdead", { fetchImpl: f })).rejects.toThrow();
  });
});
