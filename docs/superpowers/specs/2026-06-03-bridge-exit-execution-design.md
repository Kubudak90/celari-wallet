# Bridge Exit (L2 Withdraw) Execution — Design

- **Date:** 2026-06-03
- **Status:** Approved design — ready for implementation plan
- **Branch:** `feat/secure-transport-phase1` (continues the secure-transport work; depends on its `handleProviderMethod`)
- **Depends on:** Phase 1 secure transport (encrypted `window.celari` provider channel + `handleProviderMethod` + `pendingSignRequests` sign-popup flow)

---

## 1. Background & Motivation

Phase 1 secured the `window.celari` channel and fixed `getWithdrawProof` routing, but surfaced a gap: `window.celari.sendTransaction({type:"bridge_exit",...})` is a **stub**. The `DAPP_SIGN` path opens the confirm popup and on approve returns `{success:true, approved:true}` with **no `txHash` and no PXE execution** (`background.js` `handleProviderMethod` / `SIGN_APPROVE`). The website (`website/src/hooks/useWithdrawFlow.ts:37-47`) needs `l2Result.txHash` to then poll `getWithdrawProof(exitTxHash)` and perform the L1 claim. So **bridge withdraw cannot complete end-to-end** until `sendTransaction(bridge_exit)` actually executes the L2 exit and returns a real txHash.

### What already exists (verified)
- **Tx-execution pattern:** `offscreen.js` `executeTransfer` (`:751-847`) builds a call, `.send({wait})`, returns `{txHash, blockNumber}`. Handlers like `PXE_TRANSFER`/`PXE_FAUCET`/`PXE_DEPLOY_ACCOUNT` already return txHashes.
- **Bridge exit logic:** `bridge/sdk/l2-client.ts` `L2Client.exitToL1Public(wallet, bridgeArtifact, params, paymentMethod)` (`:274-314`) and `exitToL1Private(wallet, bridgeArtifact, params, tokenAddress, paymentMethod)` (`:326-368`) call `Contract.at(bridgeAddress, artifact, wallet).methods.exit_to_l1_*(...).send({from, fee, wait:{timeout:300_000}})` and return `{success, txHash, blockNumber}`. `ExitParams = { l1Token, recipient, amount: bigint, callerOnL1, nonce: bigint }`. The artifact is passed in (not loaded internally). Content-hash correctness lives in `bridge/sdk/content-hash.ts` and is exercised by `bridge/scripts/test-bridge.ts`.
- **Deployed addresses** (`.celari-bridge-l2.json`, mirrored in `website/src/lib/constants.ts`): tokenBridge `0x0f7bef04f49d62c55d01d156d114786cc6d0d9c2e8f7835e29cd9a6dc6c996d5`, bridgedToken (cbETH) `0x0e6e89fdd236fad5a3a7b93ec8076ebfad0c086ca5e7f5eb00b91023b2a4d268`, l1Portal `0x54b844835905B303d9618Ceb502601993040259B`.
- **Artifact:** `bridge/contracts/l2/celari_token_bridge/target/celari_token_bridge-CelariTokenBridge.json` (and `bridged_token-BridgedToken.json`).
- **`getWithdrawProof` works** given a real txHash (`background.js` `handleGetWithdrawProof` queries node receipt/block/outbox proof).

---

## 2. Goals / Non-Goals

### Goals
1. `window.celari.sendTransaction({type:"bridge_exit", amount, recipient})` executes the L2 exit via the offscreen PXE and resolves with `{success:true, txHash}`.
2. **Auto-select** exit mode by balance: private balance ≥ amount → `exit_to_l1_private`; else public balance ≥ amount → `exit_to_l1_public`; else a clear "insufficient balance" error.
3. The exit requires explicit **user confirmation** (value-moving) via the existing sign popup, showing the withdraw details.
4. Content-hash / `callerOnL1` / `nonce` match the website's L1 claim (`getWithdrawCalldata`, `withCaller=true`) so the L1 claim succeeds.
5. Reuse the bridge **contract's** exit methods (`exit_to_l1_public`/`exit_to_l1_private`) with parameters matching the L1 claim. **Refinement (found during plan prep):** call the contract directly via `Contract.at(...).methods.exit_to_l1_*().send(...)` using the offscreen 4.3.0 send pattern — do **not** import `bridge/sdk` `L2Client`, because its `.send()` return handling (`receipt.txHash`) predates 4.3.0's `{ receipt, ... }` shape (offscreen uses `sendResult.receipt.txHash`, see `offscreen.js:837-846`). Content-hash parity is guaranteed **on-chain** by the contract computing it from the params we pass — so correctness depends on matching params, not on the JS wrapper.

