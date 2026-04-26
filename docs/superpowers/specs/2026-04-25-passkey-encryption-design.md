# Passkey-Derived Encryption for Celari Wallet — Design

**Date:** 2026-04-25
**Status:** Approved (pre-plan)
**Scope:** Chrome extension only (iOS app passkey at-rest is a separate spec)

---

## Goal

Encrypt every wallet's `secretKey` (Aztec PXE secret) and `privateKeyPkcs8` (P-256 signing key) at rest in `chrome.storage.local` using a key derived from the user's WebAuthn passkey, so a browser/disk dump no longer exposes signing material.

## Threat model

**In-scope adversaries:**
- Disk-image / `chrome.storage.local` dump attackers (e.g. malware exfiltrating profile)
- Malicious extension or browser tab attempting to read our local storage
- Forensic recovery from a sold/stolen unwiped device

**Out-of-scope adversaries:**
- Hardware-level attackers with control of the secure enclave (passkey itself compromised)
- Network adversaries (TLS protects the wire — orthogonal concern)
- Adversaries with passkey assertion + active browser session

**Recovery story:** Lost passkey ≠ lost wallet. Recovery is delegated to `celari_recoverable_account` v0.2.0 (Phase 2 work) — guardians rotate the wallet's signing key on-chain, the user generates a fresh passkey on a new device. The encrypted local cache on the lost device is intentionally unrecoverable; it isn't needed because the wallet contract is recovered at the protocol level, not the storage level.

## Decisions made

1. **Approach:** Browser-dump prevention with passkey-derived encryption. Recovery via guardian flow at the contract level (option B from brainstorm).
2. **Cryptography:** PRF extension on WebAuthn (Chrome 116+) → 32-byte deterministic secret → used directly as AES-GCM-256 key. No HKDF post-processing.
3. **No migration:** Testnet phase, no real value at risk. Existing legacy plaintext accounts are wiped on upgrade; user re-onboards.
4. **Manifest:** `minimum_chrome_version: "116"` enforced — Chrome Web Store filters incompatible browsers.
5. **Authority:** Popup is the only decryption point (only context with `navigator.credentials` access). Background reads plaintext via `chrome.storage.session`, which is memory-only.

## Architecture

### Key hierarchy

```
Passkey (hardware-backed credential, WebAuthn platform-bound)
  │
  │ navigator.credentials.get({ extensions: { prf: { eval: { first: prfSalt } } } })
  ▼
PRF output (32 bytes, deterministic for [credentialId, prfSalt])
  │
  │ crypto.subtle.importKey("raw", prfOutput, { name: "AES-GCM", length: 256 })
  ▼
KEK (per-account)
  │
  │ AES-GCM(KEK, plaintext, randomIV) → { iv, ciphertext }
  ▼
Encrypted blob (stored in chrome.storage.local)
```

**Per-account `prfSalt`:** Each account holds its own random 32-byte salt. Multiple accounts under the same passkey get distinct KEKs. Salt is public — passkey is the secret.

**IV:** Fresh 12 random bytes per encryption operation. Tag length: default 128 bits (built-in to AES-GCM-256).

### Storage schema

`chrome.storage.local.celari_accounts[i]`:

```json
{
  "address": "0xabc...",
  "salt": "0x...",
  "prfSalt": "<base64, 32 bytes>",
  "encryptedSecret": {
    "iv": "<base64, 12 bytes>",
    "ciphertext": "<base64>",
    "schema": "aes-gcm-prf-v1"
  },
  "encryptedPrivateKey": {
    "iv": "<base64, 12 bytes>",
    "ciphertext": "<base64>",
    "schema": "aes-gcm-prf-v1"
  },
  "publicKeyX": "0x...",
  "publicKeyY": "0x...",
  "credentialId": "<base64url>",
  "deployed": true,
  "label": "Main",
  "type": "passkey"
}
```

`secretKey` and `privateKeyPkcs8` plaintext fields are **removed**. Schema validation in `init()` (extending T9 from the pre-ship plan) requires every passkey account to carry `encryptedSecret`, `encryptedPrivateKey`, and `prfSalt`. Demo accounts (`type !== "passkey"`) are exempt — they have no secrets to protect.

### Lifecycle

**Account creation (passkey register):**

1. `prfSalt = randomBytes(32)`
2. `navigator.credentials.create({ ..., extensions: { prf: { eval: { first: prfSalt } } } })` — register the passkey with PRF capability declared
3. Generate fresh `secretKey` and `privateKeyPkcs8` (existing code path, unchanged)
4. `navigator.credentials.get({ ..., extensions: { prf: { eval: { first: prfSalt } } } })` — second prompt, get the PRF output for the new credential
5. Derive KEK from PRF output (`importKey AES-GCM`)
6. AES-GCM encrypt both secrets with the KEK, fresh random IVs
7. Persist account record with `encryptedSecret`, `encryptedPrivateKey`, `prfSalt` — never write the plaintext fields

(Two prompts during onboarding is acceptable — one-time cost. PRF-on-create exists in Chrome 132+ but we stick to the broader-supported create+get pattern.)

**Unlock:**

