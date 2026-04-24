import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const OUT = resolve(ROOT, "branding/exports/app-icon");
const SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

describe("generate-logo-variants.mjs", () => {
  beforeAll(() => {
    execFileSync("node", ["branding/scripts/generate-logo-variants.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test.each(SIZES)("writes dark-%ipx.png", (size) => {
    const p = resolve(OUT, `dark-${size}.png`);
    expect(existsSync(p)).toBe(true);
    expect(statSync(p).size).toBeGreaterThan(100);
  });
});

describe("generate-logo-variants.mjs — light theme sizes", () => {
  test.each(SIZES)("writes light-%ipx.png", (size) => {
    const p = resolve(OUT, `light-${size}.png`);
    expect(existsSync(p)).toBe(true);
    expect(statSync(p).size).toBeGreaterThan(100);
  });
});
