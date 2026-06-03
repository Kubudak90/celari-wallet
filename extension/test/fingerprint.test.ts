// extension/test/fingerprint.test.ts
import { describe, it, expect } from "@jest/globals";
import { verificationFingerprint } from "../public/src/lib/fingerprint.js";

describe("verificationFingerprint", () => {
  it("is deterministic and stable for the same hash", () => {
    const a = verificationFingerprint("00ff7a3c");
    expect(a).toBe(verificationFingerprint("00ff7a3c"));
  });
  it("returns 4 emoji", () => {
    expect([...verificationFingerprint("00ff7a3c")].length).toBe(4);
  });
  it("differs for different hashes", () => {
    expect(verificationFingerprint("00000000")).not.toBe(verificationFingerprint("ffffffff"));
  });
  it("handles empty / short input without throwing", () => {
    expect(typeof verificationFingerprint("")).toBe("string");
    expect(typeof verificationFingerprint("a")).toBe("string");
  });
});
