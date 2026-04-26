# Passkey-Derived Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wrap every wallet's `secretKey` and `privateKeyPkcs8` in `chrome.storage.local` with a passkey-derived AES-GCM-256 key. See `docs/superpowers/specs/2026-04-25-passkey-encryption-design.md`.

**Architecture:** New `extension/public/src/lib/passkey-crypto.js` encapsulates KEK derivation (WebAuthn PRF) and AES-GCM wrap/unwrap. Onboarding generates a per-account `prfSalt`, derives KEK via two WebAuthn calls (create + get), encrypts secrets, writes encrypted blobs to `chrome.storage.local`. Unlock re-derives KEK via `get(prf)`, decrypts, pushes plaintext to `chrome.storage.session`. Lock wipes session. A Settings toggle gates per-tx passkey assertion.

**Tech Stack:** Vanilla JS, WebCrypto, WebAuthn level 2 + PRF extension (Chrome 116+).

**Pattern note:** popup.js renders use `root.replaceChildren()` followed by `root.insertAdjacentHTML("beforeend", html)` for screens that need it (see existing `locked`, `ws-approve`, `ws-sign` cases). Use that pattern for any new render branch — do not introduce a different pattern.

---

## Task 1: Crypto helper module

**Files:**
- Create: `extension/public/src/lib/passkey-crypto.js`
- Modify: `extension/build.mjs` (copy `lib/` to `dist/src/lib/`)

- [ ] **Step 1: Write the helper** (`extension/public/src/lib/passkey-crypto.js`)

```javascript
// extension/public/src/lib/passkey-crypto.js
// WebAuthn PRF + AES-GCM-256 envelope encryption for wallet secrets.

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - b64url.length % 4) % 4);
  return base64ToBytes(b64);
}

export function generatePrfSalt() {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function probePrfSupport() {
  // PRF eval requires a credential — full probe happens during onboarding.
  // This is a baseline API surface check.
  return typeof PublicKeyCredential !== "undefined"
    && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function";
}

async function importKekFromPrfOutput(prfOutput) {
  return crypto.subtle.importKey(
    "raw", prfOutput,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt", "decrypt"],
  );
}

export async function evalPrf({ credentialId, prfSaltBase64 }) {
  const prfSalt = base64ToBytes(prfSaltBase64);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge, rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: base64UrlToBytes(credentialId) }],
      userVerification: "required",
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  if (!assertion) throw new Error("Passkey assertion cancelled");
  const ext = assertion.getClientExtensionResults?.();
  const out = ext?.prf?.results?.first;
  if (!out || out.byteLength !== 32) throw new Error("PRF unavailable on this passkey/browser");
  return new Uint8Array(out);
}

export async function encryptWithKek(kek, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, kek,
    new TextEncoder().encode(plaintext),
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ct)),
    schema: "aes-gcm-prf-v1",
  };
}

export async function decryptWithKek(kek, blob) {
  if (!blob || blob.schema !== "aes-gcm-prf-v1") {
    throw new Error(`Unknown encryption schema: ${blob?.schema}`);
  }
  const iv = base64ToBytes(blob.iv);
  const ct = base64ToBytes(blob.ciphertext);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, kek, ct);
  return new TextDecoder().decode(pt);
}

export async function deriveKek({ credentialId, prfSaltBase64 }) {
  const prfOutput = await evalPrf({ credentialId, prfSaltBase64 });
  return importKekFromPrfOutput(prfOutput);
}

export const saltCodec = {
  toBase64: bytesToBase64,
  fromBase64: base64ToBytes,
};

export { bytesToBase64, base64ToBytes, base64UrlToBytes };
```

