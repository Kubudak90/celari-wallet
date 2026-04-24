import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const DEST = resolve(ROOT, "extension/public/icons");

describe("copy-to-extension.mjs", () => {
  beforeAll(() => {
    // Ensure sources exist by running the generator first (idempotent).
    execFileSync("node", ["branding/scripts/generate-extension-icons.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    execFileSync("node", ["branding/scripts/copy-to-extension.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test.each([16, 32, 48, 128])("extension/public/icons/icon-%ipx.png exists", (s) => {
    const p = resolve(DEST, `icon-${s}.png`);
    expect(existsSync(p)).toBe(true);
    expect(statSync(p).size).toBeGreaterThan(100);
  });
});
