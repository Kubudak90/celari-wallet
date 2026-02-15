#!/usr/bin/env npx tsx
/**
 * Mint CLR tokens to our deployed account using the existing Token contract.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { TestWallet } from "@aztec/test-wallet/server";

import { CelariPasskeyAccountContract } from "../src/utils/passkey_account.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NODE_URL = "https://rpc.testnet.aztec-labs.com/";
const TOKEN_ADDRESS = "0x11d3dcb0190a88a1520d4241a97e67f495cb246f12a0a26a2e977e2237820fe6";

async function main() {
  console.log("Celari -- Mint CLR Tokens\n");

  // Load account info
  const accountInfo = JSON.parse(readFileSync(join(__dirname, "..", ".celari-passkey-account.json"), "utf-8"));
  const accountAddress = AztecAddress.fromString(accountInfo.address);
  const keys = JSON.parse(readFileSync(join(__dirname, "..", ".celari-keys.json"), "utf-8"));

  // Connect
  console.log("Connecting...");
  const node = createAztecNodeClient(NODE_URL);
  const wallet = await TestWallet.create(node, { proverEnabled: true });

  // Register account
  const accountContract = new CelariPasskeyAccountContract(
    Buffer.from(keys.publicKeyX.replace("0x", ""), "hex"),
    Buffer.from(keys.publicKeyY.replace("0x", ""), "hex"),
    undefined,
    new Uint8Array(Buffer.from(keys.privateKeyPkcs8, "base64")),
  );
  await wallet.createAccount({
    secret: Fr.fromHexString(accountInfo.secretKey),
    salt: Fr.fromHexString(accountInfo.salt),
    contract: accountContract,
  });
  console.log(`Account: ${accountAddress.toString().slice(0, 22)}...`);

  // Register SponsoredFPC
  const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
  const fpcInstance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact, { salt: new Fr(0) },
  );
  await wallet.registerContract(fpcInstance, SponsoredFPCContract.artifact);
  const paymentMethod = new SponsoredFeePaymentMethod(fpcInstance.address);

  // Load Token contract at existing address
  const { TokenContract } = await import("@aztec/noir-contracts.js/Token");
  const tokenAddress = AztecAddress.fromString(TOKEN_ADDRESS);
  const token = await TokenContract.at(tokenAddress, wallet);
  console.log(`Token: ${tokenAddress.toString().slice(0, 22)}...`);

  // Mint
  console.log("\nMinting 10,000 CLR...");
  const mintTx = await token.methods
    .mint_to_public(accountAddress, 10_000n * 10n ** 18n)
    .send({ from: accountAddress, fee: { paymentMethod } });

  const txHash = await mintTx.getTxHash();
  console.log(`TX: ${txHash.toString().slice(0, 22)}...`);

  const receipt = await mintTx.wait({ timeout: 180_000 });
  console.log(`Minted! Block: ${receipt.blockNumber}`);

  // Check balance
  const balance = await token.methods.balance_of_public(accountAddress).simulate();
  console.log(`Balance: ${Number(balance) / 1e18} CLR`);
}

main().catch((e) => {
  console.error("Failed:", e.message || e);
  process.exit(1);
});
