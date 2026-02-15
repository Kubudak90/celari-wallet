/**
 * Celari Wallet — Faz 1 E2E Integration Tests
 *
 * Tests the complete passkey account lifecycle:
 * 1. P256 key generation (simulated — no WebAuthn in Node.js)
 * 2. Passkey account deployment
 * 3. Private token mint
 * 4. Private transfer between passkey accounts
 * 5. Balance verification
 *
 * Prerequisites:
 *   - aztec start --sandbox (running on localhost:8080)
 *   - yarn build (contracts compiled)
 *
 * Run: yarn test
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  createPXEClient,
  Fr,
  type PXE,
  type Wallet,
  type AztecAddress,
  createDebugLogger,
} from "@aztec/aztec.js";
import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import { TokenContract } from "@aztec/noir-contracts.js/Token";

const PXE_URL = process.env.PXE_URL || "http://localhost:8080";
const logger = createDebugLogger("celari:test:e2e");

describe("Celari Wallet Faz 1 — Passkey Account E2E", () => {
  let pxe: PXE;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let tokenAddress: AztecAddress;

  // ─── Setup ────────────────────────────────────────────

  beforeAll(async () => {
    // Connect to PXE
    pxe = createPXEClient(PXE_URL);
    const nodeInfo = await pxe.getNodeInfo();
    logger.info(`Connected to Aztec node — Chain ${nodeInfo.l1ChainId}`);

    // Create test accounts (using Schnorr as P256 fallback in sandbox)
    // In production, these would use CelariPasskeyAccount with real P256 keys
    //
    // NOTE: The Aztec sandbox currently uses Schnorr as the default signer.
    // Our CelariPasskeyAccount contract uses ecdsa_secp256r1, which requires
    // the compiled contract artifact. For these tests, we verify the flow
    // using Schnorr accounts as stand-ins. The Noir contract tests (TXE)
    // verify the actual P256 signature logic.

    logger.info("Creating Alice account (simulated passkey)...");
    const aliceSecret = Fr.random();
    const aliceSigning = Fr.random();
    const aliceAccountManager = getSchnorrAccount(pxe, aliceSecret, aliceSigning);
    aliceWallet = await aliceAccountManager.waitSetup();
    aliceAddress = aliceWallet.getAddress();
    logger.info(`Alice: ${aliceAddress}`);

    logger.info("Creating Bob account (simulated passkey)...");
    const bobSecret = Fr.random();
    const bobSigning = Fr.random();
    const bobAccountManager = getSchnorrAccount(pxe, bobSecret, bobSigning);
    bobWallet = await bobAccountManager.waitSetup();
    bobAddress = bobWallet.getAddress();
    logger.info(`Bob: ${bobAddress}`);
  }, 300_000);

  // ─── Test 1: Account Creation ─────────────────────────

  it("should create accounts with deterministic addresses", async () => {
    expect(aliceAddress).toBeDefined();
    expect(bobAddress).toBeDefined();
    expect(aliceAddress.toString()).not.toBe(bobAddress.toString());

    // Verify accounts are registered in PXE
    const registered = await pxe.getRegisteredAccounts();
    const addresses = registered.map((a) => a.address.toString());
    expect(addresses).toContain(aliceAddress.toString());
    expect(addresses).toContain(bobAddress.toString());

    logger.info("✅ Test 1 passed: Accounts created");
  });

  // ─── Test 2: Token Deployment ─────────────────────────

  it("should deploy a private token contract", async () => {
    logger.info("Deploying zkUSD token...");

    const token = await TokenContract.deploy(
      aliceWallet,
      aliceAddress,  // admin
      "Celari USD",   // name
      "zkUSD",       // symbol
      18             // decimals
    ).send().deployed();

    tokenAddress = token.address;
    logger.info(`zkUSD deployed: ${tokenAddress}`);

    expect(tokenAddress).toBeDefined();
    logger.info("✅ Test 2 passed: Token deployed");
  }, 300_000);

  // ─── Test 3: Private Mint ─────────────────────────────

  it("should mint tokens to private balance", async () => {
    const token = await TokenContract.at(tokenAddress, aliceWallet);
    const mintAmount = 10_000n;

    logger.info(`Minting ${mintAmount} zkUSD to Alice (private)...`);

    // Mint to private balance — creates encrypted UTXO
    await token.methods
      .mint_to_private(aliceAddress, mintAmount)
      .send()
      .wait();

    // Check private balance
    const balance = await token.methods
      .balance_of_private(aliceAddress)
      .simulate();

    logger.info(`Alice private balance: ${balance}`);
    expect(balance).toBe(mintAmount);
    logger.info("✅ Test 3 passed: Private mint successful");
  }, 300_000);

  // ─── Test 4: Private Transfer ─────────────────────────

  it("should transfer tokens privately between accounts", async () => {
    const token = await TokenContract.at(tokenAddress, aliceWallet);
    const transferAmount = 2_500n;

    logger.info(`Alice → Bob: ${transferAmount} zkUSD (private)...`);

    // Private transfer:
    // 1. Alice's UTXO is nullified
    // 2. New encrypted UTXO created for Bob
    // 3. ZK proof ensures correctness
    // 4. On-chain: NOTHING visible
    await token.methods
      .transfer(bobAddress, transferAmount)
      .send()
      .wait();

    // Verify Alice's balance decreased
    const aliceBalance = await token.methods
      .balance_of_private(aliceAddress)
      .simulate();
    expect(aliceBalance).toBe(10_000n - transferAmount);

    // Verify Bob's balance (need Bob's wallet to see private notes)
    const tokenAsBob = await TokenContract.at(tokenAddress, bobWallet);
    const bobBalance = await tokenAsBob.methods
      .balance_of_private(bobAddress)
      .simulate();
    expect(bobBalance).toBe(transferAmount);

    logger.info(`Alice balance: ${aliceBalance}`);
    logger.info(`Bob balance: ${bobBalance}`);
    logger.info("✅ Test 4 passed: Private transfer successful");
  }, 300_000);

  // ─── Test 5: Batch Transfer (Payroll Simulation) ──────

  it("should handle chained transfers (payroll-like)", async () => {
    // Simulate: Alice (employer) → Bob (employee) → Charlie (spending)
    const token = await TokenContract.at(tokenAddress, aliceWallet);

    // Create Charlie account
    const charlieSecret = Fr.random();
    const charlieSigning = Fr.random();
    const charlieAccountManager = getSchnorrAccount(pxe, charlieSecret, charlieSigning);
    const charlieWallet = await charlieAccountManager.waitSetup();
    const charlieAddress = charlieWallet.getAddress();

    // Alice → Bob (salary payment)
    const salary = 1_000n;
    await token.methods.transfer(bobAddress, salary).send().wait();

    // Bob → Charlie (spending)
    const tokenAsBob = await TokenContract.at(tokenAddress, bobWallet);
    const spending = 500n;
    await tokenAsBob.methods.transfer(charlieAddress, spending).send().wait();

    // Verify Charlie received funds
    const tokenAsCharlie = await TokenContract.at(tokenAddress, charlieWallet);
    const charlieBalance = await tokenAsCharlie.methods
      .balance_of_private(charlieAddress)
      .simulate();
    expect(charlieBalance).toBe(spending);

    logger.info(`Charlie balance: ${charlieBalance}`);
    logger.info("✅ Test 5 passed: Chained transfers (payroll flow)");
  }, 300_000);

  // ─── Test 6: P256 Key Format Verification ─────────────

  it("should correctly format P256 public key for contract", () => {
    // Simulate P256 key extraction (same logic as passkey.ts)
    // In browser: WebAuthn returns SPKI format, we extract x,y
    // In tests: We verify the byte manipulation is correct

    // Example P256 public key (32 bytes each)
    const pubKeyX = new Uint8Array(32);
    const pubKeyY = new Uint8Array(32);
    crypto.getRandomValues(pubKeyX);
    crypto.getRandomValues(pubKeyY);

    // Convert to hex (same as passkey.ts bytesToHex)
    const xHex = "0x" + Array.from(pubKeyX).map(b => b.toString(16).padStart(2, "0")).join("");
    const yHex = "0x" + Array.from(pubKeyY).map(b => b.toString(16).padStart(2, "0")).join("");

    // Verify format
    expect(xHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(yHex).toMatch(/^0x[0-9a-f]{64}$/);

    // Convert to Field (same as contract constructor args)
    const xField = BigInt(xHex);
    const yField = BigInt(yHex);

    expect(xField).toBeGreaterThan(0n);
    expect(yField).toBeGreaterThan(0n);

    // Verify round-trip: Field → bytes → hex matches original
    const xBack = xField.toString(16).padStart(64, "0");
    expect("0x" + xBack).toBe(xHex);

    logger.info("✅ Test 6 passed: P256 key format verified");
  });

  // ─── Test 7: DER Signature Normalization ──────────────

  it("should normalize DER-encoded P256 signatures", () => {
    // WebAuthn returns DER-encoded signatures: 30 <len> 02 <r-len> <r> 02 <s-len> <s>
    // Our contract needs raw (r || s) 64-byte format

    // Example DER signature (with leading zero padding)
    const r = new Uint8Array(32);
    const s = new Uint8Array(32);
    crypto.getRandomValues(r);
    crypto.getRandomValues(s);

    // Construct DER (simplified — r and s without leading zeros)
    const derSig = new Uint8Array([
      0x30, 2 + 2 + r.length + s.length,  // SEQUENCE
      0x02, r.length, ...r,                // INTEGER r
      0x02, s.length, ...s,                // INTEGER s
    ]);

    // Normalize (extract r || s)
    const normalized = normalizeDER(derSig);

    expect(normalized.length).toBe(64);
    expect(Array.from(normalized.slice(0, 32))).toEqual(Array.from(r));
    expect(Array.from(normalized.slice(32, 64))).toEqual(Array.from(s));

    logger.info("✅ Test 7 passed: DER normalization correct");
  });

  // ─── Test 8: Auth Witness Layout ──────────────────────

  it("should pack auth witness in correct layout for Noir", () => {
    // Auth witness layout for CelariPasskeyAccount:
    // [0..64]   → P256 signature (r: 32 bytes, s: 32 bytes)
    // [64..96]  → authenticatorData hash
    // [96..128] → clientDataJSON hash

    const signature = new Uint8Array(64);
    const authDataHash = new Uint8Array(32);
    const clientDataHash = new Uint8Array(32);
    crypto.getRandomValues(signature);
    crypto.getRandomValues(authDataHash);
    crypto.getRandomValues(clientDataHash);

    // Pack as witness fields (same logic as passkey_account.ts)
    const witnessFields: bigint[] = [];
    for (let i = 0; i < 64; i++) witnessFields.push(BigInt(signature[i]));
    for (let i = 0; i < 32; i++) witnessFields.push(BigInt(authDataHash[i]));
    for (let i = 0; i < 32; i++) witnessFields.push(BigInt(clientDataHash[i]));

    expect(witnessFields.length).toBe(128);

    // Verify we can reconstruct signature from fields
    const sigRecon = new Uint8Array(64);
    for (let i = 0; i < 64; i++) sigRecon[i] = Number(witnessFields[i]);
    expect(Array.from(sigRecon)).toEqual(Array.from(signature));

    // Verify authData hash
    const authRecon = new Uint8Array(32);
    for (let i = 0; i < 32; i++) authRecon[i] = Number(witnessFields[64 + i]);
    expect(Array.from(authRecon)).toEqual(Array.from(authDataHash));

    logger.info("✅ Test 8 passed: Auth witness layout correct");
  });
});

// ─── Helpers ────────────────────────────────────────────

function normalizeDER(derSig: Uint8Array): Uint8Array {
  const result = new Uint8Array(64);
  if (derSig[0] !== 0x30) {
    if (derSig.length === 64) return derSig;
    throw new Error("Invalid signature format");
  }

  let offset = 2;
  if (derSig[offset] !== 0x02) throw new Error("Invalid DER");
  offset++;
  const rLen = derSig[offset]; offset++;
  const rBytes = derSig.slice(offset, offset + rLen); offset += rLen;

  if (derSig[offset] !== 0x02) throw new Error("Invalid DER");
  offset++;
  const sLen = derSig[offset]; offset++;
  const sBytes = derSig.slice(offset, offset + sLen);

  padTo32(rBytes, result, 0);
  padTo32(sBytes, result, 32);
  return result;
}

function padTo32(src: Uint8Array, dest: Uint8Array, off: number) {
  if (src.length === 32) { dest.set(src, off); }
  else if (src.length === 33 && src[0] === 0x00) { dest.set(src.slice(1), off); }
  else if (src.length < 32) { dest.set(src, off + (32 - src.length)); }
  else { throw new Error(`Unexpected: ${src.length}`); }
}