- [ ] **Step 2: Build pipeline copies lib/**

`grep -n "public/src/pages\|cpSync.*public/src" extension/build.mjs` — locate the source-copy section. After (or alongside) the existing `cpSync(public/src/pages, dist/src/pages)` line, add:

```javascript
cpSync(resolve(__dirname, "public/src/lib"), resolve(outdir, "src/lib"), { recursive: true });
```

- [ ] **Step 3: Static import in popup.js**

`grep -n "src=\"src/pages/popup.js\"" extension/public/popup.html` to confirm `<script type="module">`. Then at the top of `popup.js`, add:

```javascript
import * as passkeyCrypto from "../lib/passkey-crypto.js";
```

(If popup.js isn't a module per the script tag, change `popup.html` to `<script type="module" src="src/pages/popup.js">`.)

- [ ] **Step 4: Verify build**

```bash
cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası 2/.worktrees/passkey-enc"
node extension/build.mjs
ls dist/src/lib/passkey-crypto.js  # must exist
```

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/passkey-crypto.js extension/build.mjs extension/public/popup.html extension/public/src/pages/popup.js
git commit -m "feat(extension): passkey-crypto lib — PRF eval + AES-GCM helpers"
```

---

## Task 2: PRF capability gate + Chrome version

**Files:**
- Modify: `extension/public/manifest.json`
- Modify: `extension/public/src/pages/popup.js` (init + render)

- [ ] **Step 1: minimum_chrome_version**

Edit `manifest.json`. After `"version": "0.5.0",` insert:

```json
  "minimum_chrome_version": "116",
```

- [ ] **Step 2: PRF probe + new screen state**

In `popup.js init()`, find the block that begins with `// Default-locked when a passkey account exists`. Immediately before that block:

```javascript
  // PRF capability gate. Only enforced when onboarding fresh — existing
  // accounts that already have encryptedSecret will surface failure at
  // unlock time.
  if (!store.accounts.length) {
    const ok = await passkeyCrypto.probePrfSupport();
    if (!ok) {
      store.screen = "prf-unsupported";
      bumpInteraction();
      startLockIdleTimer();
      render();
      return;
    }
  }
```

- [ ] **Step 3: Render branch**

In the `render()` switch, add:

```javascript
    case "prf-unsupported":
      root.replaceChildren();
      root.insertAdjacentHTML("beforeend", renderPrfUnsupported());
      break;
```

And add the renderer near the other onboarding renderers:

```javascript
function renderPrfUnsupported() {
  return `
    <div style="padding:32px;text-align:center;color:var(--text-warm);font-family:Inter,system-ui,sans-serif;">
      <div style="font-size:48px;margin-bottom:16px;">🔒</div>
      <h2 style="font-size:20px;font-weight:600;margin-bottom:12px;">Browser update required</h2>
      <p style="color:var(--text-muted);font-size:13px;line-height:1.6;margin-bottom:24px;">
        Celari Wallet requires Chrome 116 or later to encrypt your wallet
        with your passkey. Please update Chrome and reopen the extension.
      </p>
      <a href="https://www.google.com/chrome/" target="_blank" style="display:inline-block;background:var(--gold-primary);color:#0A0A0B;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
        Update Chrome
      </a>
    </div>
  `;
}
```

- [ ] **Step 4: Build + commit**

```bash
node extension/build.mjs
git add extension/public/manifest.json extension/public/src/pages/popup.js
git commit -m "feat(extension): minimum_chrome_version 116 + PRF capability gate"
```

---

## Task 3: Schema validation + legacy wipe

**Files:**
- Modify: `extension/public/src/pages/popup.js` (the T9 storage validator block)

- [ ] **Step 1: Replace the validator block**

Find the `try { const stored = await chrome.storage.local.get("celari_accounts"); ... }` block in `init()` (added by the pre-ship plan's T9). Replace its body with:

```javascript
  let storageError = null;
  let legacyWiped = false;
  try {
    const stored = await chrome.storage.local.get("celari_accounts");
    if (stored.celari_accounts !== undefined) {
      if (!Array.isArray(stored.celari_accounts)) {
        throw new Error("celari_accounts is not an array");
      }
      // v0.5 → v0.6 schema bump: any passkey account with plaintext signing
      // material was written by legacy code. Wipe and re-onboard. Demo
      // accounts have no secrets so they're unaffected by the test below.
      const hasLegacyPlaintext = stored.celari_accounts.some(
        a => a?.type === "passkey" && (a.secretKey || a.privateKeyPkcs8),
      );
      if (hasLegacyPlaintext) {
        await chrome.storage.local.remove(["celari_accounts", "celari_locked"]);
        store.accounts = [];
        legacyWiped = true;
      } else {
        for (const a of stored.celari_accounts) {
          if (!a || typeof a !== "object" || !a.address) {
            throw new Error("celari_accounts entry missing address");
          }
          if (a.type === "passkey") {
            if (!a.encryptedSecret || !a.encryptedPrivateKey || !a.prfSalt) {
              throw new Error("passkey account missing encrypted fields");
            }
          }
        }
        const clean = stored.celari_accounts.filter(a => !a.address?.includes("_pending"));
        store.accounts = clean;
        if (clean.length !== stored.celari_accounts.length) {
          await chrome.storage.local.set({ celari_accounts: clean });
        }
      }
    }
  } catch (e) {
    storageError = e?.message || "Storage corrupted";
    console.error("[Celari popup] storage parse failed:", e);
  }
```

- [ ] **Step 2: Surface the wipe**

After `render()` near the bottom of `init()`, alongside the existing `storageError` toast:

```javascript
  if (legacyWiped) {
    setTimeout(() => {
      showToast?.(
        "Wallet storage upgraded to encrypted format. Please re-add your account.",
        "success",
        6000,
      );
    }, 250);
  }
```

- [ ] **Step 3: Build + commit**

```bash
node extension/build.mjs
git add extension/public/src/pages/popup.js
git commit -m "feat(extension): wipe legacy plaintext accounts on schema bump"
```

---

## Task 4: Onboarding — PRF setup + encrypt secrets

**Files:**
- Modify: `extension/public/src/pages/popup.js` (the passkey creation flow ~ lines 1010-1100)

- [ ] **Step 1: Locate the onboarding handler**

```bash
grep -n "navigator.credentials.create\|createOptions\|computed.secretKey" extension/public/src/pages/popup.js
```

- [ ] **Step 2: Add PRF declaration to createOptions**

Find the `createOptions.publicKey` object literal. Inside it, add an `extensions` field:

```javascript
        extensions: { prf: { eval: { first: passkeyCrypto.generatePrfSalt() } } },
```

(Chrome 116-131 ignores PRF on create — this is just a registration hint. The authoritative PRF eval happens in step 4.)

- [ ] **Step 3: Capture the storage prfSalt**

After `const credential = await navigator.credentials.create(createOptions);`:

```javascript
    if (!credential) throw new Error("Passkey creation cancelled");

    // Storage salt for all future PRF evals on this account
    const prfSaltBytes = passkeyCrypto.generatePrfSalt();
    const prfSaltBase64 = passkeyCrypto.saltCodec.toBase64(prfSaltBytes);
```

- [ ] **Step 4: Second WebAuthn prompt for KEK**

Before the `chrome.runtime.sendMessage({ type: "PXE_GENERATE_KEYS" }, ...)` call, derive the KEK:

```javascript
    btn.textContent = "Securing wallet with passkey...";
    let kek;
    try {
      kek = await passkeyCrypto.deriveKek({
        credentialId: credential.id,
        prfSaltBase64,
      });
    } catch (e) {
      throw new Error(`Passkey encryption setup failed: ${e?.message || e}`);
    }
```

- [ ] **Step 5: Encrypt before persisting account record**

Find the `const account = { address: computed.address, ... }` block. Replace it with:

```javascript
    const encryptedSecret = await passkeyCrypto.encryptWithKek(kek, computed.secretKey);
    const encryptedPrivateKey = await passkeyCrypto.encryptWithKek(kek, keys.privateKeyPkcs8);

    const accountNum = store.accounts.length + 1;
    const account = {
      address: computed.address,
      credentialId: credential.id,
      publicKeyX: keys.pubKeyX,
      publicKeyY: keys.pubKeyY,
      salt: computed.salt,
      type: "passkey",
      label: accountNum === 1 ? "Main Wallet" : `Wallet ${accountNum}`,
      deployed: false,
      createdAt: new Date().toISOString(),
      // Encrypted at rest — see spec 2026-04-25-passkey-encryption-design.md
      prfSalt: prfSaltBase64,
      encryptedSecret,
      encryptedPrivateKey,
    };
```

The existing `chrome.storage.session.set({ celari_secret, celari_private_key })` call below stays — plaintext in session is the design.

- [ ] **Step 6: Build + commit**

```bash
node extension/build.mjs
git add extension/public/src/pages/popup.js
git commit -m "feat(extension): encrypt onboarding secrets with PRF-derived KEK"
```

---

## Task 5: Unlock — PRF eval + decrypt + session push

**Files:**
- Modify: `extension/public/src/pages/popup.js` (the `unlockExtension` function)

- [ ] **Step 1: Replace function body**

Find `async function unlockExtension()`. Replace its body with:

```javascript
async function unlockExtension() {
  const account = getActiveAccount();
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
  if (!account.encryptedSecret || !account.encryptedPrivateKey || !account.prfSalt) {
    store.unlockError = "This account is missing encrypted material. Re-onboard.";
    render();
    return;
  }

  store.unlocking = true;
  store.unlockError = null;
  render();
  try {
    const kek = await passkeyCrypto.deriveKek({
      credentialId: account.credentialId,
      prfSaltBase64: account.prfSalt,
    });
    const secretKey = await passkeyCrypto.decryptWithKek(kek, account.encryptedSecret);
    const privateKeyPkcs8 = await passkeyCrypto.decryptWithKek(kek, account.encryptedPrivateKey);
    await chrome.storage.session.set({
      celari_secret: secretKey,
      celari_private_key: privateKeyPkcs8,
    });
    store.locked = false;
    store.unlockError = null;
    store.unlocking = false;
    try { chrome.storage.local.set({ celari_locked: false }); } catch (e) {}
    bumpInteraction();
    const target = store.pendingApprovalScreen;
    if (target) {
      store.pendingApprovalScreen = null;
      setState({ screen: target });
    } else {
      setState({ screen: "dashboard" });
    }
  } catch (err) {
    const msg = err?.message || "";
    store.unlockError = msg.includes("PRF unavailable")
      ? "Browser does not support encrypted unlock. Update Chrome to 116+."
      : msg.toLowerCase().includes("cancel")
      ? "Unlock cancelled."
      : "Unlock failed. Try again.";
    store.unlocking = false;
    render();
  }
}
```

(The `pendingApprovalScreen` redirect is a forward-reference to Task 11. Add the field to the store object literal in the same commit if it doesn't already exist:

```javascript
  pendingApprovalScreen: null,
```

— next to `wsApproveId`.)

- [ ] **Step 2: Build + commit**

```bash
node extension/build.mjs
git add extension/public/src/pages/popup.js
git commit -m "feat(extension): unlock — PRF eval + decrypt + session push"
```

---

## Task 6: Lock wipes session

**Files:**
- Modify: `extension/public/src/pages/popup.js` (`lockExtension`)

- [ ] **Step 1: Replace lockExtension body**

```javascript
function lockExtension({ reason } = {}) {
  store.locked = true;
  store.unlockError = null;
  store.unlocking = false;
  if (store.sendForm) store.sendForm = { to: "", amount: "", token: "zkUSD" };
  // Wipe plaintext signing material — background will reject signing until next unlock
  try {
    chrome.storage.session.remove(["celari_secret", "celari_private_key"]);
  } catch (e) {
    console.warn("[Celari popup] session wipe failed:", e?.message || e);
  }
  try {
    chrome.storage.local.set({ celari_locked: true });
  } catch (e) {
    console.warn("[Celari popup] failed to persist lock state:", e?.message || e);
  }
  setState({ screen: "locked" });
  if (reason === "idle") showToast?.("Locked due to inactivity", "info");
}
```

- [ ] **Step 2: Build + commit**

```bash
node extension/build.mjs
git add extension/public/src/pages/popup.js
git commit -m "feat(extension): lock wipes chrome.storage.session signing material"
```

---

## Task 7: Popup-close beforeunload wipe

**Files:**
- Modify: `extension/public/src/pages/popup.js`

- [ ] **Step 1: Register handler**

Near the existing module-load activity listeners (search the file for `pointerdown.*keydown.*wheel`):

```javascript
// Popup unmount: wipe session and persist lock so the extension is locked
// from the moment the popup re-opens. Direct storage calls (no DOM mutation)
// because the popup is unmounting — toast/render won't flush.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    try {
      chrome.storage.session.remove(["celari_secret", "celari_private_key"]);
      chrome.storage.local.set({ celari_locked: true });
    } catch (e) {}
  });
}
```

- [ ] **Step 2: Build + commit**

```bash
node extension/build.mjs
git add extension/public/src/pages/popup.js
git commit -m "feat(extension): wipe session storage on popup close (beforeunload)"
```

---

## Task 8: Settings toggle for per-tx passkey

**Files:**
- Modify: `extension/public/src/pages/popup.js`

- [ ] **Step 1: Add to store + load**

Find the store object literal — extend it:

```javascript
  themePref: "system",
  requirePasskeyPerTx: false,
  pendingApprovalScreen: null,   // already added in Task 5
  locked: false,
```

In `init()`, after the other preference loads:

```javascript
  try {
    const r = await chrome.storage.local.get("celari_require_passkey_per_tx");
    store.requirePasskeyPerTx = r?.celari_require_passkey_per_tx === true;
  } catch (e) {}
```

- [ ] **Step 2: Render the toggle**

Find `function renderSettings()`. Locate the section that holds the lock-now button (`grep -n "Lock now\|btn-lock-now"` — this is from the pre-ship lock work). Insert above or below:

```html
        <div class="setting-row">
          <div class="setting-label">
            <div class="setting-title">Require passkey for each transaction</div>
            <div class="setting-sub">Add a Touch ID / Face ID prompt before every signing operation. Otherwise one passkey unlock covers the whole popup session.</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="setting-tx-passkey" ${store.requirePasskeyPerTx ? "checked" : ""}>
            <span class="toggle-slider"></span>
          </label>
        </div>
```

(If `.toggle` CSS doesn't exist, add minimal styles to `popup.css`:

```css
.toggle { position: relative; display: inline-block; width: 36px; height: 20px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute; cursor: pointer; inset: 0;
  background: var(--bg-elevated, #141416);
  border: 1px solid var(--border-subtle);
  border-radius: 12px; transition: background 200ms;
}
.toggle-slider::before {
  content: ""; position: absolute; height: 14px; width: 14px;
  left: 2px; top: 2px; background: var(--text-muted);
  border-radius: 50%; transition: transform 200ms, background 200ms;
}
.toggle input:checked + .toggle-slider { background: var(--gold-primary); border-color: var(--gold-primary); }
.toggle input:checked + .toggle-slider::before { transform: translateX(16px); background: #0A0A0B; }
```
)

- [ ] **Step 3: Bind handler**

In `bindSettings()`:

```javascript
  document.getElementById("setting-tx-passkey")?.addEventListener("change", async (e) => {
    store.requirePasskeyPerTx = e.target.checked;
    try {
      await chrome.storage.local.set({ celari_require_passkey_per_tx: e.target.checked });
    } catch (err) {}
    showToast?.(
      e.target.checked
        ? "Passkey required for each transaction"
        : "Passkey only at unlock",
      "success",
    );
  });
```

- [ ] **Step 4: Build + commit**

```bash
node extension/build.mjs
git add extension/public/src/pages/popup.js extension/public/styles/popup.css
git commit -m "feat(extension): Settings toggle for per-tx passkey requirement"
```

---

## Task 9: Per-tx passkey gate

**Files:**
- Modify: `extension/public/src/pages/popup.js`

- [ ] **Step 1: Helper**

Add near the unlock helpers:

```javascript
// When the per-tx toggle is on, prompt the user for a fresh WebAuthn
// assertion before any signing operation. Presence-only — no PRF eval
// because plaintext is already in session.
async function requireSigningPasskey() {
  if (!store.requirePasskeyPerTx) return true;
  const account = getActiveAccount();
  if (account?.type !== "passkey" || !account.credentialId) return true;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: location.hostname,
        allowCredentials: [{
          type: "public-key",
          id: passkeyCrypto.base64UrlToBytes(account.credentialId),
        }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch (e) {
    return false;
  }
}
```

- [ ] **Step 2: Gate signing entry points**

`grep -n "handleSend\|btn-send-confirm\|bindWsSign\|bindConfirmTx" extension/public/src/pages/popup.js` — for each handler, add at the top of the actual sign/forward function (after input validation, before message-passing to background):

```javascript
  if (!await requireSigningPasskey()) {
    showToast?.("Passkey required to sign", "error");
    return;
  }
```

Apply to:
- `handleSend` (regular send)
- The wallet-sdk approve handler in `bindWsSign`
- The confirm-tx approve handler in `bindConfirmTx` (if still present)

- [ ] **Step 3: Build + commit**

```bash
node extension/build.mjs
git add extension/public/src/pages/popup.js
git commit -m "feat(extension): gate signing ops on per-tx passkey toggle"
```

---

## Task 10: WALLET_LOCKED structured error

**Files:**
- Modify: `extension/public/src/background.js`
- Modify: `extension/public/src/pages/popup.js`

- [ ] **Step 1: Helper in background.js**

Near the top of `background.js`:

```javascript
async function _bgIsLocked() {
  try {
    const r = await chrome.storage.session.get(["celari_secret"]);
    return !r?.celari_secret;
  } catch (e) {
    return true;
  }
}
```

- [ ] **Step 2: Apply to signing handlers**

For each handler that signs (search via `grep -n "case \"SIGN_TX\"\|case \"DAPP_SIGN\"\|sendTx\|createAuthWit" extension/public/src/background.js`), add a guard at the top:

```javascript
    case "SIGN_TX": {
      if (await _bgIsLocked()) {
        sendResponse({ success: false, error: "Wallet is locked", code: "WALLET_LOCKED" });
        break;
      }
      // ... existing logic ...
    }
```

For the `_wsForwardToPxe` body (find with `grep -n "_wsForwardToPxe"`), guard at the top of the function — return a structured locked response via the same encrypted channel:

```javascript
async function _wsForwardToPxe(decrypted, session, sessionId) {
  if (await _bgIsLocked()) {
    const responsePayload = JSON.stringify({
      messageId: decrypted.messageId,
      error: "Wallet locked",
      code: "WALLET_LOCKED",
      walletId: CELARI_WALLET_ID_WS,
    });
    try {
      const encrypted = await _wsEncrypt(session.encryptionKey, responsePayload);
      chrome.tabs.sendMessage(session.tabId, {
        origin: _WS_BG,
        type: "secure-response",
        sessionId,
        content: encrypted,
      }).catch(() => {});
    } catch (e) {
      console.warn("[WalletSDK] locked-response send failed:", e?.message || e);
    }
    return;
  }
  // ... existing body ...
}
```

- [ ] **Step 3: Popup translates to toast**

Where signing responses are consumed in popup.js (search `chrome.runtime.sendMessage.*SIGN_TX\|response\?.code`), add early in the response handler:

```javascript
  if (response?.code === "WALLET_LOCKED") {
    showToast?.("Wallet is locked. Open Celari and unlock to continue.", "error");
    return;
  }
```

- [ ] **Step 4: Build + commit**

```bash
node extension/build.mjs
git add extension/public/src/background.js extension/public/src/pages/popup.js
git commit -m "feat(extension): structured WALLET_LOCKED error from background"
```

---

## Task 11: Locked-extension dApp signing flow

**Files:**
- Modify: `extension/public/src/pages/popup.js` (the `?wssign`, `?confirm`, `?wsapprove` blocks in `init()`)

**Why:** Task 5 already wires `pendingApprovalScreen`. This task fills in the entry-side detection.

- [ ] **Step 1: Detect locked-on-entry for URL-launched popups**

In each of the three URL-param handlers in `init()` (`confirm`, `wsapprove`, `wssign`) — find them via `grep -n "wsapprove\|wssign\|confirmId" extension/public/src/pages/popup.js`. Each ends with `render(); return;` after setting `store.screen`. Replace those final 2 lines with:

```javascript
        const sess = await chrome.storage.session.get("celari_secret");
        if (!sess.celari_secret && hasPasskeyAccount()) {
          store.locked = true;
          store.pendingApprovalScreen = store.screen;
          store.screen = "locked";
        }
        render();
        return;
```

(Repeat for all three blocks. Don't extract into a helper unless you can do it cleanly without breaking the shared try/catch around each block.)

- [ ] **Step 2: Build + commit**

```bash
node extension/build.mjs
git add extension/public/src/pages/popup.js
git commit -m "feat(extension): dApp-launched popups force PRF unlock when locked"
```

---

## Task 12: Final integration smoke test

**Files:**
- None (verification only).

- [ ] **Step 1: Full rebuild**

```bash
cd "/Users/huseyinarslan/Desktop/celari-build-25 kopyası 2/.worktrees/passkey-enc"
node extension/build.mjs
```

Expect: 3 passes, dist/src/lib/passkey-crypto.js present, no errors.

- [ ] **Step 2: Manual flows**

1. `chrome://extensions` → Reload Celari (or Load unpacked from this worktree's `extension/dist`).
2. **Onboarding**: register a fresh passkey → expect 2 prompts (create, then PRF eval) → land on dashboard.
3. **Storage shape**: DevTools → Application → Storage → Extension storage → `chrome.storage.local`. Verify `celari_accounts[0]` has:
   - `encryptedSecret: { iv, ciphertext, schema: "aes-gcm-prf-v1" }`
   - `encryptedPrivateKey: { iv, ciphertext, schema: "aes-gcm-prf-v1" }`
   - `prfSalt: <base64>`
   - **No** `secretKey`, **no** `privateKeyPkcs8`
4. **Lock + reopen**: tap "Lock now" → close popup → reopen → expect lock screen → unlock → dashboard.
5. **Send tx (default)**: send a test transaction — succeeds without re-prompting passkey.
6. **Per-tx toggle**: Settings → enable "Require passkey for each transaction" → send another tx → expect a passkey prompt before broadcast.
7. **dApp signing**: from a test dapp, trigger a sign while popup is locked → expect lock-screen first, unlock with passkey → approval UI renders → approve → success.
8. **PRF unsupported**: temporarily set Chrome's user-agent to a Chrome 115 UA via DevTools → reload extension → expect `prf-unsupported` screen on a fresh install (no accounts).

- [ ] **Step 3: If everything passes**

Use `superpowers:finishing-a-development-branch` to wrap up.

---

## Notes for the executing engineer

- popup.js is large (~3000+ LOC); use `grep -n` aggressively to locate symbols.
- Every task is independently committable. If a task hits an unforeseen obstacle, document it and proceed; don't cascade-fail.
- Build verification = `node extension/build.mjs`. There are no jest tests for the extension yet (separate plan).
- Do NOT push to origin — main worktree is the deploy point. Merging back is the controlling agent's call via `finishing-a-development-branch`.
- The spec at `docs/superpowers/specs/2026-04-25-passkey-encryption-design.md` is the source of truth for design decisions. Re-read sections relevant to your task before starting.
