// extension/public/src/lib/qr.js
//
// Real, scannable QR-code rendering for receive addresses. Wraps the
// dependency-free `qrcode-generator` library and emits a crisp, resolution-
// independent SVG. Replaces the old decorative `renderSimpleQR`, which drew a
// pseudo-random pattern from a 32-bit hash and was NOT scannable.
//
// Pure (no DOM, no globals) so it can be unit-tested. Bundled into popup.js
// by build.mjs (the popup pass uses bundle:true so this + its dep inline).

import * as qrcodeMod from "qrcode-generator";

// qrcode-generator ships `export default qrcode` (ESM) and `module.exports =
// qrcode` (CJS). Resolve both shapes so this works under esbuild and jest.
const qrcode = qrcodeMod.default || qrcodeMod.qrcode || qrcodeMod;

/**
 * Build an SVG string that encodes `text` as a scannable QR code, drawn in
 * module-coordinate space and scaled to fill its container.
 *
 * @param {string} text - data to encode (e.g. an Aztec address)
 * @param {object} [opts]
 * @param {string} [opts.ecl="M"] - error-correction level: L | M | Q | H
 * @param {string} [opts.dark="#1C1616"] - module color
 * @param {number} [opts.margin=2] - quiet-zone width in modules (QR spec ≥4;
 *   the receive card adds white padding, so 2 here is a safe minimum)
 * @returns {string} SVG markup (width/height 100%, scales to the container)
 */
export function qrSvg(text, opts = {}) {
  const { ecl = "M", dark = "#1C1616", margin = 2 } = opts;
  const qr = qrcode(0, ecl);            // typeNumber 0 = auto-fit smallest version
  qr.addData(String(text ?? ""));
  qr.make();
  const count = qr.getModuleCount();
  const total = count + margin * 2;

  let rects = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        // 1.02 width over-paints by 2% to close hairline gaps between modules
        // when the SVG is scaled to a fractional pixel size.
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1.02" height="1.02" fill="${dark}"/>`;
      }
    }
  }

  return `<svg width="100%" height="100%" viewBox="0 0 ${total} ${total}" `
    + `shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet" `
    + `role="img" aria-label="QR code">${rects}</svg>`;
}
