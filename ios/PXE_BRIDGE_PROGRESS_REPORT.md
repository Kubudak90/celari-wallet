# PXE Bridge iOS - Progress Report
**Date:** 2026-02-21
**Project:** Celari Wallet iOS - Aztec PXE Engine Integration

---

## Summary

The Aztec PXE (Private Execution Environment) engine, originally built as a Chrome Extension (`offscreen.js`), is being ported to run inside iOS WKWebView. This report covers the multi-session work to get the PXE engine loading, connecting, and initializing on the iOS simulator.

---

## Completed Work

### 1. PXEBridge.swift - WKWebView Bridge (Done)
- Created Swift ↔ JS communication bridge using `WKScriptMessageHandler`
- JS console capture (`console.log/warn/error`) forwarded to `os.log` via `jsConsole` message handler
- `sendMessage()` with 300s timeout and pending callback dictionary
- `initPXE(nodeUrl:)` sends `PXE_INIT` message to JS after WebView loads
- Scripts injected in order: console capture → Chrome API shim → Buffer polyfill

### 2. pxe-bridge-shim.js - Chrome API Shim (Done)
- **Node.js globals**: `process` and `global` polyfills (prevents `ReferenceError: Can't find variable: process`)
- **fetch() polyfill**: WKWebView's native `fetch()` doesn't work with `file://` URLs; override uses `XMLHttpRequest` which does work
- **Worker polyfill**: WKWebView doesn't support Web Workers; no-op shim logs attempts and fires error events
- **chrome.runtime shim**: `onMessage.addListener()`, `sendMessage()` — routes messages between Swift and JS
- **chrome.storage shim**: localStorage-backed implementation of `chrome.storage.local`
- **Bridge (Swift → JS)**: `_receiveFromSwift()` function called from Swift's `evaluateJavaScript()`

### 3. buffer-polyfill.js (Done)
- Built from `feross/buffer` v6.0.3 as IIFE (27KB)
- Fixes `ReferenceError: Can't find variable: Buffer` and `TypeError: undefined is not an object (evaluating 'PQ.prototype.utf8Write')`

### 4. pxe-bridge.html (Done)
- Loads scripts in correct order: shim → buffer → offscreen.js
- Error handlers: `window.onerror` and `unhandledrejection` forwarded to Swift
- Diagnostic status checks at 5s, 15s, 60s intervals

