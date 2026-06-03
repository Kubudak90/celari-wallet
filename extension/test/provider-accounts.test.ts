// extension/test/provider-accounts.test.ts
import { describe, it, expect } from "@jest/globals";
import { selectActiveAddress } from "../public/src/lib/provider-accounts.js";

describe("selectActiveAddress", () => {
  const acc = (address: string, deployed = true) => ({ address, deployed });

  it("returns the account at the active index when deployed", () => {
    const list = [acc("0xaaa"), acc("0xbbb")];
    expect(selectActiveAddress(list, 1)).toBe("0xbbb");
  });

  it("falls back to the first deployed account when the index is not deployed", () => {
    const list = [acc("0xpending", false), acc("0xready")];
    expect(selectActiveAddress(list, 0)).toBe("0xready");
  });

  it("returns null when there are no deployed accounts", () => {
    expect(selectActiveAddress([acc("0xx", false)], 0)).toBeNull();
    expect(selectActiveAddress([], 0)).toBeNull();
    expect(selectActiveAddress(undefined as any, 0)).toBeNull();
  });
});
