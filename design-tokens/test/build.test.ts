import { describe, test, expect, beforeAll } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const WEBSITE_CSS = resolve(ROOT, "website/src/styles/tokens.css");
const EXTENSION_CSS = resolve(ROOT, "extension/public/styles/tokens.css");

describe("design-tokens/build.mjs — CSS output", () => {
  beforeAll(() => {
    execFileSync("node", ["design-tokens/build.mjs"], { cwd: ROOT, stdio: "inherit" });
  });

  test("writes website tokens.css", () => {
    expect(existsSync(WEBSITE_CSS)).toBe(true);
  });

  test("writes extension tokens.css", () => {
    expect(existsSync(EXTENSION_CSS)).toBe(true);
  });

  test("website css contains dark :root with bg-base and gold-primary", () => {
    const css = readFileSync(WEBSITE_CSS, "utf8");
    expect(css).toMatch(/:root\s*\{[\s\S]*--color-bg-base:\s*#0A0A0B/i);
    expect(css).toMatch(/--color-gold-primary:\s*#D4A853/i);
  });

  test("website css contains light theme override", () => {
    const css = readFileSync(WEBSITE_CSS, "utf8");
    expect(css).toMatch(/\[data-theme="light"\]\s*\{[\s\S]*--color-bg-base:\s*#F7F6F1/i);
  });

  test("website css contains radius, motion, font, shadow tokens", () => {
    const css = readFileSync(WEBSITE_CSS, "utf8");
    expect(css).toMatch(/--radius-card:\s*16px/);
    expect(css).toMatch(/--motion-duration-base:\s*200ms/);
    expect(css).toMatch(/--font-family-wordmark:\s*Outfit/);
    expect(css).toMatch(/--shadow-gold-glow-dark:/);
  });

  test("extension css has identical content to website css", () => {
    const a = readFileSync(WEBSITE_CSS, "utf8");
    const b = readFileSync(EXTENSION_CSS, "utf8");
    expect(a).toEqual(b);
  });
});
