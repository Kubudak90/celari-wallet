#!/usr/bin/env npx tsx
/**
 * Celari Bridge — Deploy L2 Contracts to Aztec TESTNET (funded fresh account)
 *
 * Unlike deploy-l2.ts (which assumes an external PXE / sandbox), this runs an
 * EmbeddedWallet with an in-process prover (same approach as scripts/deploy-server.ts,
 * proven on testnet) so it can deploy without a separate PXE.
 *
 * Flow:
 *   1. Generate a fresh SingleKey deployer account (or reuse DEPLOYER_SECRET_KEY).
 *   2. Claim Fee Juice for it from the Quetzal faucet (faucet.quetzaldex.xyz).
 *   3. Deploy the account via FeeJuicePaymentMethodWithClaim (account ends up FUNDED).
 *   4. Deploy BridgedToken + CelariTokenBridge (paid by the account's Fee Juice),
 *      binding the bridge to the single L1 token (L1_TOKEN) per the C2 fix.
 *   5. Save bridge/.l2-deployment.json and append DEPLOYER_SECRET_KEY to bridge/.l2-deployer.json.
 *
 * Env:
 *   AZTEC_NODE_URL      — testnet node RPC (e.g. https://rpc.testnet.aztec-labs.com/)
 *   PORTAL_ADDRESS      — L1 CelariBridgePortal (from deploy-l1.ts deploy)
 *   L1_TOKEN            — the single L1 ERC-20 this bridge binds to (0x..40 hex)
 *   DEPLOYER_SECRET_KEY — optional; if unset a fresh account is generated + saved
 */

import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { Fr, GrumpkinScalar } from "@aztec/aztec.js/fields";
import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
import { Contract } from "@aztec/aztec.js/contracts";
import { loadContractArtifact } from "@aztec/aztec.js/abi";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { AccountManager } from "@aztec/aztec.js/wallet";
import { SchnorrAccountContract } from "@aztec/accounts/schnorr";
import { NO_FROM } from "@aztec/aztec.js/account";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { GasSettings } from "@aztec/stdlib/gas";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
// @ts-ignore — plain ESM helper, no types
import { requestQuetzalDrip } from "../../extension/public/src/lib/quetzal-faucet.js";

const NODE_URL = process.env.AZTEC_NODE_URL || "https://rpc.testnet.aztec-labs.com/";
const PORTAL_ADDRESS = process.env.PORTAL_ADDRESS;
const L1_TOKEN = process.env.L1_TOKEN;
let DEPLOYER_SECRET_KEY = process.env.DEPLOYER_SECRET_KEY;

