# Extension Pre-Ship Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the security, UX, and code-hygiene gaps surfaced by the 2026-04-25 audit so the Chrome extension can ship to public testers.

**Architecture:** All changes are local edits to `extension/public/src/` (popup.js, background.js, content.js, manifest.json) plus targeted asset cleanup. No new files, no new dependencies. Build via existing `node extension/build.mjs`.

**Tech Stack:** Chrome MV3, vanilla JS (popup.js + service worker), `chrome.storage.local` for persistence, `chrome.notifications` for OS alerts, `navigator.credentials` (WebAuthn) for passkey unlock.

**Out of scope (deliberately deferred):**
- Passkey-derived encryption of secret keys at rest — design needs its own spec; tracked for Phase 5 security hardening
- Test infrastructure for the extension — separate quality plan
- WalletConnect v2 integration — Phase 3 work

---

## Task 1: Persist lock state across popup reopens

**Why:** `store.locked` lives only in memory. Closing the popup and reopening it triggers `init()` which currently locks based on whether a passkey account exists, but does NOT carry forward an explicit "user locked manually" state. Worse, if init's auto-lock logic ever changes, the lock can be bypassed by close/reopen.

**Files:**
- Modify: `extension/public/src/pages/popup.js` (lock helpers + init)

- [ ] **Step 1: Persist lock-flag on lock**

In `lockExtension()` at `popup.js:133`, after setting `store.locked = true`, add:

```javascript
function lockExtension({ reason } = {}) {
  store.locked = true;
  store.unlockError = null;
  store.unlocking = false;
  if (store.sendForm) store.sendForm = { to: "", amount: "", token: "zkUSD" };
  // Persist so close/reopen remembers the lock
  try { chrome.storage.local.set({ celari_locked: true }); } catch (e) {}
  setState({ screen: "locked" });
  if (reason === "idle") {
    showToast?.("Locked due to inactivity", "info");
  }
}
```

- [ ] **Step 2: Clear lock-flag on successful unlock**

In `unlockExtension()` after the WebAuthn assertion succeeds (`popup.js:178`), add the storage clear:

```javascript
    if (!assertion) throw new Error("Passkey verification cancelled");
    store.locked = false;
    store.unlockError = null;
    store.unlocking = false;
    try { chrome.storage.local.set({ celari_locked: false }); } catch (e) {}
    bumpInteraction();
    setState({ screen: "dashboard" });
```

Also clear in the two non-passkey early-returns of `unlockExtension` (no-account → `popup.js:149-151` and demo → `popup.js:155-157`):

```javascript
  if (!account) {
    store.locked = false;
    try { chrome.storage.local.set({ celari_locked: false }); } catch (e) {}
    setState({ screen: "onboarding" });
    return;
  }
  if (account.type !== "passkey" || !account.credentialId) {
    store.locked = false;
    try { chrome.storage.local.set({ celari_locked: false }); } catch (e) {}
    bumpInteraction();
    setState({ screen: "dashboard" });
    return;
  }
```

- [ ] **Step 3: Honor persisted lock in init()**

Replace the existing default-lock block at `popup.js:402-415`:

```javascript
  // Default-locked when a passkey account exists, OR when we explicitly
  // persisted a lock from a prior session. Demo-only accounts (no passkey)
  // skip the lock since they have nothing to protect.
  let persistedLock = false;
  try {
    const r = await chrome.storage.local.get("celari_locked");
    persistedLock = r?.celari_locked === true;
  } catch (e) {}

  if (store.accounts.length > 0) {
    if (hasPasskeyAccount() && (persistedLock || true)) {
      store.locked = true;
      store.screen = "locked";
    } else {
      store.locked = false;
      store.screen = "dashboard";
    }
  } else {
    store.locked = false;
    store.screen = "onboarding";
    try { chrome.storage.local.set({ celari_locked: false }); } catch (e) {}
  }
```

(The `(persistedLock || true)` keeps current behavior: passkey accounts always land on lock screen on open. The persisted flag becomes load-bearing only if/when we relax that to "default-unlocked, lock manually".)

