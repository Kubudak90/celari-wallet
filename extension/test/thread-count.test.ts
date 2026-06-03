// extension/test/thread-count.test.ts
import { describe, it, expect } from "@jest/globals";
import { chooseThreadCount } from "../public/src/lib/thread-count.js";

describe("chooseThreadCount", () => {
  it("uses capped hardwareConcurrency when isolated and not iOS", () => {
    expect(chooseThreadCount({ isolated: true, isIOS: false, hardwareConcurrency: 12, cap: 8 })).toBe(8);
    expect(chooseThreadCount({ isolated: true, isIOS: false, hardwareConcurrency: 4, cap: 8 })).toBe(4);
  });
  it("returns 1 when not crossOriginIsolated", () => {
    expect(chooseThreadCount({ isolated: false, isIOS: false, hardwareConcurrency: 12, cap: 8 })).toBe(1);
  });
  it("returns 1 on iOS regardless of isolation", () => {
    expect(chooseThreadCount({ isolated: true, isIOS: true, hardwareConcurrency: 12, cap: 8 })).toBe(1);
  });
  it("defaults hardwareConcurrency to 4 when unknown", () => {
    expect(chooseThreadCount({ isolated: true, isIOS: false, hardwareConcurrency: 0, cap: 8 })).toBe(4);
    expect(chooseThreadCount({ isolated: true, isIOS: false, hardwareConcurrency: undefined, cap: 8 })).toBe(4);
  });
  it("never returns less than 1 and defaults cap to 8", () => {
    expect(chooseThreadCount({ isolated: true, isIOS: false, hardwareConcurrency: 32 })).toBe(8);
    expect(chooseThreadCount({})).toBe(1);
  });
});