1. `navigator.credentials.get({ ..., extensions: { prf: { eval: { first: storedPrfSalt } } } })`
2. Read PRF output from `assertion.getClientExtensionResults().prf.results.first`
3. Derive KEK
4. Decrypt active account's `encryptedSecret` + `encryptedPrivateKey`
5. Push plaintext to `chrome.storage.session` as `celari_secret` and `celari_private_key` (current background read path is preserved)
6. `store.locked = false`, render dashboard

**Lock:**

1. Clear in-memory plaintext (`Uint8Array.fill(0)` where applicable, then null)
2. `chrome.storage.session.remove(["celari_secret", "celari_private_key"])`
3. `chrome.storage.local.set({ celari_locked: true })` (T1 behavior)
4. Render lock screen

**Triggered by:** manual "Lock now" button, idle timer expiry (T5), AND popup close (`window.beforeunload`). Always wiping session on close means each popup re-open requires a fresh passkey unlock to populate session — which is already T1's expected behavior, so zero added UX cost.

**Signing operations (`SIGN_TX`, transfers, etc.):**

No code change. Background reads plaintext from `chrome.storage.session`. Plaintext was put there by popup unlock; lock removes it.

**dApp signing popups (`?wssign`, `?confirm`, `?wsapprove`):**

These URL-launched popups currently bypass the lock screen for UX (auto-prompted by dApp). With encrypted storage, they have no plaintext to use. Solution: each such popup performs a **silent unlock at entry** — issue `navigator.credentials.get` with PRF before rendering the approval UI. User sees passkey prompt (browser-native), approves, popup decrypts, then renders. Reject → close popup. This is a UX improvement: dApp signing now requires explicit passkey approval per request, not just session-persistent permission.

### Migration: none

Schema bump on extension upgrade. `init()` detects any passkey account with `secretKey`/`privateKeyPkcs8` plaintext fields, wipes `celari_accounts` + `celari_locked`, lands user on onboarding with a one-line success toast: *"Wallet storage upgraded to encrypted format. Please re-add your account."* Testnet-only justifies this aggressive cleanup.

### Manifest change

Add `"minimum_chrome_version": "116"` so Chrome Web Store auto-filters incompatible browsers and existing installs are auto-updated past the threshold before the new code activates.

## Acceptance criteria

1. **`chrome.storage.local.celari_accounts` contains no plaintext signing material.** A disk dump of the storage file leaks no `secretKey` or `privateKeyPkcs8` values.
2. **PRF capability is required.** Onboarding fails fast on Chrome <116 or browsers without PRF — clear error message, no silent fallback to plaintext.
3. **Unlock decrypts correctly.** A user can lock the popup, close it, reopen, unlock, and successfully sign a transaction. End-to-end test on testnet.
4. **Lock wipes session storage.** After lock (manual, idle, or popup close), `chrome.storage.session` contains no `celari_secret` or `celari_private_key`. Background signing requests in this state fail with a structured `WALLET_LOCKED` error code (not a raw exception), which the popup translates to a "Wallet is locked — open Celari to unlock" toast.
5. **dApp signing requires explicit per-request passkey approval.** Each `?wssign` popup prompts for passkey before showing the sign UI.
6. **Schema validation rejects legacy.** A `celari_accounts` entry with plain `secretKey` triggers the upgrade-cleanup path, not silent acceptance.

## Out of scope

- iOS app passkey at-rest encryption (separate WKWebView/Keychain design)
- WalletConnect v2 routing (handled in its own spec)
- Hardware-token / FIDO2 USB-key support beyond platform-bound passkeys
- Test infrastructure (separate spec)

## Risks

- **PRF on `create()` not used:** We do `create + get` (2 prompts in onboarding) for backward-compatibility with Chrome 116-131. Chrome 132+ supports `prf.eval` on create directly; could be optimized later if metrics show drop-off in onboarding.
- **Passkey roaming via cloud sync:** If the user's passkey is synced to another device (iCloud Keychain, Google Password Manager), the PRF output may not be deterministic across devices in some implementations. We accept this limitation — Chrome extension is per-device by design; the wallet contract recovery flow (Phase 2) is the cross-device path, not local storage replication.
- **`chrome.storage.session` quota:** Plaintext keys live in session storage during unlocked window. Quota is 10MB on session — comfortable margin; not a concern.

## File touches (estimate)

- `extension/public/manifest.json` — minimum_chrome_version + (no other change)
- `extension/public/src/pages/popup.js` — onboarding (PRF setup), unlock (PRF eval + decrypt), lock (wipe), schema validation, init upgrade path
- `extension/public/src/background.js` — no change (reads `chrome.storage.session` as before)
- `extension/public/src/lib/passkey-crypto.js` — **new** — encapsulates KEK derivation, AES-GCM wrap/unwrap helpers (~150 LOC)

## Glossary

- **KEK** — Key-encryption-key. The 256-bit AES-GCM key derived from PRF, used to wrap/unwrap the wallet's signing material.
- **PRF** — Pseudo-Random Function. WebAuthn extension that lets a relying party derive a deterministic secret from a passkey assertion (RFC draft).
- **Envelope encryption** — Pattern of encrypting data with a per-record DEK (or directly with a KEK in our simplified single-layer design) instead of using the user's master key directly.