- [ ] **Step 4: Manual smoke test**

1. Build: `node extension/build.mjs`
2. Reload the extension in `chrome://extensions`
3. Open the popup; tap "Lock now" in Settings
4. Close popup, reopen → expect locked screen
5. Unlock with passkey → close popup, reopen → expect locked screen (auto-lock on open is preserved)

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "fix(extension): persist lock state in chrome.storage.local"
```

---

## Task 2: Offscreen init retry + visible failure UX

**Why:** `ensureOffscreen()` waits up to 30s for the 65MB offscreen bundle to load. On slow networks the timeout fires silently with a console warning, then PXE calls fail downstream with cryptic "message port closed" errors. Users see nothing.

**Files:**
- Modify: `extension/public/src/background.js` (ensureOffscreen, waitForOffscreenListener)
- Modify: `extension/public/src/pages/popup.js` (surface init errors as toast + retry button)

- [ ] **Step 1: Track offscreen load failures**

In `background.js`, replace `ensureOffscreen()` at `background.js:342-372` with a version that retries up to 3 times and exposes a final failure:

```javascript
let offscreenInitError = null;

async function ensureOffscreen() {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    if (contexts.length > 0) {
      offscreenReady = true;
      if (!offscreenListenerReady) {
        await waitForOffscreenListener(10000);
      }
      if (offscreenListenerReady) {
        offscreenInitError = null;
        return;
      }
    }
    // Document doesn't exist (or stalled) — recreate up to 3x
    for (let attempt = 1; attempt <= 3; attempt++) {
      offscreenReady = false;
      offscreenListenerReady = false;
      try {
        // Close any stale doc before recreating
        const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
        if (existing.length > 0) {
          try { await chrome.offscreen.closeDocument(); } catch (e) {}
        }
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["WORKERS"],
          justification: "Aztec PXE WASM proving engine for zero-knowledge proofs",
        });
        offscreenReady = true;
        console.log(`Offscreen attempt ${attempt}: created — waiting for listener...`);
        await waitForOffscreenListener(45000);
        if (offscreenListenerReady) {
          offscreenInitError = null;
          return;
        }
        console.warn(`Offscreen attempt ${attempt}: listener never registered`);
      } catch (e) {
        console.error(`Offscreen attempt ${attempt} failed:`, e?.message || e);
      }
    }
    offscreenInitError = "Offscreen engine failed to load after 3 attempts";
  } catch (e) {
    offscreenInitError = e?.message || "Offscreen creation failed";
    offscreenReady = false;
  }
}
```

- [ ] **Step 2: Expose error to popup via GET_STATE**

At `background.js:577` (`case "GET_STATE":`) extend the response:

```javascript
    case "GET_STATE":
      sendResponse({
        success: true,
        state: { ...state, offscreenInitError },
      });
      break;
```

- [ ] **Step 3: Surface error in popup**

In `popup.js init()` after the `GET_STATE` reply at `popup.js:346-353`, capture and toast:

```javascript
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    if (response?.success) {
      store.connected = response.state.connected;
      store.network = response.state.network;
      store.nodeUrl = response.state.nodeUrl;
      store.nodeInfo = response.state.nodeInfo;
      store.accounts = response.state.accounts || [];
      if (response.state.offscreenInitError) {
        // Defer until first render so showToast is wired
        setTimeout(() => {
          showToast?.(`Engine load failed: ${response.state.offscreenInitError}. Reload the extension to retry.`, "error", 8000);
        }, 200);
      }
    }
```

- [ ] **Step 4: Manual smoke test**

1. Build + reload extension
2. Open popup with normal connection → no error toast, dashboard renders
3. Throttle network to "Slow 3G" in DevTools, reload extension, open popup → expect 3 retry attempts in service-worker console; if all fail, error toast appears

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/background.js extension/public/src/pages/popup.js
git commit -m "fix(extension): retry offscreen init 3x and surface failures to UI"
```

---