### Non-Goals
- Arbitrary `sendTransaction` types other than `bridge_exit` (the wallet-sdk channel owns generic `sendTx`). YAGNI.
- Multi-token withdraw beyond the deployed bridged token (cbETH / L1 ETH). The website withdraws ETH only.
- The L1 claim itself (the website does that with wagmi).

---

## 3. Design

### 3.1 End-to-end flow
1. inpage `sendTransaction({type:"bridge_exit", amount, recipient})` → `sendRequest("DAPP_SIGN", { transaction })` (inpage unchanged).
2. background `handleProviderMethod` `DAPP_SIGN`: if `payload.transaction.type === "bridge_exit"` → lock check (WALLET_LOCKED if locked) → park a `pendingSignRequests` entry tagged `{ kind:"bridge_exit", payload }` → open `popup.html?confirm=<signId>`.
3. Popup `confirm-tx` shows withdraw details (amount + L1 recipient). User approves → `SIGN_APPROVE`; rejects → `SIGN_REJECT`.
4. background `SIGN_APPROVE`: if the pending entry is `kind:"bridge_exit"`, call `sendToPXE({ type:"PXE_BRIDGE_EXIT", data:{ amount, recipient } })`, then `pending.sendResponse({ success, txHash })` (routes over the encrypted provider channel). On error → `{ success:false, error }`.
5. inpage resolves `sendTransaction` with `{ success, txHash }`; the website proceeds to `getWithdrawProof(txHash)` (already working) and the L1 claim.

### 3.2 offscreen `PXE_BRIDGE_EXIT` handler
- Ensure the active account wallet is available (reuse `ensureAccountFromBundle` / existing account-setup path).
- Set up SponsoredFPC payment method (reuse `setupSponsoredFPC`, as `executeTransfer` does).
- Register the bridge + bridged-token contracts in the PXE (`Contract.at` / `registerContract`) with the bundled artifacts.
- **Select exit mode:** read the active account's **private** then **public** balance of the bridged token (reuse offscreen balance helpers / `L2Client.getBalance`), then call `selectExitMode(privateBal, publicBal, amount)`.
- Call `Contract.at(tokenBridgeAddr, CelariTokenBridgeArtifact, acctWallet).methods.exit_to_l1_public(l1Token, recipient, amount, callerOnL1, nonce)` (public) or `.exit_to_l1_private(bridgedTokenAddr, l1Token, recipient, amount, callerOnL1, nonce)` (private), `.send({ from, fee:{ paymentMethod, estimateGas:true, estimatedGasPadding:0.1 }, wait:{ timeout: 600_000 } })`, then read `sendResult.receipt.txHash` (4.3.0 shape).
- Params: `l1Token = 0x0000…0000` (ETH), `recipient` (from data), `amount = BigInt(data.amount)` (wei), `callerOnL1 = recipient`, `nonce = 0` (see §3.5).
- Return `{ success:true, txHash, blockNumber }` or `{ success:false, error }`.

### 3.3 New small units (testable / single-responsibility)
- **`extension/public/src/lib/bridge-config.js`** — exports the deployed addresses (tokenBridge, bridgedToken, l1Portal, l1 ETH token) as constants, matching `.celari-bridge-l2.json` / `website/src/lib/constants.ts`. (Hardcoded like the existing SponsoredFPC/network constants.)
- **`extension/public/src/lib/bridge-exit-select.js`** — pure `selectExitMode(privateBal, publicBal, amount)` → `"private" | "public" | null`. Unit-tested.

