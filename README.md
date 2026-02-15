# 🔮 Celari — Hidden by Design

> **celāre** *(Latin)* — to hide, to conceal, to keep secret

Celari is a privacy-first smart wallet built on [Aztec Network](https://aztec.network). It uses **WebAuthn/Passkey** authentication (Face ID, fingerprint) instead of seed phrases, with **P256/secp256r1** signature verification in Noir circuits.

**Zero seed phrases. Zero metadata. Zero compromise.**

---

## ✨ Why Celari?

| Feature | Traditional Wallets | Celari |
|---------|-------------------|--------|
| Authentication | 24-word seed phrase | Face ID / Fingerprint |
| Key storage | Software (extractable) | Secure enclave (hardware) |
| Backup | Manual paper backup | iCloud / Google auto-sync |
| Privacy | Pseudonymous (traceable) | Fully private (ZK proofs) |
| Phishing risk | High | Low (domain-bound keys) |

## 🏗 Architecture

```
┌─────────────────────────────────────────────────┐
│  Celari Browser Extension (Chrome MV3)          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ popup.js │  │ inpage.js│  │ background.js│  │
│  │ (UI/UX)  │  │ (dApp    │  │ (PXE client) │  │
│  │ 6 screens│  │  provider)│  │              │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │               │          │
│  ┌────▼──────────────▼───────────────▼───────┐  │
│  │         WebAuthn / Passkey Layer          │  │
│  │  navigator.credentials.create() / .get() │  │
│  │  P256 key in Secure Enclave (TEE)        │  │
│  └────────────────────┬─────────────────────┘  │
└───────────────────────┼─────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────┐
│  Aztec Network (Private Execution Environment)    │
│  ┌─────────────────────────────────────────────┐  │
│  │  CelariPasskeyAccount (Noir Contract)       │  │
│  │  • ecdsa_secp256r1::verify_signature        │  │
│  │  • Auth witness: sig(64) + hashes(64)       │  │
│  │  • Private state: encrypted UTXOs           │  │
│  └─────────────────────────────────────────────┘  │
│  Private transfers → zero on-chain metadata       │
└───────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- [Aztec Sandbox](https://docs.aztec.network) running locally
- Node.js 18+
- Chrome browser

### Install & Build
```bash
git clone https://github.com/celari-wallet/celari.git
cd celari
yarn install
yarn compile
yarn codegen
```

### Load Extension
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/public/`
4. Click the Celari icon in toolbar

### Deploy Account
```bash
export CELARI_PUB_KEY_X="0x..."
export CELARI_PUB_KEY_Y="0x..."
yarn deploy:passkey
```

## 📂 Project Structure

```
celari/
├── contracts/celari_passkey_account/   # P256 Noir contract + tests
├── extension/                          # Chrome extension (MV3)
│   ├── public/                         # Manifest, HTML, CSS, icons
│   └── src/                            # popup, background, content, inpage
├── src/utils/                          # Passkey SDK (TS)
├── src/test/e2e/                       # Integration tests
├── scripts/                            # Deploy scripts
└── examples/                           # dApp integration demo
```

## 🔐 Passkey Flow

```
User taps "Gönder" → WebAuthn biometric prompt → Secure enclave P256 sign
→ Auth witness packed → Noir verifies ecdsa_secp256r1 → ZK proof → broadcast
```

## 🌐 dApp Integration

```javascript
const { address } = await window.celari.connect();
await window.celari.sendTransaction({ to: "0x...", amount: 1000n, token: "zkUSD" });
await window.celari.createAuthWit(messageHash);
window.celari.on("accountChanged", (data) => { ... });
```

## 📊 Stats

- **3,400+ lines** across 22 files
- **Languages**: Noir, TypeScript, JavaScript, CSS
- **8 tests**: Account, mint, transfer, payroll flow, P256 format, DER normalization

## 🗺 Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| 0 | Schnorr prototype | ✅ |
| 1 | Passkey + Extension | ✅ |
| 2 | L1↔L2 Bridge + Off-ramp | 🔜 |
| 3 | Payroll (batch_pay) | 📋 |
| 4 | Crypto card | 📋 |
| 5 | Mobile + Cross-chain | 📋 |

---

<p align="center">
  <b>Celari</b> — <i>celāre: to hide, to conceal</i><br/>
  Your transactions speak zero. 🔮
</p>
