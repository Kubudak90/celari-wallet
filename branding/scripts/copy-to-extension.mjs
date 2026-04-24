// branding/scripts/copy-to-extension.mjs
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const SRC = resolve(ROOT, "branding/exports/extension");
const DEST = resolve(ROOT, "extension/public/icons");

mkdirSync(DEST, { recursive: true });
for (const s of [16, 32, 48, 128]) {
  copyFileSync(resolve(SRC, `icon-${s}.png`), resolve(DEST, `icon-${s}.png`));
}
console.log("copy-to-extension: copied 4 icons to extension/public/icons/");