## Task 3: Origin validation on legacy dApp messages

**Why:** `content.js:202-223` (`handleLegacyMessage`) accepts any `event.data.target === "celari-content"` without verifying `event.origin`. A malicious cross-origin iframe can spoof messages to the dApp's main frame and trigger background calls.

**Files:**
- Modify: `extension/public/src/content.js`

- [ ] **Step 1: Add origin guard**

In `content.js:202` modify `handleLegacyMessage` to short-circuit when origin doesn't match the page's own origin:

```javascript
function handleLegacyMessage(event) {
  if (event.data?.target !== "celari-content") return;
  // Only accept messages from the page's own origin — rejects cross-origin
  // iframes attempting to spoof a connection.
  if (event.origin !== window.location.origin) return;

  const ALLOWED_DAPP_TYPES = [
    ...
```

- [ ] **Step 2: Manual smoke test**

1. Build + reload
2. On any dApp using the celari provider (e.g. demo dapp), connect → expect normal flow
3. In DevTools Console of the dApp page, run `window.postMessage({ target: "celari-content", type: "DAPP_CONNECT", payload: {}, requestId: "x" }, "*")` from a different origin frame → expect no response (silently dropped)

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/content.js
git commit -m "fix(extension): require event.origin === window.origin for dApp messages"
```

---

## Task 4: Manifest externally_connectable hardening

**Why:** Without `externally_connectable`, any web page can call `chrome.runtime.sendMessage(EXTENSION_ID, …)` directly to background. Currently the legacy + WS handlers don't strictly verify the sender, so this is a soft attack surface.

**Files:**
- Modify: `extension/public/manifest.json`
- Modify: `extension/public/src/background.js` (sender origin check)

- [ ] **Step 1: Restrict externally_connectable**

In `manifest.json`, add at the top level:

```json
"externally_connectable": {
  "matches": []
},
```

Empty list = no external page may direct-message the extension. All dApp traffic must go through the content script (which CAN'T be impersonated by a regular web page).

- [ ] **Step 2: Sender check in onMessage**

At the top of `background.js` `chrome.runtime.onMessage.addListener` (find via grep `onMessage.addListener` in background.js), add at the start of the listener:

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Reject messages from external pages (defence in depth — externally_connectable
  // is also locked to []). Only accept from our own popup / offscreen / content scripts.
  if (sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: "Unauthorized sender" });
    return;
  }
  // ... existing handlers
```

- [ ] **Step 3: Manual smoke test**

1. Build + reload
2. Popup, offscreen messages, content-script faucet flow → all work as before
3. From a random web page console: `chrome.runtime.sendMessage(EXTENSION_ID, { type: "GET_STATE" })` → expect rejection or no response

- [ ] **Step 4: Commit**

```bash
git add extension/public/manifest.json extension/public/src/background.js
git commit -m "fix(extension): lock externally_connectable + verify sender in background"
```

---

## Task 5: Idle timer reliability — global activity listeners

**Why:** `bumpInteraction()` only fires from `setState()` (`popup.js:227-239`). Modal opens, form-field typing, scroll — none of these trigger `setState`, so the 5-minute idle lock can fire while the user is actively typing.

**Files:**
- Modify: `extension/public/src/pages/popup.js`

- [ ] **Step 1: Add document-level activity listeners**

After the `startLockIdleTimer` function definition at `popup.js:120`, register listeners at module load:

```javascript
// Module-load: any user input bumps the interaction clock so the idle lock
// only fires after true inactivity, not just absence of state transitions.
if (typeof document !== "undefined") {
  const activityEvents = ["pointerdown", "keydown", "wheel", "touchstart", "input"];
  for (const evt of activityEvents) {
    document.addEventListener(evt, bumpInteraction, { passive: true, capture: true });
  }
}
```

- [ ] **Step 2: Manual smoke test**

