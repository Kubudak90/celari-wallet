// Minimal static server for the extension E2E harness. Serves the extension/
// directory so the harness page loads on a real http origin (IndexedDB is
// restricted on file://) with correct ES-module MIME types.
//
//   node extension/test/e2e/serve.mjs [port]
// then open  http://localhost:<port>/test/e2e/signing-key-store.e2e.html
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", ".."); // -> extension/
const PORT = parseInt(process.argv[2] || "4599");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(ROOT, rel);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`E2E server: http://localhost:${PORT}/test/e2e/signing-key-store.e2e.html`);
});
