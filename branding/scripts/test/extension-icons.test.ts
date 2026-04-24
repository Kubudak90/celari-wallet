import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const OUT = resolve(ROOT, "branding/exports/extension");

describe("generate-extension-icons.mjs", () => {
  beforeAll(() => {
    execFileSync("node", ["branding/scripts/generate-extension-icons.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test.each([16, 32, 48, 128])("writes icon-%ipx.png", (s) => {
    expect(existsSync(resolve(OUT, `icon-${s}.png`))).toBe(true);
  });
});