1. Build + reload, open popup
2. Open Settings, type continuously into a custom-token form for >5 minutes (or temporarily set `LOCK_IDLE_MS = 30 * 1000` for the test)
3. With the new listeners: popup stays unlocked while typing
4. Stop typing → after `LOCK_IDLE_MS` of true silence, popup locks

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "fix(extension): register global activity listeners for idle-lock timer"
```

---

## Task 6: Render error boundary

**Why:** The `render()` switch on `store.screen` (around `popup.js:621-702`) is a sequence of plain function calls. If any render function throws (bad data shape, missing field), the popup goes blank with no recovery.

**Files:**
- Modify: `extension/public/src/pages/popup.js`

- [ ] **Step 1: Wrap render dispatch in try/catch**

Find the `render()` function (search for `function render()` in popup.js). Wrap the body's screen-dispatch in a try/catch that swaps to an error screen on throw:

```javascript
function render() {
  try {
    // ... existing render dispatch ...
  } catch (err) {
    console.error("[Celari popup] render crash:", err);
    const root = document.getElementById("app") || document.body;
    root.replaceChildren();
    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:24px;text-align:center;color:var(--text-warm);";
    wrap.insertAdjacentHTML("afterbegin", `
      <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
      <h2 style="font-family:var(--font-display);font-size:18px;margin-bottom:8px;">Something went wrong</h2>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">
        ${(err?.message || "Render error").replace(/[<>&"]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]))}
      </p>
      <button id="celari-retry" style="background:var(--gold-primary);color:#0A0A0B;padding:10px 20px;border:0;border-radius:8px;cursor:pointer;font-weight:600;">Reload Popup</button>
    `);
    root.appendChild(wrap);
    document.getElementById("celari-retry")?.addEventListener("click", () => {
      window.location.reload();
    });
  }
}
```

(The exact `find→wrap` placement: the existing function body becomes the contents of the `try` block.)

- [ ] **Step 2: Manual smoke test**

1. Build + reload
2. Temporarily inject a throw in one render branch (e.g. `function renderDashboard() { throw new Error("boom"); ... }`) and reload
3. Expect the error UI with Reload button instead of blank popup
4. Revert the test throw

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "fix(extension): error boundary in render() to recover from crashes"
```

---

## Task 7: Sanitize RPC errors before surfacing

**Why:** `background.js` currently passes raw RPC error messages back to the popup. These can include node URLs, version banners, stack traces. Leaks through `showToast` to dApps via the wallet-sdk forwarding path.

**Files:**
- Modify: `extension/public/src/background.js` (introduce `sanitizeRpcError`)

- [ ] **Step 1: Add sanitizer helper**

At the top of `background.js` (after the imports / state declarations, near `let offscreenInitError`):

```javascript
function sanitizeRpcError(err) {
  const msg = err?.message || String(err || "");
  // Strip URLs, IPs, file paths, and common RPC node-version banners
  let clean = msg
    .replace(/https?:\/\/[^\s)]+/g, "<url>")
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "<ip>")
    .replace(/\/[A-Za-z0-9_\-./]+\.(js|ts|wasm|json)/g, "<file>")
    .replace(/aztec[_-]?node[_-]?version[: ]+[^\s,)]+/gi, "<node>");
  if (clean.length > 240) clean = clean.slice(0, 240) + "…";
  return clean;
}
```

- [ ] **Step 2: Apply sanitizer to outbound RPC errors**

In every spot that returns an error to the popup or dApp, replace `error: e.message` with `error: sanitizeRpcError(e)`. Specifically search-and-replace pattern in `background.js`:

- Find: `error: error.message`
  Replace: `error: sanitizeRpcError(error)`
- Find: `error: e.message`
  Replace: `error: sanitizeRpcError(e)`
- Find: `error: err.message`
  Replace: `error: sanitizeRpcError(err)`

(Don't blindly `replace_all`: do it via the Edit tool one occurrence at a time so we don't touch comments or unrelated `.message` refs.)

- [ ] **Step 3: Manual smoke test**

1. Build + reload
2. Set a bogus testnet RPC in Settings → Networks (e.g. `https://invalid.example.com:9999/test`) and try to send a transaction
3. Confirm the toast says e.g. `"fetch failed at <url>"` rather than the full URL

