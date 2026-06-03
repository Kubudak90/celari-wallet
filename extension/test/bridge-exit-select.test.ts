// extension/test/bridge-exit-select.test.ts
import { describe, it, expect } from "@jest/globals";
import { selectExitMode } from "../public/src/lib/bridge-exit-select.js";

describe("selectExitMode", () => {
  it("prefers private when the private balance covers the amount", () => {
    expect(selectExitMode(100n, 100n, 50n)).toBe("private");
    expect(selectExitMode(50n, 0n, 50n)).toBe("private");
  });
  it("falls back to public when private is insufficient but public covers it", () => {
    expect(selectExitMode(10n, 100n, 50n)).toBe("public");
    expect(selectExitMode(0n, 50n, 50n)).toBe("public");
  });
  it("returns null when neither balance covers the amount", () => {
    expect(selectExitMode(10n, 10n, 50n)).toBeNull();
    expect(selectExitMode(0n, 0n, 1n)).toBeNull();
  });
  it("accepts string/number balances and coerces to BigInt", () => {
    expect(selectExitMode("100", "0", "50")).toBe("private");
    expect(selectExitMode(0, 100, 50)).toBe("public");
  });
});
