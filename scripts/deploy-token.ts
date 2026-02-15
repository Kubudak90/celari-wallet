#!/usr/bin/env npx tsx
/**
 * Celari Wallet -- Deploy Test Token & Mint to Account
 *
 * Deploys a TokenContract on testnet, mints tokens to our deployed account,
 * and verifies the account exists on-chain.
 *
 * Usage:
 *   yarn deploy:token
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { TestWallet } from "@aztec/test-wallet/server";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NODE_URL = process.env.AZTEC_NODE_URL || "https://rpc.testnet.aztec-labs.com/";

async function main() {
  console.log("Celari Wallet -- Token Deploy & Account Verify\n");

  // 1. Load deployed account info
  const infoPath = join(__dirname, "..", ".celari-passkey-account.json");
  const accountInfo = JSON.parse(readFileSync(infoPath, "utf-8"));
  const accountAddress = AztecAddress.fromString(accountInfo.address);
  console.log(`Account: ${accountAddress.toString().slice(0, 22)}...`);

  // 2. Load keys for signing
  const keysPath = join(__dirname, "..", ".celari-keys.json");
  const keys = JSON.parse(readFileSync(keysPath, "utf-8"));
  const privateKeyPkcs8 = new Uint8Array(Buffer.from(keys.privateKeyPkcs8, "base64"));
  const pubKeyXBuf = Buffer.from(keys.publicKeyX.replace("0x", ""), "hex");
  const pubKeyYBuf = Buffer.from(keys.publicKeyY.replace("0x", ""), "hex");

  // 3. Connect to node
  console.log(`\nConnecting to ${NODE_URL}...`);
  const node = createAztecNodeClient(NODE_URL);
  const wallet = await TestWallet.create(node, { proverEnabled: true });
  const chainInfo = await wallet.getChainInfo();
  console.log(`Connected -- Chain ${chainInfo.chainId}, Protocol v${chainInfo.version}`);

  // 4. Re-register our account in PXE
  console.log("\nRegistering account in PXE...");
  const { CelariPasskeyAccountContract } = await import("../src/utils/passkey_account.js");
  const accountContract = new CelariPasskeyAccountContract(
    pubKeyXBuf, pubKeyYBuf, undefined, privateKeyPkcs8,
  );
  const secretKey = Fr.fromHexString(accountInfo.secretKey);
  const salt = Fr.fromHexString(accountInfo.salt);

  const accountManager = await wallet.createAccount({
    secret: secretKey,
    salt,
    contract: accountContract,
  });

  // Verify address matches
  const derivedAddress = accountManager.address;
  if (derivedAddress.toString() !== accountAddress.toString()) {
    console.error(`Address mismatch! Expected ${accountAddress}, got ${derivedAddress}`);
    process.exit(1);
  }
  console.log("Account verified -- address matches on-chain deployment");

  // 5. Register SponsoredFPC
  console.log("\nRegistering SponsoredFPC...");
  const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
  const fpcInstance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    { salt: new Fr(0) },
  );
  await wallet.registerContract(fpcInstance, SponsoredFPCContract.artifact);
  const paymentMethod = new SponsoredFeePaymentMethod(fpcInstance.address);
  console.log(`SponsoredFPC: ${fpcInstance.address.toString().slice(0, 22)}...`);

  // 6. Deploy Token Contract (using TestWallet which has full Wallet interface)
  console.log("\nDeploying Celari Test Token (CLR)...");
  const { TokenContract } = await import("@aztec/noir-contracts.js/Token");

  // Use TestWallet's own address as admin so we can mint
  const walletAddresses = await wallet.getAccounts();
  const walletAddr = walletAddresses[0]?.item || accountAddress;
  console.log(`Admin (wallet): ${walletAddr.toString().slice(0, 22)}...`);

  const tokenDeploy = TokenContract.deploy(
    wallet,
    walletAddr,           // admin = TestWallet's address (so we can mint)
    "Celari Token",       // name
    "CLR",                // symbol
    18,                   // decimals
  );

  const tokenSentTx = await tokenDeploy.send({
    from: AztecAddress.ZERO,
    fee: { paymentMethod },
  });

  const tokenTxHash = await tokenSentTx.getTxHash();
  console.log(`Token deploy tx: ${tokenTxHash.toString().slice(0, 22)}...`);
  console.log("Waiting for confirmation... (30-120 sn)");

  const tokenReceipt = await tokenSentTx.wait({ timeout: 180_000 });
  const tokenAddress = tokenReceipt.contract.address;
  console.log(`\nToken deployed! Block: ${tokenReceipt.blockNumber}`);
  console.log(`Token address: ${tokenAddress.toString()}`);

  // 7. Mint tokens to our account (admin = wallet, mint to accountAddress)
  console.log("\nMinting 10,000 CLR to account...");
  const tokenContract = await TokenContract.at(tokenAddress, wallet);

  const mintTx = await tokenContract.methods
    .mint_to_public(accountAddress, 10_000n * 10n ** 18n)
    .send({ from: accountAddress, fee: { paymentMethod } });

  const mintTxHash = await mintTx.getTxHash();
  console.log(`Mint tx: ${mintTxHash.toString().slice(0, 22)}...`);

  const mintReceipt = await mintTx.wait({ timeout: 180_000 });
  console.log(`Minted! Block: ${mintReceipt.blockNumber}`);

  // 8. Check balance
  const balance = await tokenContract.methods.balance_of_public(accountAddress).simulate();
  console.log(`\nPublic balance: ${balance.toString()} (raw)`);
  console.log(`              = ${Number(balance) / 1e18} CLR`);

  // 10. Get current block number
  const blockNumber = await node.getBlockNumber();
  console.log(`\nCurrent testnet block: ${blockNumber}`);

  // 11. Save token info
  const tokenInfo = {
    tokenAddress: tokenAddress.toString(),
    name: "Celari Token",
    symbol: "CLR",
    decimals: 18,
    admin: walletAddr.toString(),
    network: "testnet",
    deployTxHash: tokenTxHash.toString(),
    deployBlock: tokenReceipt.blockNumber?.toString(),
    mintTxHash: mintTxHash.toString(),
    mintBlock: mintReceipt.blockNumber?.toString(),
    deployedAt: new Date().toISOString(),
  };

  const tokenPath = join(__dirname, "..", ".celari-token.json");
  writeFileSync(tokenPath, JSON.stringify(tokenInfo, null, 2));
  console.log(`\nToken info saved to ${tokenPath}`);

  console.log("\n--- Summary ---");
  console.log(`Account: ${accountAddress.toString()}`);
  console.log(`Token:   ${tokenAddress.toString()}`);
  console.log(`Balance: 10,000 CLR`);
  console.log(`Network: testnet`);
}

main().catch((e) => {
  console.error("\nFailed:", e.message || e);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
