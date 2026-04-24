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

const IOS_SWIFT = resolve(ROOT, "ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift");

describe("design-tokens/build.mjs — Swift output", () => {
  test("writes Tokens.swift", () => {
    expect(existsSync(IOS_SWIFT)).toBe(true);
  });

  test("Tokens.swift exposes SwiftUI Color extensions for dark/light", () => {
    const swift = readFileSync(IOS_SWIFT, "utf8");
    expect(swift).toMatch(/import SwiftUI/);
    expect(swift).toMatch(/extension Color\s*\{/);
    expect(swift).toMatch(/static let celariBgBase\s*=\s*Color\(/);
    expect(swift).toMatch(
      /static let celariGoldPrimary\s*=\s*Color\(red:\s*0\.831,\s*green:\s*0\.659,\s*blue:\s*0\.325\)/,
    );
  });

  test("Tokens.swift defines radius + motion constants", () => {
    const swift = readFileSync(IOS_SWIFT, "utf8");
    expect(swift).toMatch(/enum CelariRadius\s*\{[\s\S]*static let card:\s*CGFloat\s*=\s*16/);
    expect(swift).toMatch(/enum CelariMotion\s*\{[\s\S]*static let base:\s*Double\s*=\s*0\.2/);
  });
});

const COLORS_DIR = resolve(ROOT, "ios/CelariWallet/CelariWallet/Assets.xcassets/Colors");

describe("design-tokens/build.mjs — xcassets output", () => {
  test("Colors/ has a Contents.json group manifest", () => {
    const manifest = JSON.parse(readFileSync(resolve(COLORS_DIR, "Contents.json"), "utf8"));
    expect(manifest.info.author).toBe("xcode");
    expect(manifest.properties?.["provides-namespace"]).toBe(true);
  });

  test("BgBase.colorset has universal + dark appearances", () => {
    const p = resolve(COLORS_DIR, "BgBase.colorset/Contents.json");
    const cs = JSON.parse(readFileSync(p, "utf8"));
    expect(cs.colors).toHaveLength(2);
    const hasDark = cs.colors.some(
      (c: any) => c.appearances?.[0]?.appearance === "luminosity" && c.appearances?.[0]?.value === "dark",
    );
    expect(hasDark).toBe(true);
  });

  test("GoldPrimary.colorset is theme-agnostic (single color entry)", () => {
    const p = resolve(COLORS_DIR, "GoldPrimary.colorset/Contents.json");
    const cs = JSON.parse(readFileSync(p, "utf8"));
    expect(cs.colors).toHaveLength(1);
    expect(cs.colors[0].color.components.red).toMatch(/^0\.8[0-9]+$/);
  });
});

const PREVIEW = resolve(ROOT, "branding/exports/tokens-preview.html");

describe("design-tokens/build.mjs — preview output", () => {
  test("writes tokens-preview.html with swatches and type specimen", () => {
    const html = readFileSync(PREVIEW, "utf8");
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toMatch(/bg-base/);
    expect(html).toMatch(/gold-primary/);
    expect(html).toMatch(/Outfit/);
    expect(html).toMatch(/Inter/);
    expect(html).toMatch(/class="theme-dark"/);
    expect(html).toMatch(/class="theme-light"/);
  });
});
