// extension/test/provider-accounts.test.ts
import { describe, it, expect } from "@jest/globals";
import { selectActiveAddress } from "../public/src/lib/provider-accounts.js";

describe("selectActiveAddress", () => {
  const acc = (address: string, deployed = true) => ({ address, deployed });

  it("returns the account at the active index", () => {
    const list = [acc("0xaaa"), acc("0xbbb")];
    expect(selectActiveAddress(list, 1)).toBe("0xbbb");
  });

  it("exposes the active account even when not deployed (fund-before-deploy)", () => {
    // You need Fee Juice to deploy, so the address must be visible pre-deploy.
    expect(selectActiveAddress([acc("0xpending", false)], 0)).toBe("0xpending");
    // Active selection wins over a deployed sibling: the user funds what they picked.
    expect(selectActiveAddress([acc("0xpending", false), acc("0xready")], 0)).toBe("0xpending");
  });

  it("falls back to the first account with an address when the active index has none", () => {
    expect(selectActiveAddress([{ deployed: false } as any, acc("0xready")], 0)).toBe("0xready");
  });

  it("returns null when no account has an address", () => {
    expect(selectActiveAddress([{ deployed: false } as any], 0)).toBeNull();
    expect(selectActiveAddress([], 0)).toBeNull();
    expect(selectActiveAddress(undefined as any, 0)).toBeNull();
  });
});
