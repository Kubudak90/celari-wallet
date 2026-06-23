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
      expect(out).toEqual([{ origin: "https://bridge.human.tech", account: "", appId: "bridge", name: "", addedAt: 123 }]);
    });
    it("records (lowercased) the approving account", () => {
      const out = addSite([], { origin: "https://x.com", account: "0xABCdef" }, 1);
      expect(out[0].account).toBe("0xabcdef");
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

  describe("account scoping (rotation safety)", () => {
    const sites = [{ origin: "https://dapp.io", account: "0xaaa", appId: "", name: "", addedAt: 1 }];

    it("auto-approves only under the account that granted it", () => {
      expect(isSiteApproved(sites, "https://dapp.io", "0xAAA")).toBe(true);   // same account (case-insensitive)
      expect(isSiteApproved(sites, "https://dapp.io", "0xbbb")).toBe(false);  // rotated account → re-approve
    });

    it("matches origin-only when no account is supplied", () => {
      expect(isSiteApproved(sites, "https://dapp.io")).toBe(true);
    });

    it("treats legacy (account-less) entries as not approved for a specific account", () => {
      const legacy = [{ origin: "https://dapp.io" }];
      expect(isSiteApproved(legacy, "https://dapp.io", "0xaaa")).toBe(false); // forces one-time re-approval
      expect(isSiteApproved(legacy, "https://dapp.io")).toBe(true);            // but still origin-matches account-agnostically
    });

    it("addSite records the same origin under different accounts as distinct grants", () => {
      let list = addSite([], { origin: "https://dapp.io", account: "0xaaa" }, 1);
      list = addSite(list, { origin: "https://dapp.io", account: "0xaaa" }, 2); // idempotent for same (origin,account)
      expect(list).toHaveLength(1);
      list = addSite(list, { origin: "https://dapp.io", account: "0xbbb" }, 3); // different account → new grant
      expect(list).toHaveLength(2);
      expect(list.map((s) => s.account).sort()).toEqual(["0xaaa", "0xbbb"]);
    });
  });
});
