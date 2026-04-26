// extension/public/src/lib/sanitize.js
//
// Strips URL/IP/file-path/node-version-banner leaks from error messages
// before they leave the service worker (toast / dApp response).

export function sanitizeRpcError(err) {
  let msg;
  if (err && typeof err.message === "string") msg = err.message;
  else if (typeof err === "string") msg = err;
  else if (err == null) msg = "";
  else { try { msg = JSON.stringify(err); } catch { msg = String(err); } }
  const stackIdx = msg.indexOf("\n    at ");
  if (stackIdx > -1) msg = msg.slice(0, stackIdx);
  let clean = msg
    .replace(/https?:\/\/[^\s)]+/g, "<url>")
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "<ip>")
    .replace(/\/[A-Za-z0-9_\-./]+\.(js|ts|wasm|json)/g, "<file>")
    .replace(/aztec[_-]?node[_-]?version[: ]+[^\s,)]+/gi, "<node>");
  if (clean.length > 240) clean = clean.slice(0, 240) + "...";
  return clean;
}
