// extension/test/faucet-cooldown.test.ts

import {
  remainingCooldownMs,
  cooldownMinutes,
  FAUCET_COOLDOWN_MS,
} from "../public/src/lib/faucet-cooldown.js";

describe("faucet-cooldown", () => {
  describe("remainingCooldownMs", () => {
    it("returns 0 when no last-faucet timestamp", () => {
      expect(remainingCooldownMs(0)).toBe(0);
      expect(remainingCooldownMs(null as any)).toBe(0);
      expect(remainingCooldownMs(undefined as any)).toBe(0);
    });

    it("returns 0 when cooldown has expired", () => {
      const now = 1_000_000_000_000;
      const last = now - FAUCET_COOLDOWN_MS - 1000;
      expect(remainingCooldownMs(last, now)).toBe(0);
    });

    it("returns correct remaining ms when active", () => {
      const now = 1_000_000_000_000;
      const last = now - 30 * 60 * 1000; // 30 min ago
      expect(remainingCooldownMs(last, now)).toBe(30 * 60 * 1000);
    });

    it("clamps to 0 right at the boundary", () => {
      const now = 1_000_000_000_000;
      const last = now - FAUCET_COOLDOWN_MS;
      expect(remainingCooldownMs(last, now)).toBe(0);
    });

    it("future timestamps (clock skew) return up to a full cooldown", () => {
      const now = 1_000_000_000_000;
      const last = now + 5 * 60 * 1000; // 5 min in the future
      const out = remainingCooldownMs(last, now);
      expect(out).toBeGreaterThan(FAUCET_COOLDOWN_MS);
    });

    it("custom cooldown duration is honoured", () => {
      const now = 1_000_000_000_000;
      const last = now - 5_000;
      expect(remainingCooldownMs(last, now, 10_000)).toBe(5_000);
    });

    it("FAUCET_COOLDOWN_MS is 1 hour", () => {
      expect(FAUCET_COOLDOWN_MS).toBe(3600 * 1000);
    });
  });

  describe("cooldownMinutes", () => {
    it("rounds up to whole minutes", () => {
      expect(cooldownMinutes(60_000)).toBe(1);
      expect(cooldownMinutes(60_001)).toBe(2);
    });

    it("returns 0 for 0 ms", () => {
      expect(cooldownMinutes(0)).toBe(0);
    });

    it("handles full cooldown duration", () => {
      expect(cooldownMinutes(FAUCET_COOLDOWN_MS)).toBe(60);
    });

    it("handles sub-minute remainders", () => {
      expect(cooldownMinutes(1000)).toBe(1);
      expect(cooldownMinutes(59_000)).toBe(1);
    });
  });
});
