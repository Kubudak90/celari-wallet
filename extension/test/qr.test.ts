// extension/test/qr.test.ts

import { qrSvg } from "../public/src/lib/qr.js";
import * as qrcodeMod from "qrcode-generator";

const qrcode: any = (qrcodeMod as any).default || (qrcodeMod as any).qrcode || qrcodeMod;

// A realistic Aztec address: "0x" + 64 hex chars = 66 chars.
const ADDR = "0x" + "ab".repeat(32);

function realQr(text: string, ecl = "M") {
  const qr = qrcode(0, ecl);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) dark++;
  return { n, dark };
}

describe("qrSvg (scannable receive QR)", () => {
  it("emits an SVG sized to the module matrix + quiet zone", () => {
    const { n } = realQr(ADDR);
    const svg = qrSvg(ADDR, { margin: 2 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${n + 4} ${n + 4}"`); // margin 2 on each side
    expect(svg).toContain('aria-label="QR code"');
  });

  it("faithfully renders every dark module of the REAL QR (not a decorative hash pattern)", () => {
    const { dark } = realQr(ADDR);
    const svg = qrSvg(ADDR);
    const rects = (svg.match(/<rect /g) || []).length;
    expect(rects).toBe(dark);            // exact 1:1 with the real encoder's matrix
    expect(rects).toBeGreaterThan(100);  // a 66-char QR has hundreds of modules
  });

  it("is deterministic and data-dependent", () => {
    expect(qrSvg(ADDR)).toBe(qrSvg(ADDR));
    expect(qrSvg(ADDR)).not.toBe(qrSvg("0x" + "cd".repeat(32)));
  });

  it("does not throw on empty / nullish input", () => {
    expect(() => qrSvg("")).not.toThrow();
    expect(() => qrSvg(null as unknown as string)).not.toThrow();
  });
});
