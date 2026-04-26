# Extension Test Infrastructure — Design

**Date:** 2026-04-25
**Status:** Approved (concise spec; user authorized "sıralı yap, devam et")
**Scope:** Chrome extension only (popup.js, background.js, content.js, lib/)

---

## Goal

Add a unit-test layer for the Chrome extension that catches regressions in the security-critical paths (passkey-derived encryption, lock/unlock state, RPC error sanitization, schema validation, faucet cooldown) **without** requiring a headless browser harness.

We are NOT trying to test the entire popup.js (3000+ LOC of DOM + chrome API + global state). The strategy is: **extract pure helpers into `extension/public/src/lib/` modules and unit-test those.**

## Strategy

1. **Test pure modules end-to-end.** `passkey-crypto.js` already lives at `extension/public/src/lib/`. Test it exhaustively — round-trips, edge cases, schema rejection.
2. **Extract more pure helpers as we add tests.** Move `sanitizeRpcError` from background.js to `lib/sanitize.js` (pure function, exported). Move the schema validator from popup.js to `lib/account-schema.js`. Move the faucet cooldown math to `lib/faucet-cooldown.js`. Each extraction is paired with a test file that proves the move didn't change behavior.
3. **Mock `chrome.*` and `navigator.credentials` minimally.** Use `jest.setup.js` to stub the few APIs the lib modules touch (`chrome.runtime.sendMessage`, `crypto.subtle`, `navigator.credentials.get`). For `passkey-crypto.js` specifically, we replace `evalPrf` in tests with a deterministic mock that returns a known PRF output — this lets us assert the AES-GCM wrap/unwrap behavior without an actual passkey.

## Non-goals

- DOM testing of popup.js render/bind functions. Too entangled; not worth the mock surface.
- E2E browser tests via Puppeteer / Playwright. Requires loading the entire 65MB offscreen bundle in a test browser — overkill for this pass.
- Background.js full integration tests. Same reasons.
- Test coverage targets. We aim for **meaningful** coverage of security-critical code, not a number.

## Tech stack

- Jest 29 (already installed) + ts-jest + ESM mode
- `jest.config.ts` already supports `**/test/**/*.test.ts` and `**/__tests__/**/*.test.ts`
- Add a new pattern: `extension/test/**/*.test.ts` so the test runner picks up extension tests
- Node 20+ has WebCrypto (`crypto.subtle`) natively — no polyfill needed for crypto round-trips
- For `chrome.*` mocks, use `jest-chrome` package OR a hand-rolled stub — start with hand-rolled (simpler, fewer deps)

## Acceptance criteria

1. `npm test` runs successfully and includes the new extension tests
2. `passkey-crypto.js` has unit tests covering: KEK derivation determinism, AES-GCM round-trip, schema rejection on tampered ciphertext, base64 codec round-trip, prfSalt randomness (no two calls return the same value)
3. `sanitize.js` has unit tests for URL/IP/file-path/node-banner stripping, length truncation, non-string input handling
4. `account-schema.js` has unit tests for: passkey account requires encrypted fields, demo accounts skip encryption check, legacy plaintext detection
5. `faucet-cooldown.js` has unit tests for: cooldown calculation, expired vs active states, 0/negative/missing timestamps
6. Each extracted helper is a drop-in replacement; the extension still builds clean (`node extension/build.mjs`) and behaves identically

## File touches

- New: `extension/public/src/lib/sanitize.js` (extracted from background.js)
- New: `extension/public/src/lib/account-schema.js` (extracted from popup.js init)
- New: `extension/public/src/lib/faucet-cooldown.js` (extracted from popup.js helpers)
- New: `extension/test/passkey-crypto.test.ts`
- New: `extension/test/sanitize.test.ts`
- New: `extension/test/account-schema.test.ts`
- New: `extension/test/faucet-cooldown.test.ts`
- New: `extension/test/setup.ts` (chrome mock + WebAuthn stub)
- Modify: `jest.config.ts` (add `extension/test/**` to testMatch, add `extension/test/setup.ts` to setupFiles)
- Modify: `extension/public/src/background.js` (replace inline `sanitizeRpcError` with import from lib)
- Modify: `extension/public/src/pages/popup.js` (replace inline schema validator + faucet cooldown helper with imports)

## Risks

- **Extraction may break popup.js.** Mitigation: each extraction commit pairs with a build run + manual smoke test. Tests serve as the safety net for the next refactor.
- **ESM import chains in jest.** ts-jest's ESM mode is already configured. New `.js` modules in `extension/public/src/lib/` use ESM exports; jest's `transformIgnorePatterns` already accommodates that.
- **`crypto.subtle` differences between Node and browsers.** Node 20+ ships a Web-Crypto-compatible `crypto.webcrypto.subtle`. Tests will use `globalThis.crypto = require('crypto').webcrypto` in setup if needed.

## Out of scope (deferred)

- Test coverage numerical targets (track when codebase stabilizes)
- E2E browser harness (Puppeteer/Playwright) — separate plan if/when needed
- iOS test infrastructure (separate concern)