const ROOT = join(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..", "..");
function artifact(rel: string) {
  return loadContractArtifact(JSON.parse(readFileSync(join(ROOT, rel), "utf-8")));
}

function requireEnv(name: string, v: string | undefined): string {
  if (!v) {
    console.error(`Error: ${name} required`);
    process.exit(1);
  }
  return v;
}

async function gasSettings(node: any) {
  const currentFees = await node.getCurrentMinFees();
  return GasSettings.fallback({ maxFeesPerGas: currentFees.mul(2) });
}

async function main() {
  requireEnv("PORTAL_ADDRESS", PORTAL_ADDRESS);
  requireEnv("L1_TOKEN", L1_TOKEN);

  console.log("╔═══════════════════════════════════════════╗");
  console.log("║  Celari Bridge — L2 Deployment (testnet)  ║");
  console.log("╚═══════════════════════════════════════════╝\n");
  console.log("Node:    ", NODE_URL);
  console.log("Portal:  ", PORTAL_ADDRESS);
  console.log("L1 token:", L1_TOKEN, "\n");

  // ── Embedded wallet + in-process prover (no external PXE needed) ──
  console.log("Creating EmbeddedWallet (in-process prover)...");
  const node = createAztecNodeClient(NODE_URL);
  const wallet = await EmbeddedWallet.create(node, { pxeConfig: { proverEnabled: true } });
  const info = await wallet.getChainInfo();
  console.log(`Connected — chainId ${info.chainId}, protocol v${info.version}\n`);

  // ── Fresh (or reused) SingleKey deployer account ──
  const generated = !DEPLOYER_SECRET_KEY;
  const secretKey = DEPLOYER_SECRET_KEY ? Fr.fromHexString(DEPLOYER_SECRET_KEY) : Fr.random();
  const signingKey = process.env.DEPLOYER_SIGNING_KEY
    ? GrumpkinScalar.fromString(process.env.DEPLOYER_SIGNING_KEY)
    : GrumpkinScalar.random();
  DEPLOYER_SECRET_KEY = secretKey.toString();
  const salt = Fr.random();
  const accountContract = new SchnorrAccountContract(signingKey);
  const manager = await AccountManager.create(wallet, secretKey, accountContract, salt);
  const address = manager.address;
  console.log(`Deployer account ${generated ? "(fresh Schnorr)" : "(reused)"}:`, address.toString());
  // Persist the deployer keys immediately so a fresh account is never lost.
  writeFileSync(join(ROOT, "bridge", ".l2-deployer.json"), JSON.stringify({
    address: address.toString(),
    secretKey: DEPLOYER_SECRET_KEY,
    signingKey: signingKey.toString(),
    salt: salt.toString(),
    createdAt: new Date().toISOString(),
  }, null, 2));
  console.log("  (secret saved to bridge/.l2-deployer.json)\n");

  // ── Claim Fee Juice from the Quetzal faucet for this address ──
  console.log("Claiming Fee Juice from Quetzal faucet for the deployer...");
  const drip = await requestQuetzalDrip(address.toString());
  console.log(`  Fee Juice claim received (amount ${drip.claim.claimAmount}, leafIndex ${drip.claim.messageLeafIndex})\n`);

  // ── Deploy the account (paid by the Fee Juice claim) ──
  console.log("Deploying deployer account via FeeJuicePaymentMethodWithClaim...");
  const claimPm = new FeeJuicePaymentMethodWithClaim(address, {
    claimAmount: BigInt(drip.claim.claimAmount),
    claimSecret: Fr.fromHexString(drip.claim.claimSecret),
    messageLeafIndex: BigInt(drip.claim.messageLeafIndex),
  });
  const deployMethod = await manager.getDeployMethod();
  const acctReceipt = await deployMethod.send({
    from: NO_FROM,
    fee: { paymentMethod: claimPm, gasSettings: await gasSettings(node) },
    wait: { timeout: 900_000 },
  });
  console.log(`  Account deployed — block ${acctReceipt.receipt?.blockNumber ?? "?"}\n`);

  // Per-account wallet: a Proxy so getAddress() resolves to the deployer account
  // while everything else delegates to the EmbeddedWallet (PXE + dispatch).
  const acctWallet: any = new Proxy(wallet, {
    get(target: any, prop) {
      if (prop === "getAddress") return () => address;
      const val = target[prop];
      return typeof val === "function" ? val.bind(target) : val;
    },
  });

  // Subsequent deploys are paid from the account's OWN Fee Juice balance (funded
  // by the claim above). In v4.3.0 FeeJuicePaymentMethod is gone — passing no
  // paymentMethod makes the wallet draw from the account's Fee Juice (the proven
  // offscreen pattern).
  const feeFromBalance = { estimateGas: true, estimatedGasPadding: 0.1 };

  // ── Deploy BridgedToken ──
  console.log("Deploying BridgedToken...");
  const bridgedTokenArtifact = artifact("bridge/contracts/l2/bridged_token/target/bridged_token-BridgedToken.json");
  const bridgedTokenTx = await Contract.deploy(acctWallet, bridgedTokenArtifact, [
    address,                 // admin
    "Celari Bridged ETH",    // name
    "cbETH",                 // symbol
    18,                      // decimals
  ]).send({ from: address, fee: feeFromBalance, wait: { timeout: 900_000 } });
  const bridgedTokenAddress = bridgedTokenTx.contract.address;
  console.log("  BridgedToken:", bridgedTokenAddress.toString(), "\n");

  // ── Deploy CelariTokenBridge (token, l1_token, portal) ──
  console.log("Deploying CelariTokenBridge...");
  const tokenBridgeArtifact = artifact("bridge/contracts/l2/celari_token_bridge/target/celari_token_bridge-CelariTokenBridge.json");
  const bridgeTx = await Contract.deploy(acctWallet, tokenBridgeArtifact, [
    bridgedTokenAddress,               // token (AztecAddress)
    EthAddress.fromString(L1_TOKEN!),  // l1_token (bound L1 ERC-20)
    EthAddress.fromString(PORTAL_ADDRESS!), // portal (L1 CelariBridgePortal)
  ]).send({ from: address, fee: feeFromBalance, wait: { timeout: 900_000 } });
  const bridgeAddress = bridgeTx.contract.address;
  console.log("  CelariTokenBridge:", bridgeAddress.toString(), "\n");

  // ── Save deployment ──
  writeFileSync(join(ROOT, "bridge", ".l2-deployment.json"), JSON.stringify({
    network: "testnet",
    nodeUrl: NODE_URL,
    deployer: address.toString(),
    bridgedTokenAddress: bridgedTokenAddress.toString(),
    bridgeAddress: bridgeAddress.toString(),
    l1Token: L1_TOKEN,
    portalAddress: PORTAL_ADDRESS,
    deployedAt: new Date().toISOString(),
    status: "deployed",
  }, null, 2));

  console.log("╔═══════════════════════════════════════════╗");
  console.log("║           L2 Deployment Complete!         ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log("BridgedToken:      ", bridgedTokenAddress.toString());
  console.log("CelariTokenBridge: ", bridgeAddress.toString());
  console.log("Deployer:          ", address.toString());
  console.log();
  console.log("Next — initialize the L1 portal with this L2 bridge:");
  console.log(`  L2_BRIDGE_ADDRESS=${bridgeAddress.toString()} \\`);
  console.log(`    SEPOLIA_RPC_URL=... PRIVATE_KEY=... npx tsx bridge/scripts/deploy-l1.ts init`);
}

main().catch((err) => {
  console.error("\nL2 deployment failed:", err?.message || err);
  process.exit(1);
});
