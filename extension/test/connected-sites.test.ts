// extension/test/connected-sites.test.ts

import {
  normalizeOrigin,
  isSiteApproved,
  addSite,
  removeSite,
} from "../public/src/lib/connected-sites.js";

describe("connected-sites", () => {
  describe("normalizeOrigin", () => {
    it("reduces a full URL to its origin", () => {
      expect(normalizeOrigin("https://bridge.human.tech/app?x=1")).toBe("https://bridge.human.tech");
      expect(normalizeOrigin("http://localhost:3000/")).toBe("http://localhost:3000");
    });
    it("strips trailing slashes from a bare origin", () => {
      expect(normalizeOrigin("https://example.com/")).toBe("https://example.com");
    });
    it("returns '' for falsy input", () => {
      expect(normalizeOrigin("")).toBe("");
      expect(normalizeOrigin(null as unknown as string)).toBe("");
    });
  });

  describe("isSiteApproved", () => {
    const sites = [{ origin: "https://bridge.human.tech", appId: "bridge" }];
    it("matches a known origin regardless of path", () => {
      expect(isSiteApproved(sites, "https://bridge.human.tech")).toBe(true);
      expect(isSiteApproved(sites, "https://bridge.human.tech/connect")).toBe(true);
    });
    it("does not match an unknown origin", () => {
      expect(isSiteApproved(sites, "https://evil.com")).toBe(false);
    });
    it("is origin-scoped (different port/scheme is a different site)", () => {
      expect(isSiteApproved([{ origin: "http://localhost:3000" }], "http://localhost:3001")).toBe(false);
      expect(isSiteApproved([{ origin: "http://localhost:3000" }], "https://localhost:3000")).toBe(false);
    });
    it("handles empty / non-array input", () => {
      expect(isSiteApproved([], "https://x.com")).toBe(false);
      expect(isSiteApproved(undefined as unknown as [], "https://x.com")).toBe(false);
    });
  });

  describe("addSite", () => {
    it("adds a new origin with metadata", () => {
      const out = addSite([], { origin: "https://bridge.human.tech/app", appId: "bridge" }, 123);
      expect(out).toEqual([{ origin: "https://bridge.human.tech", appId: "bridge", name: "", addedAt: 123 }]);
    });
    it("is idempotent for an already-approved origin", () => {
      const sites = [{ origin: "https://x.com", appId: "", name: "", addedAt: 1 }];
      expect(addSite(sites, { origin: "https://x.com/other" })).toEqual(sites);
    });
    it("does not mutate the input array", () => {
      const sites: any[] = [];
      addSite(sites, { origin: "https://x.com" }, 1);
      expect(sites).toEqual([]);
    });
    it("ignores an entry with no resolvable origin", () => {
      expect(addSite([], { origin: "" })).toEqual([]);
    });
  });

  describe("removeSite", () => {
    it("removes a matching origin (path-insensitive)", () => {
      const sites = [{ origin: "https://a.com" }, { origin: "https://b.com" }];
      expect(removeSite(sites, "https://a.com/x")).toEqual([{ origin: "https://b.com" }]);
    });
    it("returns the list unchanged when origin is absent", () => {
      const sites = [{ origin: "https://a.com" }];
      expect(removeSite(sites, "https://z.com")).toEqual(sites);
    });
  });
});
