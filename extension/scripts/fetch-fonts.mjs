// extension/scripts/fetch-fonts.mjs
// Downloads the Aztec UI woff2 faces from the Google Fonts CSS2 API into
// extension/public/fonts/. Run once: `node extension/scripts/fetch-fonts.mjs`.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/fonts");
mkdirSync(OUT, { recursive: true });

// A modern-browser UA forces the API to return woff2 URLs.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// family spec -> output basename. We fetch one CSS per (family,weight,style)
// so each returns exactly one woff2 we can name deterministically.
const FACES = [
  ["Geist:wght@400", "geist-400"],
  ["Geist:wght@500", "geist-500"],
  ["Geist:wght@600", "geist-600"],
  ["Geist+Mono:wght@400", "geist-mono-400"],
  ["Geist+Mono:wght@500", "geist-mono-500"],
  ["EB+Garamond:wght@400", "ebgaramond-400"],
  ["EB+Garamond:wght@500", "ebgaramond-500"],
  ["EB+Garamond:wght@600", "ebgaramond-600"],
  ["EB+Garamond:ital,wght@1,400", "ebgaramond-400-italic"],
  ["Martel:wght@300", "martel-300"],
  ["Martel:wght@600", "martel-600"],
];

for (const [spec, base] of FACES) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  const css = await fetch(cssUrl, { headers: { "User-Agent": UA } }).then((r) => r.text());

  // Parse ALL @font-face blocks and select the latin subset (U+0000-00FF).
  // Fall back to the first block's URL if no latin block is found.
  const blocks = css.split("@font-face").slice(1);
  let chosen = null;
  let chosenRange = null;
  for (const b of blocks) {
    const u = b.match(/url\((https:\/\/[^)]+\.woff2)\)/);
    if (!u) continue;
    const ur = b.match(/unicode-range:\s*([^;]+);/);
    if (ur && /U\+0000-00FF/.test(ur[1])) {
      chosen = u[1];
      chosenRange = ur[1].trim();
      break; // latin subset found
    }
    if (!chosen) {
      chosen = u[1];
      chosenRange = ur ? ur[1].trim() : "(no unicode-range)";
    }
  }
  if (!chosen) {
    console.error(`No woff2 for ${spec}\n${css.slice(0, 300)}`);
    process.exit(1);
  }

  const buf = Buffer.from(await fetch(chosen).then((r) => r.arrayBuffer()));
  writeFileSync(resolve(OUT, `${base}.woff2`), buf);
  console.log(`✓ ${base}.woff2  (${buf.length} bytes)  unicode-range: ${chosenRange}`);
}
console.log("Done. Fonts written to extension/public/fonts/");