### 3.4 background changes
- `handleProviderMethod` `DAPP_SIGN`: branch on `payload.transaction.type === "bridge_exit"` to tag the pending request `kind:"bridge_exit"`. Non-bridge DAPP_SIGN keeps current behavior.
- `SIGN_APPROVE`: if `pending.kind === "bridge_exit"`, `await sendToPXE(PXE_BRIDGE_EXIT)` and respond with `{success, txHash}`; otherwise unchanged.

### 3.5 Correctness-critical: content hash / callerOnL1 / nonce
The L2 exit emits an L2→L1 message whose content hash must equal what the L1 portal `withdraw(...)` recomputes. The website calls `getWithdrawCalldata(ETH, l1Address, amount, /*withCaller*/ true, blockNumber, leafIndex, path)`. The plan will set `ExitParams.callerOnL1` and `nonce` to exactly match the working round-trip in `bridge/scripts/test-bridge.ts` and `bridge/sdk/content-hash.ts:computeWithdrawContentHash`, and verify parity against the website's L1 claim params. This is the highest-risk correctness item and gets explicit verification in the plan.

### 3.6 Artifact bundling
offscreen imports `CelariTokenBridge` (and `BridgedToken` if needed for balance/burn) artifact JSON and `L2Client` from `bridge/sdk`. offscreen is built `bundle:true`, so esbuild inlines them. Confirm the build succeeds and the bundle loads (artifacts are large but offscreen already bundles multi-MB artifacts).

### 3.7 Error handling & security
- Locked wallet → `{success:false, error:"Wallet is locked", code:"WALLET_LOCKED"}` before parking.
- User rejects → `{success:false, error:"User rejected..."}`.
- Insufficient balance (selectExitMode → null) → `{success:false, error:"Insufficient balance to withdraw <amount>"}`.
- Execution requires the confirm popup — no auto-execution of a value-moving tx.
- Long proving: client-side WASM proving can take minutes. The exit `.send({wait})` uses a 600s timeout, and the inpage provider request timeout is raised from 300s to **900s** so the dApp promise does not time out before the response arrives (harmless for fast reads). The popup closes on approve; the tx proves/mines in the background and the response arrives over the encrypted channel.

---

## 4. Verification

- **Unit:** `selectExitMode` — private-sufficient → "private"; private-insufficient/public-sufficient → "public"; both insufficient → null; amount as bigint.
- **Manual E2E (live testnet, real funds — cannot be automated):**
  1. Deposit (or hold) cbETH on L2 in the active account.
  2. Website withdraw: `sendTransaction(bridge_exit)` opens the confirm popup showing amount + L1 recipient; approve → resolves with a real `txHash` (no `{approved:true}`-without-hash).
  3. `getWithdrawProof(txHash)` resolves; the website L1 claim (`withdraw(...)`) **succeeds** — proving content-hash parity.
  4. Private-balance account uses private exit; public-only account uses public exit; zero balance → clean error.
- **Build:** `node extension/build.mjs` succeeds with the bridge artifacts/SDK bundled into offscreen.

---

## 5. Files Touched
- `extension/public/src/offscreen.js` — new `PXE_BRIDGE_EXIT` handler; import `L2Client` + bridge artifact(s); balance-based selection; SponsoredFPC.
- `extension/public/src/background.js` — `handleProviderMethod` bridge_exit branch; `SIGN_APPROVE` executes bridge exit and returns txHash.
- `extension/public/src/lib/bridge-config.js` — new (addresses).
- `extension/public/src/lib/bridge-exit-select.js` — new (pure selector) + `extension/test/bridge-exit-select.test.ts`.
- `extension/public/src/pages/popup.js` — `confirm-tx` shows bridge-withdraw details.
- `extension/public/src/inpage.js` — raise the provider request timeout 300s → 900s (proving headroom).
- Build: artifact bundling verified (no script change expected; offscreen is already `bundle:true`).

## 6. Out of Scope
- Generic `sendTransaction` types (wallet-sdk channel handles `sendTx`).
- L1 claim (website/wagmi).
- Phase 2 (ecosystem parity) and Phase 3 (COOP/COEP + sidePanel).
