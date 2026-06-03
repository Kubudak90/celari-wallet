# Bridge Exit (L2 Withdraw) Execution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `window.celari.sendTransaction({type:"bridge_exit", amount, recipient})` actually execute the L2 exit via the offscreen PXE (user-confirmed, balance-auto-selected private/public) and return a real `txHash`, so the website bridge-withdraw flow completes.

**Architecture:** inpage `sendTransaction` → background `handleProviderMethod` parks a `bridge_exit`-tagged sign request → confirm popup → on approve, `SIGN_APPROVE` calls offscreen `PXE_BRIDGE_EXIT` → offscreen registers the bridge + bridged-token contracts, picks private/public by balance, calls `CelariTokenBridge.exit_to_l1_*().send({wait})` with params matching the L1 claim, returns `{success, txHash}` over the encrypted provider channel.

**Tech Stack:** Vanilla JS (MV3 SW + offscreen PXE), `@aztec/aztec.js` (`Contract.at`, `.send({wait})`), esbuild (`bundle:true` for offscreen), Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-06-03-bridge-exit-execution-design.md`
**Branch:** `feat/secure-transport-phase1` (continuation).

---

## File Structure
- `extension/public/src/lib/bridge-exit-select.js` — **new**, pure `selectExitMode(privateBal, publicBal, amount)`. Unit-tested.
- `extension/public/src/lib/bridge-config.js` — **new**, deployed bridge addresses (constants).
- `extension/public/src/offscreen.js` — **modify**: import bridge artifacts + config + selector; add `executeBridgeExit` + `PXE_BRIDGE_EXIT` dispatch.
- `extension/public/src/background.js` — **modify**: tag `bridge_exit` sign requests; execute on `SIGN_APPROVE`, return txHash.
- `extension/public/src/inpage.js` — **modify**: raise provider request timeout 300s → 900s.
- `extension/public/src/pages/popup.js` — **modify**: `confirm-tx` shows bridge-withdraw details.
- `extension/test/bridge-exit-select.test.ts` — **new** test.

Key parameter facts (verified): L1 ETH token = `0x0000000000000000000000000000000000000000`; website L1 claim uses `withCaller=true` → `callerOnL1 = recipient`; `nonce = 0`; tokenBridge `0x0f7bef04f49d62c55d01d156d114786cc6d0d9c2e8f7835e29cd9a6dc6c996d5`; bridgedToken `0x0e6e89fdd236fad5a3a7b93ec8076ebfad0c086ca5e7f5eb00b91023b2a4d268`. Content-hash parity is enforced **on-chain** by `exit_to_l1_*` from these params.

---

## Task 1: Pure exit-mode selector

**Files:**
- Create: `extension/public/src/lib/bridge-exit-select.js`
- Test: `extension/test/bridge-exit-select.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// extension/test/bridge-exit-select.test.ts
import { describe, it, expect } from "@jest/globals";
import { selectExitMode } from "../public/src/lib/bridge-exit-select.js";