- [ ] **Step 4: Commit**

```bash
git add extension/public/src/background.js
git commit -m "fix(extension): sanitize RPC errors before forwarding to UI/dApp"
```

---

## Task 8: Atomic account deletion

**Why:** `background.js:715-731` (look for the `case "DELETE_ACCOUNT":` handler — exact line may shift) deletes an account from the local array, persists, then sends `PXE_DELETE_ACCOUNT` async. If the PXE call fails, local state and PXE drift apart silently.

**Files:**
- Modify: `extension/public/src/background.js` (DELETE_ACCOUNT handler)

- [ ] **Step 1: Reorder so PXE delete runs first**

The existing handler at `background.js:715-732` is sync and fires PXE delete with `.catch(() => {})` — fire-and-forget. The listener (at `background.js:443`) is also sync, so we keep the same Promise-chain style and `return true` from the handler to keep `sendResponse` alive across the async hop.

Replace the entire `case "DELETE_ACCOUNT": { ... }` block (`background.js:715-732`) with:

```javascript
    case "DELETE_ACCOUNT": {
      const idx = message.index;
      if (!(idx >= 0 && idx < state.accounts.length && state.accounts.length > 1)) {
        sendResponse({ success: false, error: "Cannot delete: invalid index or last account" });
        break;
      }
      const account = state.accounts[idx];
      // 1. Try PXE deletion first; only mutate local state if it succeeds.
      sendToPXE({ type: "PXE_DELETE_ACCOUNT", data: { address: account.address } })
        .then(() => {
          state.accounts.splice(idx, 1);
          if (state.activeAccountIndex >= state.accounts.length) {
            state.activeAccountIndex = state.accounts.length - 1;
          }
          chrome.storage.local.set({ celari_accounts: state.accounts });
          sendResponse({
            success: true,
            accounts: state.accounts,
            activeAccountIndex: state.activeAccountIndex,
          });
        })
        .catch((e) => {
          sendResponse({
            success: false,
            error: `PXE deletion failed: ${sanitizeRpcError(e)}`,
          });
        });
      return true; // keep sendResponse channel open for the async path
    }
```

- [ ] **Step 2: Manual smoke test**

1. Build + reload
2. Create a passkey account, then delete it from Settings → Wallets
3. Stop the testnet RPC (or set bogus URL) and try deletion → expect toast saying PXE deletion failed; account remains in list
4. Restore RPC, retry → expect successful deletion

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/background.js
git commit -m "fix(extension): atomic account deletion — await PXE_DELETE_ACCOUNT first"
```

---

## Task 9: Storage-corruption recovery prompt

**Why:** `popup.js:358-368` swallows storage-read failures silently. If `celari_accounts` ever has a schema mismatch (added field, renamed field), users land on onboarding with no warning that wallet data was abandoned.

**Files:**
- Modify: `extension/public/src/pages/popup.js`

- [ ] **Step 1: Detect parse failures explicitly**

Replace the silent try/catch at `popup.js:358-368` with an explicit corruption flag:

```javascript
  let storageError = null;
  try {
    const stored = await chrome.storage.local.get("celari_accounts");
    if (stored.celari_accounts !== undefined) {
      if (!Array.isArray(stored.celari_accounts)) {
        throw new Error("celari_accounts is not an array");
      }
      for (const a of stored.celari_accounts) {
        if (!a || typeof a !== "object" || !a.address) {
          throw new Error("celari_accounts entry missing address");
        }
      }
      const clean = stored.celari_accounts.filter(a => !a.address?.includes("_pending"));
      store.accounts = clean;
      if (clean.length !== stored.celari_accounts.length) {
        await chrome.storage.local.set({ celari_accounts: clean });
      }
    }
  } catch (e) {
    storageError = e?.message || "Storage corrupted";
    console.error("[Celari popup] storage parse failed:", e);
  }
