// extension/test/sanitize.test.ts

import { sanitizeRpcError } from "../public/src/lib/sanitize.js";

describe("sanitizeRpcError", () => {
  it("strips https URLs", () => {
    expect(sanitizeRpcError(new Error("fetch failed at https://rpc.example.com:9999/path"))).toContain("<url>");
  });

  it("strips http URLs", () => {
    expect(sanitizeRpcError(new Error("connect ECONNREFUSED http://localhost:8080"))).toContain("<url>");
  });

  it("strips IPv4 addresses", () => {
    expect(sanitizeRpcError(new Error("connect failed to 192.168.1.1"))).toContain("<ip>");
  });

  it("strips file paths to .js/.ts/.wasm/.json", () => {
    const out = sanitizeRpcError(new Error("error in /Users/foo/bar.js:42"));
    expect(out).toContain("<file>");
    expect(out).not.toContain("/Users/foo");
  });

  it("strips aztec node-version banner", () => {
    expect(sanitizeRpcError(new Error("rejected by aztec_node_version: v1.2.3-rc"))).toContain("<node>");
  });

  it("truncates to 240 chars + ellipsis", () => {
    const long = "x".repeat(500);
    const out = sanitizeRpcError(new Error(long));
    expect(out.length).toBeLessThanOrEqual(243);
    expect(out.endsWith("...")).toBe(true);
  });

  it("strips stack frames after first '    at '", () => {
    const out = sanitizeRpcError(new Error("boom\n    at foo (file.js:1)\n    at bar (file.js:2)"));
    expect(out).not.toContain("at foo");
  });

  it("handles null input", () => {
    expect(sanitizeRpcError(null)).toBe("");
  });

  it("handles undefined input", () => {
    expect(sanitizeRpcError(undefined)).toBe("");
  });

  it("handles plain string error", () => {
    expect(sanitizeRpcError("just a string")).toBe("just a string");
  });

  it("handles object with non-string message", () => {
    const out = sanitizeRpcError({ message: { code: 429, url: "https://x.com" } } as any);
    // Should not throw — falls back to JSON.stringify
    expect(typeof out).toBe("string");
  });

  it("preserves benign messages unchanged", () => {
    expect(sanitizeRpcError(new Error("Wallet is locked"))).toBe("Wallet is locked");
  });
});
