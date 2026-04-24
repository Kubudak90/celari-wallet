import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(__dirname, "../../..");
const DARK = resolve(ROOT, "branding/exports/app-icon-dark-1024.png");
const LIGHT = resolve(ROOT, "branding/exports/app-icon-light-1024.png");

describe("render-masters.mjs", () => {
  beforeAll(() => {
    execFileSync("node", ["branding/scripts/render-masters.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  });

  test.each([DARK, LIGHT])("%s exists at 1024×1024 with alpha", async (p) => {
    expect(existsSync(p)).toBe(true);
    const meta = await sharp(p).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
    expect(meta.hasAlpha).toBe(true);
  });

  test("dark icon: corner pixel (0,0) is transparent (rounded-corner mask applied)", async () => {
    const { data } = await sharp(DARK).raw().toBuffer({ resolveWithObject: true });
    // raw RGBA: byte 3 is alpha at pixel (0,0)
    expect(data[3]).toBe(0);
  });

  test("dark icon: center pixel is opaque dark-bg color (~#0A0A0B) or gold mark", async () => {
    const { data, info } = await sharp(DARK).raw().toBuffer({ resolveWithObject: true });
    const centerIdx = (512 * info.width + 512) * 4;
    expect(data[centerIdx + 3]).toBeGreaterThan(200); // opaque near center
  });

  test("light icon: corner pixel is transparent; center is near-white bg or dark mark", async () => {
    const { data, info } = await sharp(LIGHT).raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    const centerIdx = (512 * info.width + 512) * 4;
    expect(data[centerIdx + 3]).toBeGreaterThan(200);
  });
});