```

- [ ] **Step 2: Surface to UI on first render**

After `render()` is called from `init()` (`popup.js:430`), schedule a toast if storage was corrupt:

```javascript
  bumpInteraction();
  startLockIdleTimer();
  render();
  if (storageError) {
    setTimeout(() => {
      showToast?.(
        `Wallet storage looks corrupted (${storageError}). Re-import via passkey to recover.`,
        "error",
        10000,
      );
    }, 250);
  }
```

- [ ] **Step 3: Manual smoke test**

1. Build + reload
2. In `chrome://extensions` → Inspect popup → Console:
   ```js
   chrome.storage.local.set({ celari_accounts: "garbage" })
   ```
3. Close + reopen popup → expect persistent error toast and onboarding screen
4. Clear storage: `chrome.storage.local.clear()` then reload to restore baseline

- [ ] **Step 4: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "fix(extension): detect and surface celari_accounts schema corruption"
```

---

## Task 10: Remove unused side_panel manifest entry

**Why:** `manifest.json` declares `side_panel` pointing at `sidepanel.html`, but no code path opens it — the file is a stub. Declaring unused features bloats permissions review.

**Files:**
- Modify: `extension/public/manifest.json`
- Delete: `extension/public/sidepanel.html` (also remove from `extension/build.mjs` copy list if listed)

- [ ] **Step 1: Strip from manifest**

Remove the `side_panel` block (lines 22-24 in `manifest.json` per audit). Also remove `"sidePanel"` from the `permissions` array if present.

- [ ] **Step 2: Delete stub file**

```bash
git rm extension/public/sidepanel.html
```

- [ ] **Step 3: Update build script if needed**

`grep -n "sidepanel" extension/build.mjs`. If found, remove the entry.

- [ ] **Step 4: Manual smoke test**

1. Build + reload — manifest must validate (Chrome will refuse to load on error)
2. Right-click extension icon → no "Open side panel" entry
3. Popup still opens normally

- [ ] **Step 5: Commit**

```bash
git add extension/public/manifest.json extension/build.mjs
git commit -m "chore(extension): drop unused side_panel manifest entry"
```

---

## Task 11: Replace stale "v4.1.3" comments with "v4.2.0"

**Why:** `popup.js:83` and `popup.js:311` reference "Wallet-SDK v4.1.3"; project upgraded to 4.2.0. Comments rot and mislead new contributors.

**Files:**
- Modify: `extension/public/src/pages/popup.js`
- Modify: `extension/public/src/background.js`

- [ ] **Step 1: Update version-string comments**

```bash
grep -rn "4\.1\.3" extension/public/src/
```

Edit each match to `4.2.0`. Keep code identical — comments only.

- [ ] **Step 2: Verify no behavioural references**

```bash
grep -rn "WS_v4_1_3\|WALLET_SDK_VERSION" extension/public/src/
```

Should return nothing. If a constant exists, update it.

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/
git commit -m "chore(extension): comments — Wallet-SDK 4.1.3 → 4.2.0"
```

---

## Task 12: Faucet cooldown countdown UI

**Why:** `background.js:670-679` writes `celari_last_faucet` with the last claim timestamp, but the popup's faucet button doesn't read it, so users can re-tap immediately and see opaque rate-limit errors from the upstream API.

**Files:**
- Modify: `extension/public/src/pages/popup.js` (faucet button render + click handler)

- [ ] **Step 1: Read cooldown on render**

Find `handleFaucet` in popup.js (`grep -n "handleFaucet\|celari_last_faucet" extension/public/src/pages/popup.js`). Add a helper near the top of the file:

```javascript
const FAUCET_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

async function getFaucetCooldownMs() {
  try {
    const r = await chrome.storage.local.get("celari_last_faucet");
    const last = Number(r?.celari_last_faucet) || 0;
    const remaining = (last + FAUCET_COOLDOWN_MS) - Date.now();
    return Math.max(0, remaining);
  } catch (e) { return 0; }
}
```

- [ ] **Step 2: Disable button + countdown label**

