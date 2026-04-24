import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(__dirname, "../../..");
const OUT = resolve(ROOT, "branding/exports/og-dark.png");

describe("generate-og.mjs", () => {
  beforeAll(() => {
    execFileSync("node", ["branding/scripts/generate-og.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test("writes og-dark.png at 1200x630", async () => {
    expect(existsSync(OUT)).toBe(true);
    const meta = await sharp(OUT).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });
});