### 5. offscreen.js IIFE Bundle (Done)
- **Discovery**: `extension/build.mjs` has a dedicated iOS build pass (Pass 3) triggered with `--ios` flag
- **Build command**: `node extension/build.mjs --ios`
- **Key settings**:
  - `format: "iife"` — no ESM/import.meta needed
  - `".wasm": "dataurl"` — WASM inlined as base64 data URLs (no file:// fetch needed)
  - `target: ["safari17"]`
  - All dynamic `import()` calls inlined (SponsoredFPC, Token, NFT, WalletConnect)
  - Node.js module aliases (crypto, fs, net, etc.) → browser shims
- **Result**: 71,857,735 bytes (~72MB) IIFE bundle
- **Verified**: Zero `import.meta` references, zero `import()` calls

### 6. WalletStore.swift Integration (Done)
- `initialize()` calls `pxeBridge.setupWebView()` then polls for readiness
- Calls `initPXE(nodeUrl:)` after WebView is ready
- `createPasskeyAccount()` uses native CryptoKit P-256 keys (no WebAuthn dependency on simulator)

### 7. Native Passkey Account Creation (Done - Previous Session)
- Simulator doesn't support WebAuthn/passkeys
- Implemented native P-256 key generation using CryptoKit
- Account creation works on simulator without passkey dependency

---

## Current Status: PXE Init Stall (Partially Fixed)

### Problem Identified
After connecting to Aztec devnet, PXE initialization stalls at `setupSponsoredFPC()`:

```
[PXE] Connected — Chain 0x...aa36a7, Protocol v0x...62363939
[pxe-bridge.html] Status@10100ms: _messageHandlers=0    ← stalled here
[pxe-bridge.html] Status@30100ms: _messageHandlers=0    ← still stalled
```

### Root Cause Found
The offscreen.js was built with **ESM format** (Pass 2 in build.mjs), which uses:
```javascript
const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
```
Dynamic `import()` calls **hang forever** in WKWebView when loaded via `<script>` tag (not `type="module"`). They never resolve or reject.

### Fix Applied
Rebuilt offscreen.js using **Pass 3 (iOS IIFE format)** which inlines all dynamic imports:
```bash
node extension/build.mjs --ios
```
All 7 dynamic import() calls are now statically bundled into the IIFE.

### Current Blocker: Zero Logs After IIFE Rebuild
After rebuilding with the IIFE bundle and reinstalling on the simulator:
- Xcode build succeeds
- App launches (process alive, ~70MB memory)
- **Zero logs appear** for 120+ seconds
- No crash, no errors, just silence

**Possible causes:**
1. The 72MB IIFE bundle may be too large for WKWebView to parse (WebKit content process OOM/crash)
2. The app may need a clean kill/reinstall cycle (stale state)
3. The app takes a different code path (has saved accounts → dashboard instead of onboarding)

**Was about to test**: Kill app → fresh install → relaunch → monitor logs

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  WalletStore.swift                          │
│  (Main state management)                     │
│    ↓ initPXE(nodeUrl:)                      │
├─────────────────────────────────────────────┤
│  PXEBridge.swift                            │
│  (WKWebView bridge)                          │
│    ↕ evaluateJavaScript / WKScriptMessage   │
├─────────────────────────────────────────────┤
│  WKWebView                                   │
│  ┌─────────────────────────────────────────┐│
│  │ pxe-bridge.html                         ││
│  │   → pxe-bridge-shim.js (injected)      ││
│  │   → buffer-polyfill.js (injected)       ││
│  │   → offscreen.js (IIFE, 72MB)          ││
│  │                                          ││
│  │ chrome.runtime.onMessage ← Swift msgs   ││
│  │ chrome.runtime.sendMessage → Swift       ││
│  └─────────────────────────────────────────┘│
├─────────────────────────────────────────────┤
│  Aztec Devnet (devnet-6.aztec-labs.com)     │
└─────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `ios/CelariWallet/.../Core/PXEBridge.swift` | WKWebView bridge (338 lines) |
| `ios/CelariWallet/.../Core/WalletStore.swift` | Wallet state management (468 lines) |
| `ios/CelariWallet/.../Resources/pxe-bridge.html` | HTML container for PXE engine |
| `ios/CelariWallet/.../Resources/pxe-bridge-shim.js` | Chrome API shim + polyfills (230 lines) |
| `ios/CelariWallet/.../Resources/buffer-polyfill.js` | Buffer polyfill (27KB) |
| `ios/CelariWallet/.../Resources/offscreen.js` | Aztec PXE engine IIFE bundle (72MB) |
| `extension/build.mjs` | Build script with iOS Pass 3 |
| `extension/public/src/offscreen.js` | PXE engine source (919 lines) |

---

## Errors Fixed (Chronological)

| # | Error | Fix |
|---|-------|-----|
| 1 | Main Thread Checker violation | Moved UI operations to main queue |
| 2 | Passkey creation hanging on simulator | Native CryptoKit P-256 key generation |
| 3 | offscreen.js not bundled | Copied to Resources, added to Xcode target |
| 4 | `ReferenceError: process` | process polyfill in pxe-bridge-shim.js |
| 5 | `TypeError: PQ.prototype.utf8Write` | Buffer polyfill from feross/buffer |
| 6 | `ReferenceError: Buffer` | Same Buffer polyfill (IIFE, loaded early) |
| 7 | `SyntaxError: import.meta` | Rebuilt with IIFE format (no import.meta) |
| 8 | fetch() fails on file:// URLs | XMLHttpRequest fallback polyfill |
| 9 | Worker not defined | No-op Worker polyfill |
| 10 | PXE init stalls at setupSponsoredFPC | IIFE bundle inlines all dynamic imports |

---

## Next Steps (When Resuming)

1. **Test IIFE bundle loading**: Kill app → fresh install → relaunch → monitor logs
2. **If zero logs persist**: The 72MB bundle may be too large for WKWebView
   - Add `print()` at start of `initialize()` in WalletStore.swift to verify Swift runs
   - Check WebKit content process for OOM/crash
   - Consider bundle size reduction (tree-shaking, lazy loading)
3. **If PXE loads successfully**: Verify `setupSponsoredFPC` completes (was the stall point)
4. **Test account deploy** on devnet
5. **Test transfer functionality**

---

## Debug Commands

```bash
# Monitor app logs
/usr/bin/log stream --predicate 'subsystem == "com.celari.wallet"' --style compact --timeout 120

# Kill app
xcrun simctl terminate 749C1E2D-8B5A-4C9C-90BC-B971F1A04928 com.celari.wallet

# Install fresh build
xcrun simctl install 749C1E2D-8B5A-4C9C-90BC-B971F1A04928 /tmp/xcodebuild/Build/Products/Debug-iphonesimulator/CelariWallet.app

# Launch app
xcrun simctl launch 749C1E2D-8B5A-4C9C-90BC-B971F1A04928 com.celari.wallet

# Rebuild IIFE bundle
cd /Volumes/huseyin/celari-wallet-main && node extension/build.mjs --ios

# Rebuild Xcode project
xcodebuild -project ios/CelariWallet/CelariWallet.xcodeproj -scheme CelariWallet -sdk iphonesimulator -destination 'id=749C1E2D-8B5A-4C9C-90BC-B971F1A04928' -derivedDataPath /tmp/xcodebuild build 2>&1 | tail -5

# Verify bundle format
head -c 100 ios/CelariWallet/CelariWallet/Resources/offscreen.js
```