describe("selectExitMode", () => {
  it("prefers private when the private balance covers the amount", () => {
    expect(selectExitMode(100n, 100n, 50n)).toBe("private");
    expect(selectExitMode(50n, 0n, 50n)).toBe("private");
  });
  it("falls back to public when private is insufficient but public covers it", () => {
    expect(selectExitMode(10n, 100n, 50n)).toBe("public");
    expect(selectExitMode(0n, 50n, 50n)).toBe("public");
  });
  it("returns null when neither balance covers the amount", () => {
    expect(selectExitMode(10n, 10n, 50n)).toBeNull();
    expect(selectExitMode(0n, 0n, 1n)).toBeNull();
  });
  it("accepts string/number balances and coerces to BigInt", () => {
    expect(selectExitMode("100", "0", "50")).toBe("private");
    expect(selectExitMode(0, 100, 50)).toBe("public");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest extension/test/bridge-exit-select.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```js
// extension/public/src/lib/bridge-exit-select.js
// Pick the L2 exit mode for a withdraw: private if the private balance covers
// the amount, else public if the public balance does, else null (insufficient).
export function selectExitMode(privateBal, publicBal, amount) {
  const amt = BigInt(amount);
  if (BigInt(privateBal) >= amt) return "private";
  if (BigInt(publicBal) >= amt) return "public";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest extension/test/bridge-exit-select.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/bridge-exit-select.js extension/test/bridge-exit-select.test.ts
git commit -m "feat(ext): add bridge exit-mode selector (private/public by balance)"
```

---

## Task 2: Bridge address constants

**Files:**
- Create: `extension/public/src/lib/bridge-config.js`
- Test: `extension/test/bridge-config.test.ts`

- [ ] **Step 1: Write the failing test** (a sanity check that addresses are well-formed hex, catching typos)

```ts
// extension/test/bridge-config.test.ts
import { describe, it, expect } from "@jest/globals";
import { BRIDGE } from "../public/src/lib/bridge-config.js";

describe("bridge-config", () => {
  it("exposes 0x-hex addresses", () => {
    for (const k of ["TOKEN_BRIDGE_ADDRESS", "BRIDGED_TOKEN_ADDRESS", "L1_PORTAL_ADDRESS", "L1_ETH_TOKEN"]) {
      expect((BRIDGE as any)[k]).toMatch(/^0x[0-9a-fA-F]+$/);
    }
  });
  it("L1 ETH token is the zero address", () => {
    expect(BRIDGE.L1_ETH_TOKEN).toBe("0x0000000000000000000000000000000000000000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest extension/test/bridge-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module** (values from `.celari-bridge-l2.json` / `website/src/lib/constants.ts`)

```js
// extension/public/src/lib/bridge-config.js
// Deployed Celari bridge addresses (testnet). Mirrors .celari-bridge-l2.json
// and website/src/lib/constants.ts. Hardcoded like the network/SponsoredFPC
// constants — re-deploying the bridge requires updating these.
export const BRIDGE = {
  TOKEN_BRIDGE_ADDRESS: "0x0f7bef04f49d62c55d01d156d114786cc6d0d9c2e8f7835e29cd9a6dc6c996d5",
  BRIDGED_TOKEN_ADDRESS: "0x0e6e89fdd236fad5a3a7b93ec8076ebfad0c086ca5e7f5eb00b91023b2a4d268",
  L1_PORTAL_ADDRESS: "0x54b844835905B303d9618Ceb502601993040259B",
  L1_ETH_TOKEN: "0x0000000000000000000000000000000000000000",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest extension/test/bridge-config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/lib/bridge-config.js extension/test/bridge-config.test.ts
git commit -m "feat(ext): add bridge address constants"
```

---

## Task 3: offscreen `PXE_BRIDGE_EXIT` handler

**Files:**
- Modify: `extension/public/src/offscreen.js`

Context (verified patterns to reuse): `getActiveWallet()` returns the active account's `acctWallet`; module-global `wallet` (EmbeddedWallet) + `nodeClient` are used to register contracts; `setupSponsoredFPC(acctWallet)` returns `{ paymentMethod }`; `.send({from, fee, wait})` returns `sendResult` whose `sendResult.receipt.txHash`/`.blockNumber` are the result (see `executeTransfer` `offscreen.js:751-846`). `reportProgress(msg)` updates the popup. Contract registration pattern: `const { contractInstance: existing } = await wallet.getContractMetadata(addr); if (!existing && nodeClient) { const onChain = await nodeClient.getContract(addr); if (onChain) await wallet.registerContract(onChain, ARTIFACT); }`.

- [ ] **Step 1: Add `EthAddress` to the addresses import**

Find `import { AztecAddress } from "@aztec/aztec.js/addresses";` (around `offscreen.js:15`) and change it to:
```js
import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
```

- [ ] **Step 2: Add bridge artifact imports + config/selector imports**

After the existing artifact imports (after the `CelariRecoverableAccountArtifactJson` import block, ~`offscreen.js:34-41`), add:
```js
// Bridge contracts (compiled Noir → JSON) for L2 withdraw (exit) execution.
import CelariTokenBridgeArtifactJson from "../../../bridge/contracts/l2/celari_token_bridge/target/celari_token_bridge-CelariTokenBridge.json" with { type: "json" };
import BridgedTokenArtifactJson from "../../../bridge/contracts/l2/bridged_token/target/bridged_token-BridgedToken.json" with { type: "json" };
const CelariTokenBridgeArtifact = loadContractArtifact(CelariTokenBridgeArtifactJson);
const BridgedTokenArtifact = loadContractArtifact(BridgedTokenArtifactJson);

import { BRIDGE } from "./lib/bridge-config.js";
import { selectExitMode } from "./lib/bridge-exit-select.js";
```

- [ ] **Step 3: Add the `executeBridgeExit` function** (place it right after `executeTransfer`, before `// --- Balance Query ---` at ~`offscreen.js:847-849`)

```js
// --- Bridge Exit (L2 → L1 withdraw) ---

async function _ensureContractRegistered(addr, artifact) {
  const { contractInstance: existing } = await wallet.getContractMetadata(addr);
  if (!existing && nodeClient) {
    const onChain = await nodeClient.getContract(addr);
    if (onChain) await wallet.registerContract(onChain, artifact);
  }
}

async function executeBridgeExit(data) {
  const acctWallet = getActiveWallet();
  if (!acctWallet) throw new Error("No account registered in PXE");

  const recipient = String(data.recipient);   // L1 0x address
  const amount = BigInt(data.amount);          // wei
  const sender = acctWallet.getAddress();

  const bridgeAddr = AztecAddress.fromString(BRIDGE.TOKEN_BRIDGE_ADDRESS);
  const tokenAddr  = AztecAddress.fromString(BRIDGE.BRIDGED_TOKEN_ADDRESS);

  // In-memory PXE has no persistence — register the deployed contracts each time.
  reportProgress("Köprü kontratları hazırlanıyor...");
  await _ensureContractRegistered(bridgeAddr, CelariTokenBridgeArtifact);
  await _ensureContractRegistered(tokenAddr, BridgedTokenArtifact);

  // Pick exit mode by balance of the bridged token for the active account.
  reportProgress("Bakiye kontrol ediliyor...");
  const token = await Contract.at(tokenAddr, BridgedTokenArtifact, acctWallet);
  let priv = 0n, pub = 0n;
  try { priv = BigInt((await token.methods.balance_of_private(sender).simulate({ from: sender })).toString()); } catch (e) { console.warn("[Bridge] private balance read failed:", e?.message); }
  try { pub  = BigInt((await token.methods.balance_of_public(sender).simulate({ from: sender })).toString()); } catch (e) { console.warn("[Bridge] public balance read failed:", e?.message); }
  const mode = selectExitMode(priv, pub, amount);
  if (!mode) throw new Error(`Insufficient bridged balance: private ${priv}, public ${pub}, need ${amount}`);

  // Fee (SponsoredFPC, with fallback to account Fee Juice — mirrors executeTransfer).
  reportProgress("Fee ödeme ayarlanıyor...");
  let paymentMethod;
  try {
    const fpc = await Promise.race([
      setupSponsoredFPC(acctWallet),
      new Promise((_, rej) => setTimeout(() => rej(new Error("SponsoredFPC timeout")), 30000)),
    ]);
    paymentMethod = fpc.paymentMethod;
  } catch (e) {
    console.warn(`[Bridge] SponsoredFPC unavailable (${e.message}), using account Fee Juice`);
    paymentMethod = undefined;
  }
  const feeOpts = { estimateGas: true, estimatedGasPadding: 0.1 };
  if (paymentMethod) feeOpts.paymentMethod = paymentMethod;
  const sendOpts = { from: sender, fee: feeOpts, wait: { timeout: 600_000 } };

  // Build + send the exit. Params match the website's L1 claim
  // (withdraw(..., withCaller=true)): l1Token=ETH(0x0), callerOnL1=recipient, nonce=0.
  // Content-hash parity is enforced on-chain by exit_to_l1_*.
  const bridge = await Contract.at(bridgeAddr, CelariTokenBridgeArtifact, acctWallet);
  const l1Token     = EthAddress.fromString(BRIDGE.L1_ETH_TOKEN);
  const recipEth    = EthAddress.fromString(recipient);
  const callerOnL1  = EthAddress.fromString(recipient);
  const nonce       = new Fr(0n);

  reportProgress(`L1'e çekim gönderiliyor (${mode})...`);
  let sendResult;
  if (mode === "private") {
    sendResult = await bridge.methods
      .exit_to_l1_private(tokenAddr, l1Token, recipEth, amount, callerOnL1, nonce)
      .send(sendOpts);
  } else {
    sendResult = await bridge.methods
      .exit_to_l1_public(l1Token, recipEth, amount, callerOnL1, nonce)
      .send(sendOpts);
  }

  const receipt = sendResult.receipt;
  reportProgress(null);
  return { success: true, txHash: receipt.txHash.toString(), blockNumber: receipt.blockNumber?.toString() || "", mode };
}
```

- [ ] **Step 4: Add the dispatch case**

In the offscreen message `switch`, next to `case "PXE_TRANSFER":` (around `offscreen.js:1629`), add:
```js
        case "PXE_BRIDGE_EXIT":
          return await executeBridgeExit(msg.data);
```

- [ ] **Step 5: Build to confirm the artifacts bundle**

Run: `node extension/build.mjs`
Expected: Pass 2 (offscreen bundle) OK; the two bridge artifacts are inlined (offscreen already bundles multi-MB artifacts). No esbuild "could not resolve" errors for the bridge artifact paths.
If a bridge target JSON does not exist (`bridge/contracts/l2/.../target/*.json`), STOP and report — the Noir contracts must be compiled first (`aztec compile` in those contract dirs). Verify with: `ls bridge/contracts/l2/celari_token_bridge/target/ bridge/contracts/l2/bridged_token/target/`.

- [ ] **Step 6: Commit**

```bash
git add extension/public/src/offscreen.js
git commit -m "feat(ext): offscreen PXE_BRIDGE_EXIT — execute L2 exit, return txHash"
```

---

## Task 4: background wiring + inpage timeout

**Files:**
- Modify: `extension/public/src/background.js`
- Modify: `extension/public/src/inpage.js`

- [ ] **Step 1: Tag bridge_exit sign requests in `handleProviderMethod`**

In `background.js` `handleProviderMethod`, the `DAPP_SIGN`/`CREATE_AUTHWIT` branch parks a request via `pendingSignRequests.set(signId, { payload, origin, tabId, sendResponse: (resp) => _providerRespond(...) })`. Add a `kind` field derived from the transaction type so `SIGN_APPROVE` can route it. Change that `pendingSignRequests.set(...)` object to include:
```js
      kind: payload?.transaction?.type === "bridge_exit" ? "bridge_exit" : "sign",
```
(So the parked object is `{ payload, origin, tabId, kind, sendResponse }`.)

- [ ] **Step 2: Execute bridge_exit on approval in `SIGN_APPROVE`**

Find the `case "SIGN_APPROVE":` handler. After Phase 1 it looks like:
```js
    case "SIGN_APPROVE": {
      (async () => {
        if (await _bgIsLocked()) {
          sendResponse({ success: false, error: "Wallet is locked", code: "WALLET_LOCKED" });
          return;
        }
        const pending = pendingSignRequests.get(message.requestId);
        if (pending) {
          pendingSignRequests.delete(message.requestId);
          pending.sendResponse({ success: true, approved: true });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Request not found or expired" });
        }
      })();
      return true;
    }
```
Replace the `if (pending) { ... }` body so a `bridge_exit` request executes via the offscreen PXE and resolves the dApp with the real txHash (acking the popup immediately so it can close while proving runs):
```js
        const pending = pendingSignRequests.get(message.requestId);
        if (!pending) { sendResponse({ success: false, error: "Request not found or expired" }); return; }
        pendingSignRequests.delete(message.requestId);

        if (pending.kind === "bridge_exit") {
          // Ack the popup right away; proving/mining can take minutes.
          sendResponse({ success: true });
          const tx = pending.payload?.transaction || {};
          try {
            const r = await sendToPXE({ type: "PXE_BRIDGE_EXIT", data: { amount: tx.amount, recipient: tx.recipient } });
            pending.sendResponse(
              r?.success
                ? { success: true, txHash: r.txHash, blockNumber: r.blockNumber }
                : { success: false, error: r?.error || "Bridge exit failed" }
            );
          } catch (e) {
            pending.sendResponse({ success: false, error: sanitizeRpcError(e) });
          }
          return;
        }

        pending.sendResponse({ success: true, approved: true });
        sendResponse({ success: true });
```

- [ ] **Step 3: Raise the inpage provider request timeout**

In `extension/public/src/inpage.js`, the `sendRequest` function has `setTimeout(() => { ... reject(new Error("Request timed out")); }, 300000);`. Change `300000` to `900000` (15 min — headroom for client-side proving; reads still resolve immediately). Update the inline comment if present.

- [ ] **Step 4: Build + verify**

Run: `node extension/build.mjs` → Pass 1 + Pass 2 OK.
Run: `grep -n "PXE_BRIDGE_EXIT\|kind === \"bridge_exit\"\|kind:" extension/public/src/background.js` → confirm the tag + execution branch present.
Run: `grep -n "900000" extension/public/src/inpage.js` → confirm timeout raised.
Run: `npm test` → no new failures (the 4 pre-existing `passkey_account` e2e suites are unrelated; `npx jest extension/test` should be fully green).

- [ ] **Step 5: Commit**

```bash
git add extension/public/src/background.js extension/public/src/inpage.js
git commit -m "feat(ext): execute bridge_exit on sign approval; raise provider timeout for proving"
```

---

## Task 5: popup confirm screen shows withdraw details

**Files:**
- Modify: `extension/public/src/pages/popup.js`

Context: `popup.html?confirm=<signId>` loads the pending request via `GET_SIGN_REQUEST` into `store.pendingSignRequest = { id, origin, payload }` and renders via `renderConfirmTx()` (~`popup.js:3058`), which currently reads `req.payload?.transaction?.functionName` / `contractAddress`. The bridge_exit payload is `{ transaction: { type:"bridge_exit", amount: <wei string>, recipient: <0x L1 addr> } }`.

- [ ] **Step 1: Read `renderConfirmTx` and add a bridge_exit branch**

Read `renderConfirmTx()` in `popup.js` to match its existing card markup, then add — at the top of the function, after the request/payload is read — a branch that, when `payload?.transaction?.type === "bridge_exit"`, renders withdraw-specific content instead of the generic function-call card. Use this logic (adapt the surrounding HTML to the existing card structure/classes):
```js
  const tx = req?.payload?.transaction || {};
  if (tx.type === "bridge_exit") {
    const eth = (Number(BigInt(tx.amount || "0")) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 });
    const title = "L1'e Çekim (Bridge Withdraw)";
    const rows = `
      <div class="row"><span>Miktar</span><strong>${eth} ETH</strong></div>
      <div class="row"><span>Alıcı (L1)</span><strong>${tx.recipient || "-"}</strong></div>
      <div class="row"><span>Kaynak</span><strong>${req.origin || "-"}</strong></div>`;
    // ...render `title` + `rows` into the same confirm card the function-call
    // branch uses, keeping the existing Approve/Reject buttons (#btnApproveTx /
    // #btnRejectTx) so bindConfirmTx() works unchanged.
    // Return after rendering this branch.
  }
```
Keep the existing `#btnApproveTx`/`#btnRejectTx` IDs and the existing `bindConfirmTx()` wiring (which already sends `SIGN_APPROVE`/`SIGN_REJECT`). Do NOT change `bindConfirmTx`.

- [ ] **Step 2: Build + manual render check**

Run: `node extension/build.mjs` → Pass 1 OK (popup builds without `drop:["console"]`, per the existing dedicated popup pass).
Run: `grep -n "bridge_exit" extension/public/src/pages/popup.js` → confirm the branch is present.
(Visual confirmation happens in Task 6 E2E.)

- [ ] **Step 3: Commit**

```bash
git add extension/public/src/pages/popup.js
git commit -m "feat(ext): confirm popup shows bridge-withdraw details"
```

---

## Task 6: Full build + manual E2E (live testnet)

No automated harness can exercise a real proven L2 exit; verify on testnet. Record PASS/FAIL.

- [ ] **Step 1: Build + load**

Run: `node extension/build.mjs` → all passes OK.
Load unpacked `extension/dist` in Chrome; unlock the wallet with a deployed account that holds bridged cbETH (`0x0e6e89…`) on L2.

- [ ] **Step 2: Withdraw E2E (the whole point)**
  - On the Celari website withdraw flow, enter an amount ≤ your cbETH balance and an L1 recipient (your Sepolia address), submit.
  - The confirm popup opens showing **"L1'e Çekim"**, the amount, and the L1 recipient. Approve.
  - `sendTransaction` resolves with `{ success:true, txHash:"0x…" }` (NOT `{approved:true}` without a hash). The popup may close before mining; the dApp promise resolves when proving+mining finish (≤15 min).
  - The website then polls `getWithdrawProof(txHash)` → resolves with `{ blockNumber, leafIndex, path }`, and the L1 `withdraw(...)` claim **succeeds** (proves content-hash parity).

- [ ] **Step 3: Balance auto-select**
  - Account with private cbETH ≥ amount → console shows exit `(private)`.
  - Account with only public cbETH ≥ amount → exit `(public)`.
  - Amount > both balances → `sendTransaction` rejects with "Insufficient bridged balance…", no tx sent.

- [ ] **Step 4: Guards**
  - Locked wallet → `sendTransaction` returns WALLET_LOCKED, popup not opened for execution.
  - Reject in popup → `sendTransaction` rejects with the rejection error.

- [ ] **Step 5: No regression**
  - A normal `@aztec/wallet-sdk` dApp `sendTx` still works (wallet-sdk channel untouched).
  - `connect()`/`getAddress()` still return the active address.

- [ ] **Step 6: Record results in the PR description.**

---

## Self-Review Notes (resolved during planning)
- **L2Client not imported:** its `.send()` return handling (`receipt.txHash`) predates 4.3.0's `{ receipt, ... }` shape (offscreen uses `sendResult.receipt.txHash`). The offscreen handler calls the bridge contract directly with that pattern; content-hash parity is on-chain.
- **Params pinned:** `l1Token=0x0…0` (ETH), `callerOnL1=recipient` (website L1 claim uses `withCaller=true`, claimed by the recipient wallet), `nonce=0` (burning own balance). The E2E L1 claim success in Task 6 is the parity proof.
- **Timeout:** inpage provider request timeout raised 300s→900s so proving doesn't trip a premature reject; offscreen `.send` wait is 600s.
- **Type consistency:** `selectExitMode(privateBal, publicBal, amount) → "private"|"public"|null`; `executeBridgeExit(data:{amount,recipient}) → {success,txHash,blockNumber,mode}`; message type `PXE_BRIDGE_EXIT`; sign-request `kind:"bridge_exit"` set in `handleProviderMethod` and read in `SIGN_APPROVE` — consistent across Tasks 1–5.
- **Account registration:** mirrors `executeTransfer` (assumes the active account is registered; no lazy re-register). If E2E shows an empty PXE after SW eviction, that's a separate robustness follow-up.
