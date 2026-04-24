import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const OUT = resolve(ROOT, "branding/exports/favicon");
const SIZES = [16, 32, 48, 192, 512];

describe("generate-favicon.mjs", () => {
  beforeAll(() => {
    execFileSync("node", ["branding/scripts/generate-favicon.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test.each(SIZES)("writes favicon-%ipx.png", (s) => {
    expect(existsSync(resolve(OUT, `favicon-${s}.png`))).toBe(true);
  });

  test("writes favicon.ico", () => {
    expect(existsSync(resolve(OUT, "favicon.ico"))).toBe(true);
  });

  test("writes apple-touch-icon.png (180px)", () => {
    expect(existsSync(resolve(OUT, "apple-touch-icon.png"))).toBe(true);
  });
});
