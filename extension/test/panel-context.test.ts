// extension/test/panel-context.test.ts
import { describe, it, expect } from "@jest/globals";
import { isPanelContext } from "../public/src/lib/panel-context.js";

describe("isPanelContext", () => {
  it("is true when panel=1 is present", () => {
    expect(isPanelContext("?panel=1")).toBe(true);
    expect(isPanelContext("?x=1&panel=1")).toBe(true);
  });
  it("is false otherwise", () => {
    expect(isPanelContext("")).toBe(false);
    expect(isPanelContext("?panel=0")).toBe(false);
    expect(isPanelContext("?wssign=abc")).toBe(false);
  });
  it("does not throw on junk input", () => {
    expect(isPanelContext(undefined as any)).toBe(false);
    expect(typeof isPanelContext("%%%")).toBe("boolean");
  });
});