In the faucet button render (search for `<button` near the faucet handler). Wrap the faucet button render so it queries cooldown on every render and shows e.g. `Faucet (47m)`:

```javascript
// In the dashboard render, before drawing the faucet button:
let faucetCooldown = 0;
getFaucetCooldownMs().then(ms => {
  if (ms !== faucetCooldown) {
    faucetCooldown = ms;
    render(); // re-render to update the label
  }
});

// Button props:
const cooldownLabel = faucetCooldown > 0
  ? ` (${Math.ceil(faucetCooldown / 60000)}m)`
  : "";
const disabled = faucetCooldown > 0 ? "disabled" : "";
// ... render with disabled + label append
```

(Adjust the exact integration to the existing render style — the goal is: button shows remaining minutes when cooldown active, click is no-op until 0.)

- [ ] **Step 3: Reject click during cooldown**

In `handleFaucet`:

```javascript
async function handleFaucet() {
  const remaining = await getFaucetCooldownMs();
  if (remaining > 0) {
    showToast?.(`Faucet cooldown: ${Math.ceil(remaining / 60000)} minutes left`, "info");
    return;
  }
  // ... existing logic
}
```

- [ ] **Step 4: Manual smoke test**

1. Build + reload
2. Tap Faucet → success → button label shows `(60m)` and is disabled
3. In console: `chrome.storage.local.set({ celari_last_faucet: Date.now() - 59*60*1000 })`, reload popup → button shows `(2m)`
4. Set timestamp to >1h ago → button enabled

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "feat(extension): faucet cooldown countdown UI — disable button when active"
```

---

## Task 13: Toast queue + auto-dismiss

**Why:** Currently toasts can stack indefinitely with no auto-dismiss. UI clutter on rapid errors.

**Files:**
- Modify: `extension/public/src/pages/popup.js` (the showToast helper)

- [ ] **Step 1: Replace ad-hoc showToast with queued version**

Find the existing `showToast` definition (`grep -n "function showToast\|showToast =" extension/public/src/pages/popup.js`). Replace with:

```javascript
const TOAST_DEFAULT_MS = 3500;
const TOAST_MAX_VISIBLE = 3;

let toastContainer = null;
const toastQueue = [];

function ensureToastContainer() {
  if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
  toastContainer = document.createElement("div");
  toastContainer.className = "celari-toast-stack";
  toastContainer.style.cssText = "position:fixed;bottom:16px;left:16px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:9999;pointer-events:none;";
  document.body.appendChild(toastContainer);
  return toastContainer;
}

function showToast(text, kind = "info", durationMs = TOAST_DEFAULT_MS) {
  const container = ensureToastContainer();
  while (container.children.length >= TOAST_MAX_VISIBLE) {
    container.firstElementChild?.remove();
  }
  const el = document.createElement("div");
  const colorByKind = {
    info:    "var(--text-warm)",
    success: "var(--status-up)",
    error:   "var(--status-down)",
  };
  el.style.cssText = `
    background: var(--bg-elevated, #141416);
    color: ${colorByKind[kind] || colorByKind.info};
    border: 1px solid var(--border-subtle, #26262A);
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    pointer-events: auto;
    transform: translateY(8px);
    opacity: 0;
    transition: transform 200ms ease, opacity 200ms ease;
  `;
  el.textContent = text;
  container.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 220);
  }, durationMs);
}
```

- [ ] **Step 2: Manual smoke test**

1. Build + reload
2. In Settings, fire many toasts in quick succession (e.g. tap "Lock now" repeatedly, or trigger errors) → only 3 visible at a time, oldest drops off
3. Each toast auto-dismisses after ~3.5s
4. Error toasts are red, success green, info white

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "feat(extension): toast queue with max-3 visible + auto-dismiss"
```

---

## Task 14: Remove dead NETHERMIND_CLAIM_READY + legacy confirm-tx code

