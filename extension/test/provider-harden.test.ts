// extension/test/provider-harden.test.ts
import { describe, it, expect } from "@jest/globals";
import { installHardenedProvider, createHandshakeGuard } from "../public/src/lib/provider-harden.js";

function fakeWin() {
  const listeners: Record<string, Function[]> = {};
  return {
    addEventListener(ev: string, fn: Function) { (listeners[ev] ||= []).push(fn); },
    _fire(ev: string) { (listeners[ev] || []).forEach((f) => f()); },
  } as any;
}

describe("installHardenedProvider", () => {
  it("defines the provider as non-writable, non-configurable", () => {
    const win = fakeWin();
    const api = { isCelari: true };
    installHardenedProvider(win, "celari", api);
    const desc = Object.getOwnPropertyDescriptor(win, "celari")!;
    expect(desc.value).toBe(api);
    expect(desc.writable).toBe(false);
    expect(desc.configurable).toBe(false);
    expect(win.celari).toBe(api);
  });

  it("re-asserts the provider on a lifecycle event if it was removed", () => {
    const win = fakeWin();
    const api = { isCelari: true };
    const { reassert } = installHardenedProvider(win, "celari", api);
    expect(typeof reassert).toBe("function");
    win._fire("DOMContentLoaded");
    expect(win.celari).toBe(api);
  });
});

describe("createHandshakeGuard", () => {
  it("flags a second handshake after the first is established", () => {
    const g = createHandshakeGuard();
    expect(g.isSecondHandshake()).toBe(false);
    g.markEstablished();
    expect(g.isSecondHandshake()).toBe(true);
  });
});
