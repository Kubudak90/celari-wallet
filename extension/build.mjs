#!/usr/bin/env node
/**
 * Extension build script using esbuild.
 *
 * Bundles the extension source files from src/ into dist/.
 * In development, source maps are included.
 *
 * Usage:
 *   node extension/build.mjs          # production build
 *   node extension/build.mjs --dev    # development build with sourcemaps
 */

import { build } from "esbuild";
import { cpSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.argv.includes("--dev");

const outdir = resolve(__dirname, "dist");

// Ensure output directory exists
mkdirSync(outdir, { recursive: true });
mkdirSync(resolve(outdir, "src/pages"), { recursive: true });
mkdirSync(resolve(outdir, "styles"), { recursive: true });
mkdirSync(resolve(outdir, "icons"), { recursive: true });

// Bundle JS entry points
const entryPoints = [
  { in: resolve(__dirname, "public/src/background.js"), out: "src/background" },
  { in: resolve(__dirname, "public/src/content.js"), out: "src/content" },
  { in: resolve(__dirname, "public/src/inpage.js"), out: "src/inpage" },
  { in: resolve(__dirname, "public/src/pages/popup.js"), out: "src/pages/popup" },
];

try {
  await build({
    entryPoints: entryPoints.map(e => ({ in: e.in, out: e.out })),
    bundle: false,        // No bundling needed (no imports between files)
    minify: !isDev,
    sourcemap: isDev,
    outdir,
    format: "esm",
    target: ["chrome120"],
    logLevel: "info",
  });

  // Copy static assets
  cpSync(resolve(__dirname, "public/manifest.json"), resolve(outdir, "manifest.json"));
  cpSync(resolve(__dirname, "public/popup.html"), resolve(outdir, "popup.html"));
  cpSync(resolve(__dirname, "public/styles"), resolve(outdir, "styles"), { recursive: true });
  cpSync(resolve(__dirname, "public/icons"), resolve(outdir, "icons"), { recursive: true });

  console.log(`\n✅ Extension built → extension/dist/ (${isDev ? "dev" : "production"})`);
} catch (e) {
  console.error("Build failed:", e.message);
  process.exit(1);
}