**Why:** `background.js:554-575` handles `NETHERMIND_CLAIM_READY`, but `content.js` no longer fetches faucet responses (commented out at `content.js:257-260` — the popup hits the API directly now). Path is unreachable. Similarly the legacy `confirm-tx` flow at `background.js:862-933` is superseded by the `?wssign` popup.

**Files:**
- Modify: `extension/public/src/background.js`

- [ ] **Step 1: Confirm dead-paths**

```bash
grep -rn "NETHERMIND_CLAIM_READY" extension/public/src/
```

Should show only the handler in `background.js` and the comment in `content.js` (no senders).

```bash
grep -rn "confirm-tx\|SIGN_APPROVE\|SIGN_REJECT\|GET_SIGN_REQUEST\|popup.html?confirm=" extension/public/src/
```

Map every ref. If `popup.js init()` checks `urlParams.get("confirm")` and that path is genuinely active for any flow we still ship, keep it. The audit says wallet-sdk uses `?wssign` instead — confirm there's no remaining caller.

- [ ] **Step 2: Delete handlers**

In `background.js`, remove:
- `case "NETHERMIND_CLAIM_READY":` block (lines ~554-575)
- The comment at `background.js:466-468` referencing the dead claim flow
- `case "SIGN_APPROVE":` / `case "SIGN_REJECT":` / `case "GET_SIGN_REQUEST":` blocks (the legacy confirm-tx path), only if step 1 confirmed they're dead

In `popup.js`, remove the `confirmId` block at `popup.js:294-309` if dead. **Keep this in a separate commit from background changes** so it can be reverted independently if a caller surfaces.

- [ ] **Step 3: Build sanity check**

```bash
node extension/build.mjs
```

Expect clean build, no errors.

- [ ] **Step 4: Manual smoke test**

1. Reload extension
2. Faucet flow → still works (popup calls API directly)
3. Connect a dApp via wallet-sdk and sign a transaction → expect `?wssign` popup, not `?confirm`

- [ ] **Step 5: Commits**

```bash
git add extension/public/src/background.js
git commit -m "chore(extension): remove dead NETHERMIND_CLAIM_READY handler"

git add extension/public/src/background.js extension/public/src/pages/popup.js
git commit -m "chore(extension): remove legacy confirm-tx flow (superseded by ?wssign)"
```

---

## Task 15: Final build + integration smoke test

**Why:** After 14 individual changes, run the extension end-to-end to catch regressions.

**Files:**
- None (verification only)

- [ ] **Step 1: Full rebuild**

```bash
node extension/build.mjs
```

Expect: 3 passes, ~65MB offscreen bundle, "Extension built" message.

- [ ] **Step 2: Reload + manual flow**

1. `chrome://extensions` → reload Celari
2. Verify popup opens, gold-on-dark renders correctly
3. Lock now → close → reopen → still locked (Task 1 ✓)
4. Unlock with passkey → dashboard
5. Toggle theme System → Light → Dark → System (theme picker still works post-changes)
6. Open dApp using wallet-sdk → discovery prompt → approve → sign tx → success (`?wssign` flow)
7. Tap Faucet, watch cooldown countdown (Task 12 ✓)
8. Trigger 5 errors quickly → only 3 toasts visible (Task 13 ✓)
9. Inspect popup; in console run `chrome.storage.local.set({ celari_accounts: "garbage" })`, reload popup → corruption toast (Task 9 ✓)

- [ ] **Step 3: If everything passes, finalize**

Use the `superpowers:finishing-a-development-branch` skill to complete the workstream.

---

## Notes for the executing engineer

- The popup.js file is large (~3000+ LOC). Use `grep -n` aggressively to locate the right section; don't read the whole file when an Edit suffices.
- Every task is independently committable. If a task hits an unforeseen blocker, skip it and document why; don't cascade fail the others.
- The build step (`node extension/build.mjs`) is the only validation harness — there are no jest tests for the extension. Manual smoke tests in the steps are load-bearing; don't skip them.
- After commits, do NOT push — main worktree is the deploy point. Merging back to main is the user's call (the controlling agent will handle it via `finishing-a-development-branch`).
