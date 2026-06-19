/**
 * Celari Wallet — Offscreen PXE Engine
 *
 * Runs the Aztec PXE (Private eXecution Environment) in a Chrome offscreen document.
 * Handles WASM proof generation, account management, balance queries, and transfers.
 *
 * Architecture:
 *   popup.js ↔ background.js ↔ offscreen.js (this file)
 *   This file owns the PXE lifecycle and all Aztec SDK interactions.
 */

import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
import { DefaultAccountContract } from "@aztec/accounts/defaults";
import { AuthWitness } from "@aztec/stdlib/auth-witness";
// AztecAddress already imported from @aztec/aztec.js/addresses above
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
import { NO_FROM } from "@aztec/aztec.js/account";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { loadContractArtifact } from "@aztec/aztec.js/abi";
import { Contract } from "@aztec/aztec.js/contracts";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import { WalletSchema, AccountManager } from "@aztec/aztec.js/wallet";
import { installPasskeyWalletDbShim } from "./lib/passkey-walletdb-shim.js";
import { deriveKeys } from "@aztec/stdlib/keys";

// Contract artifacts (compiled Noir → JSON)
import CelariPasskeyAccountArtifactJson from "../../../contracts/celari_passkey_account/target/celari_passkey_account-CelariPasskeyAccount.json" with { type: "json" };
const CelariPasskeyAccountArtifact = loadContractArtifact(CelariPasskeyAccountArtifactJson);

// Guardian Recovery contract artifact — static import (esbuild inlines JSON),
// but loadContractArtifact() is deferred until first use.
import CelariRecoverableAccountArtifactJson from "../../../contracts/celari_recoverable_account/target/celari_recoverable_account-CelariRecoverableAccount.json" with { type: "json" };
let CelariRecoverableAccountArtifact = null;
function getRecoveryArtifact() {
  if (CelariRecoverableAccountArtifact) return CelariRecoverableAccountArtifact;
  try {
    CelariRecoverableAccountArtifact = loadContractArtifact(CelariRecoverableAccountArtifactJson);
    return CelariRecoverableAccountArtifact;
  } catch (e) {
    console.warn("[PXE] CelariRecoverableAccount artifact load failed (recovery disabled):", e.message);
    return null;
  }
}

// Bridge contracts (compiled Noir → JSON) for L2 withdraw (exit) execution.
import CelariTokenBridgeArtifactJson from "../../../bridge/contracts/l2/celari_token_bridge/target/celari_token_bridge-CelariTokenBridge.json" with { type: "json" };
import BridgedTokenArtifactJson from "../../../bridge/contracts/l2/bridged_token/target/bridged_token-BridgedToken.json" with { type: "json" };
const CelariTokenBridgeArtifact = loadContractArtifact(CelariTokenBridgeArtifactJson);
const BridgedTokenArtifact = loadContractArtifact(BridgedTokenArtifactJson);

import { BRIDGE } from "./lib/bridge-config.js";
import { FEE_JUICE_ADDRESS } from "./lib/default-tokens.js";
import { selectExitMode } from "./lib/bridge-exit-select.js";
import { chooseThreadCount, shouldUseWorkerBackend } from "./lib/thread-count.js";

// --- In-Memory KV Store for iOS ---
// WKWebView's IndexedDB crashes on PXE block sync transactions.
// This drop-in replacement uses Map-backed storage (ephemeral, re-syncs each launch).

class _MemMap {
  constructor(n) { this.name = n; this._d = new Map(); }
  set db(_) {}
  _k(k) { return (Array.isArray(k) ? k : [k]).map(e => typeof e === 'number' ? `n_${e}` : String(e)).join(','); }
  _dk(k) { const p = k.split(',').map(x => x.startsWith('n_') ? Number(x.slice(2)) : x); return p.length > 1 ? p : p[0]; }
  async getAsync(k) { return this._d.get(this._k(k)); }
  async hasAsync(k) { return this._d.has(this._k(k)); }
  async sizeAsync() { return this._d.size; }
  async set(k, v) { this._d.set(this._k(k), v); }
  async setMany(e) { for (const { key, value } of e) this._d.set(this._k(key), value); }
  swap() { throw new Error('Not implemented'); }
  async setIfNotExists(k, v) { const nk = this._k(k); if (!this._d.has(nk)) { this._d.set(nk, v); return true; } return false; }
  async delete(k) { this._d.delete(this._k(k)); }
  async *entriesAsync(r = {}) {
    let e = [...this._d.entries()];
    if (r.start) { const s = this._k(r.start); e = e.filter(([k]) => k >= s); }
    if (r.end) { const s = this._k(r.end); e = e.filter(([k]) => k < s); }
    if (r.reverse) e.reverse();
    let c = 0;
    for (const [k, v] of e) { if (r.limit && c >= r.limit) return; yield [this._dk(k), v]; c++; }
  }
  async *valuesAsync(r = {}) { for await (const [, v] of this.entriesAsync(r)) yield v; }
  async *keysAsync(r = {}) { for await (const [k] of this.entriesAsync(r)) yield k; }
}

class _MemSet {
  constructor(n) { this._m = new _MemMap(n); }
  set db(_) {}
  hasAsync(k) { return this._m.hasAsync(k); }
  add(k) { return this._m.set(k, true); }
  delete(k) { return this._m.delete(k); }
  async *entriesAsync(r) { yield* this._m.keysAsync(r); }
}

class _MemMultiMap {
  constructor(n) { this.name = n; this._d = new Map(); }
  set db(_) {}
  _k(k) { return (Array.isArray(k) ? k : [k]).map(e => typeof e === 'number' ? `n_${e}` : String(e)).join(','); }
  _dk(k) { const p = k.split(',').map(x => x.startsWith('n_') ? Number(x.slice(2)) : x); return p.length > 1 ? p : p[0]; }
  async getAsync(k) { return (this._d.get(this._k(k)) || [])[0]; }
  async hasAsync(k) { return (this._d.get(this._k(k)) || []).length > 0; }
  async sizeAsync() { let c = 0; for (const v of this._d.values()) c += v.length; return c; }
  async set(k, v) {
    const nk = this._k(k);
    if (!this._d.has(nk)) this._d.set(nk, []);
    const arr = this._d.get(nk), s = JSON.stringify(v);
    if (!arr.some(x => JSON.stringify(x) === s)) arr.push(v);
  }
  async setMany(e) { for (const { key, value } of e) await this.set(key, value); }
  swap() { throw new Error('Not implemented'); }
  async setIfNotExists(k, v) { if (!await this.hasAsync(k)) { await this.set(k, v); return true; } return false; }
  async delete(k) { this._d.delete(this._k(k)); }
  async *getValuesAsync(k) { for (const v of (this._d.get(this._k(k)) || [])) yield v; }
  async getValueCountAsync(k) { return (this._d.get(this._k(k)) || []).length; }
  async deleteValue(k, v) {
    const arr = this._d.get(this._k(k)); if (!arr) return;
    const s = JSON.stringify(v), i = arr.findIndex(x => JSON.stringify(x) === s);
    if (i >= 0) arr.splice(i, 1);
  }
  async *entriesAsync(r = {}) { for (const [k, vs] of this._d) for (const v of vs) yield [this._dk(k), v]; }
  async *valuesAsync(r = {}) { for (const vs of this._d.values()) for (const v of vs) yield v; }
  async *keysAsync(r = {}) { for (const k of this._d.keys()) yield this._dk(k); }
}

class _MemArray {
  constructor() { this._d = []; }
  set db(_) {}
  async lengthAsync() { return this._d.length; }
  async push(...v) { this._d.push(...v); return this._d.length; }
  async pop() { return this._d.pop(); }
  async atAsync(i) { return this._d[i < 0 ? this._d.length + i : i]; }
  async setAt(i, v) { if (i < 0) i += this._d.length; if (i < 0 || i >= this._d.length) return false; this._d[i] = v; return true; }
  async *entriesAsync() { for (let i = 0; i < this._d.length; i++) yield [i, this._d[i]]; }
  async *valuesAsync() { for (const v of this._d) yield v; }
  [Symbol.asyncIterator]() { return this.valuesAsync(); }
}

class _MemSingleton {
  constructor() { this._v = undefined; }
  set db(_) {}
  async getAsync() { return this._v; }
  async set(v) { this._v = v; return true; }
  async delete() { this._v = undefined; return true; }
}

class MemoryAztecStore {
  constructor() {
    this.isEphemeral = true;
    this._c = { map: {}, set: {}, mm: {}, arr: {}, sg: {} };
  }
  openMap(n) { return this._c.map[n] || (this._c.map[n] = new _MemMap(n)); }
  openSet(n) { return this._c.set[n] || (this._c.set[n] = new _MemSet(n)); }
  openMultiMap(n) { return this._c.mm[n] || (this._c.mm[n] = new _MemMultiMap(n)); }
  openArray(n) { return this._c.arr[n] || (this._c.arr[n] = new _MemArray()); }
  openSingleton(n) { return this._c.sg[n] || (this._c.sg[n] = new _MemSingleton()); }
  openCounter() { throw new Error('Not implemented'); }
  async transactionAsync(cb) { return await cb(); }
  async clear() { this._c = { map: {}, set: {}, mm: {}, arr: {}, sg: {} }; }
  delete() { this.clear(); return Promise.resolve(); }
  estimateSize() { return Promise.resolve({ mappingSize: 0, physicalFileSize: 0, actualSize: 0, numItems: 0 }); }
  close() { return Promise.resolve(); }
  backupTo() { throw new Error('Not implemented'); }

  // --- Snapshot Persistence ---

  static _serVal(v) {
    if (v instanceof Uint8Array) return { __u8: Array.from(v) };
    if (typeof v === 'bigint') return { __bi: v.toString() };
    return v;
  }

  static _desVal(v) {
    if (v && typeof v === 'object') {
      if (v.__u8) return new Uint8Array(v.__u8);
      if (v.__bi !== undefined) return BigInt(v.__bi);
    }
    return v;
  }

  serialize() {
    const S = MemoryAztecStore._serVal;
    const snap = { map: {}, set: {}, mm: {}, arr: {}, sg: {} };

    for (const [n, m] of Object.entries(this._c.map)) {
      const entries = {};
      for (const [k, v] of m._d.entries()) entries[k] = S(v);
      snap.map[n] = entries;
    }

    for (const [n, s] of Object.entries(this._c.set)) {
      snap.set[n] = [...s._m._d.keys()];
    }

    for (const [n, mm] of Object.entries(this._c.mm)) {
      const entries = {};
      for (const [k, arr] of mm._d.entries()) entries[k] = arr.map(S);
      snap.mm[n] = entries;
    }

    for (const [n, a] of Object.entries(this._c.arr)) {
      snap.arr[n] = a._d.map(S);
    }

    for (const [n, sg] of Object.entries(this._c.sg)) {
      if (sg._v !== undefined) snap.sg[n] = S(sg._v);
    }

    return JSON.stringify(snap);
  }

  static deserialize(json) {
    const D = MemoryAztecStore._desVal;
    const store = new MemoryAztecStore();
    const snap = JSON.parse(json);

    for (const [n, entries] of Object.entries(snap.map || {})) {
      const map = store.openMap(n);
      for (const [k, v] of Object.entries(entries)) map._d.set(k, D(v));
    }

    for (const [n, keys] of Object.entries(snap.set || {})) {
      const set = store.openSet(n);
      for (const k of keys) set._m._d.set(k, true);
    }

    for (const [n, entries] of Object.entries(snap.mm || {})) {
      const mm = store.openMultiMap(n);
      for (const [k, arr] of Object.entries(entries)) mm._d.set(k, arr.map(D));
    }

    for (const [n, arr] of Object.entries(snap.arr || {})) {
      const a = store.openArray(n);
      a._d = arr.map(D);
    }

    for (const [n, v] of Object.entries(snap.sg || {})) {
      const sg = store.openSingleton(n);
      sg._v = D(v);
    }

    return store;
  }
}

// --- Browser-compatible SponsoredFPC setup ---

async function setupSponsoredFPC(walletInstance) {
  console.log("[PXE] SponsoredFPC: Step 2a -- importing SponsoredFPCContract artifact...");
  const t2a = Date.now();
  const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
  console.log(`[PXE] SponsoredFPC: Step 2a OK (${Date.now() - t2a}ms)`);

  console.log("[PXE] SponsoredFPC: Step 2b -- getContractInstanceFromInstantiationParams (WASM)...");
  const t2b = Date.now();
  const fpcInstance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    { salt: new Fr(0) },
  );
  console.log(`[PXE] SponsoredFPC: Step 2b OK (${Date.now() - t2b}ms)`);

  console.log("[PXE] SponsoredFPC: Step 2c -- registerContract...");
  const t2c = Date.now();
  await walletInstance.registerContract(fpcInstance, SponsoredFPCContract.artifact);
  console.log(`[PXE] SponsoredFPC: Step 2c OK (${Date.now() - t2c}ms)`);

  return {
    instance: fpcInstance,
    paymentMethod: new SponsoredFeePaymentMethod(fpcInstance.address),
  };
}

// --- State ---

let wallet = null;       // EmbeddedWallet instance (wraps PXE)
let nodeClient = null;   // AztecNode client (for wallet-sdk protocol)
let kvStore = null;       // MemoryAztecStore reference (iOS only — for snapshot persistence)
let pxeReady = false;
let initError = null;
let initInProgress = false; // Guard: prevent concurrent messages during PXE_INIT
let initStep = "";          // Current init step description for UI progress

// Multi-account support: address → { manager, wallet (AccountWithSecretKey) }
const accountWallets = new Map();
let activeAddress = null;

// WalletConnect
let wcClient = null;

// --- Progress Reporting (JS → Swift UI) ---
function reportProgress(message) {
  try {
    if (typeof window !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pxeEvent) {
      window.webkit.messageHandlers.pxeEvent.postMessage(JSON.stringify({
        type: "PROGRESS",
        message: message || null
      }));
    }
  } catch (e) { /* ignore — non-iOS env */ }
}

function getActiveWallet() {
  if (!activeAddress) return null;
  return accountWallets.get(activeAddress)?.wallet || null;
}

function getActiveManager() {
  if (!activeAddress) return null;
  return accountWallets.get(activeAddress)?.manager || null;
}

// --- WalletConnect Request Handler ---

async function handleWcRequest(method, params) {
  const activeWallet = getActiveWallet();
  switch (method) {
    case "aztec_getAccounts":
      return { accounts: Array.from(accountWallets.keys()) };
    case "aztec_getChainInfo":
      return { chainId: "aztec:testnet", nodeUrl: wallet?.getNodeUrl?.() || "" };
    case "aztec_sendTx":
    case "aztec_signTransaction":
    case "aztec_createAuthWit": {
      // SECURITY GATE: WalletConnect session_request must NOT silently sign.
      // The wcClient.on("session_request") handler responds synchronously with
      // no per-request user approval and no args shown — i.e. a hostile relay or
      // paired peer could drain funds / mint authwits. Unlike the inpage-provider
      // write path (which opens a confirm popup via background's pendingSignRequests),
      // WC has NO approval plumbing yet, so WRITES are refused until that
      // per-tx approval flow is implemented. Reads below remain allowed.
      // (The WC feature is currently inert — PXE_WC_INIT is never dispatched —
      //  but this guard ensures wiring it up later cannot reintroduce a blind-sign.)
      throw new Error(
        "WalletConnect write requests require per-transaction approval, which is not yet implemented. " +
        "Use the in-extension provider (window.celari) for signing, or implement the WC approval popup before enabling.",
      );
    }
    case "aztec_simulateTx": {
      if (!activeWallet) throw new Error("No active wallet");
      const result = await handleWalletMethod("simulateTx", params);
      return result;
    }
    default:
      throw new Error(`Unsupported WC method: ${method}`);
  }
}

// --- Browser P256 Auth Witness Provider ---

class BrowserP256AuthWitnessProvider {
  constructor(privateKeyBase64) {
    this._pkcs8Base64 = privateKeyBase64;
  }

  async createAuthWit(messageHash) {
    console.log(`[AuthWit] createAuthWit called`);

    // Decode base64 → PKCS8 Uint8Array
    const binaryStr = atob(this._pkcs8Base64);
    const pkcs8Bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      pkcs8Bytes[i] = binaryStr.charCodeAt(i);
    }
    // PKCS8 key imported for ECDSA P-256 signing

    // Import P256 key as NON-EXTRACTABLE: the working signing key can only be
    // used to sign, never re-exported via WebCrypto. (Was extractable=true "for
    // debug" — a gratuitous key-exfiltration path.)
    let key;
    try {
      key = await crypto.subtle.importKey(
        "pkcs8",
        pkcs8Bytes,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
      // Key imported OK
    } catch (e) {
      console.error(`[AuthWit] Key import FAILED: ${e.message}`);
      throw e;
    }

    // Sign: WebCrypto SHA-256 hashes internally, matching Noir contract's sha256(outer_hash)
    const hashBytes = messageHash.toBuffer();
    // Sign the message hash with ECDSA P-256

    let sigRaw;
    try {
      sigRaw = new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          key,
          hashBytes,
        ),
      );
      // Signature obtained (64 bytes: r || s)
    } catch (e) {
      console.error(`[AuthWit] Signing FAILED: ${e.message}`);
      throw e;
    }

    // Low-S normalization: Noir's verify_ecdsa_p256 requires s ≤ n/2.
    // WebCrypto doesn't normalize, so ~50% of signatures have high-S → circuit rejects.
    // P-256 order n = FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
    const P256_N = [
      0xFF,0xFF,0xFF,0xFF,0x00,0x00,0x00,0x00,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,
      0xBC,0xE6,0xFA,0xAD,0xA7,0x17,0x9E,0x84,0xF3,0xB9,0xCA,0xC2,0xFC,0x63,0x25,0x51,
    ];
    const P256_HALF_N = [
      0x7F,0xFF,0xFF,0xFF,0x80,0x00,0x00,0x00,0x7F,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,
      0xDE,0x73,0x7D,0x56,0xD3,0x8B,0xCF,0x42,0x79,0xDC,0xE5,0x61,0x7E,0x31,0x92,0xA8,
    ];

    // Compare s (bytes 32-63) against half_n
    const sBuf = sigRaw.slice(32, 64);
    let sIsHigh = false;
    for (let i = 0; i < 32; i++) {
      if (sBuf[i] > P256_HALF_N[i]) { sIsHigh = true; break; }
      if (sBuf[i] < P256_HALF_N[i]) { break; }
    }

    if (sIsHigh) {
      // s' = n - s  (big-endian subtraction)
      const newS = new Uint8Array(32);
      let borrow = 0;
      for (let i = 31; i >= 0; i--) {
        const diff = P256_N[i] - sBuf[i] - borrow;
        newS[i] = diff < 0 ? diff + 256 : diff;
        borrow = diff < 0 ? 1 : 0;
      }
      sigRaw.set(newS, 32);
      console.log(`[AuthWit] Low-S normalized`);
    } else {
      // s is already low-S
    }

    // Pack 64-byte P256 signature (r || s) into AuthWitness fields as Fr elements
    const witnessFields = [];
    for (let i = 0; i < 64; i++) {
      witnessFields.push(new Fr(sigRaw[i]));
    }
    // 64 Fr fields packed into AuthWitness

    return new AuthWitness(messageHash, witnessFields);
  }
}

// --- Browser Celari Account Contract ---

class BrowserCelariPasskeyAccountContract extends DefaultAccountContract {
  constructor(pubKeyX, pubKeyY, privateKeyBase64) {
    super();
    this._pubKeyX = pubKeyX;
    this._pubKeyY = pubKeyY;
    this._privateKeyBase64 = privateKeyBase64;
  }

  async getContractArtifact() {
    return CelariPasskeyAccountArtifact;
  }

  async getInitializationFunctionAndArgs() {
    return {
      constructorName: "constructor",
      // Aztec 4.3.0's ABI encoder requires real JS arrays for `[u8; 32]` params;
      // _pubKeyX/_pubKeyY arrive as Uint8Array (object) → "Expected array for
      // pub_key_x but received object". Array.from yields the [u8; 32] the
      // contract constructor expects. Same 32 bytes → address stays deterministic.
      constructorArgs: [Array.from(this._pubKeyX), Array.from(this._pubKeyY)],
    };
  }

  getAuthWitnessProvider(_address) {
    return new BrowserP256AuthWitnessProvider(this._privateKeyBase64);
  }
}

// --- PXE Initialization ---

async function initPXE(nodeUrl) {
  initStep = "Connecting to Aztec node...";
  reportProgress("Aztec node'a bağlanılıyor...");
  console.log(`[PXE] Connecting to ${nodeUrl}...`);
  const node = createAztecNodeClient(nodeUrl);
  nodeClient = node; // Store for wallet-sdk protocol

  // iOS WKWebView has no Worker support — but we MUST enable proving.
  // Fake proofs (proverEnabled=false) are rejected by the testnet node.
  // BBLazyPrivateKernelProver works on the main thread (slow but functional).
  const isIOS = typeof window !== "undefined" && window.__CELARI_IOS === true;
  const proverEnabled = true; // Always true — testnet requires real proofs
  if (isIOS) console.log("[PXE] iOS detected — proverEnabled: true (main-thread proving, no Workers)");

  // ── Inline createPXE steps with granular logging ──
  // (Replaces EmbeddedWallet.create to diagnose which step hangs in WKWebView)
  const { createPXE, getPXEConfig } = await import("@aztec/pxe/client/lazy");
  const pxeConfig = Object.assign(getPXEConfig(), { proverEnabled });

  initStep = "Fetching L1 contract addresses...";
  console.log("[PXE] Step A: getL1ContractAddresses (network)...");
  const t_l1 = Date.now();
  const l1Contracts = await Promise.race([
    node.getL1ContractAddresses(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("getL1ContractAddresses timed out after 30s — is the Aztec node reachable?")), 30000)),
  ]);
  console.log("[PXE] Step A: OK (" + (Date.now() - t_l1) + "ms)");

  const configWithContracts = { ...pxeConfig, l1Contracts };

  initStep = "Creating local database...";
  console.log("[PXE] Step B: Creating KV store...");
  const t_store = Date.now();
  let store;
  // Use in-memory store for both iOS and Chrome — IndexedDB causes
  // "transaction not active" errors during async SDK operations in Chrome extensions.
  // Data re-syncs each session anyway.
  console.log("[PXE] Step B: Using in-memory KV store");
  store = new MemoryAztecStore();
  kvStore = store;
  if (l1Contracts.rollupAddress) {
    const rollupSingleton = store.openSingleton('rollupAddress');
    await rollupSingleton.set(l1Contracts.rollupAddress.toString());
  }
  console.log("[PXE] Step B: In-memory store OK (" + (Date.now() - t_store) + "ms)");

  // Pre-initialize Barretenberg WASM prover.
  //
  // THREADING: bb coordinates its worker pool with Atomics.wait, which is FORBIDDEN on a
  // Document main thread (this offscreen document) and only legal inside a Web Worker. So
  // multi-threaded proving MUST use BackendType.WasmWorker — bb then runs its main module
  // in main.worker.js (which spawns the thread.worker.js pool), where Atomics.wait is
  // allowed. BackendType.Wasm runs the threaded module IN-THREAD and throws "Atomics.wait
  // cannot be called in this context" at prove time, corrupting bb state ("No circuits
  // accumulated" / "subtable not merged"). The wasm is compiled on THIS thread and passed
  // to the worker via comlink, so the worker needs no wasm path. Threads are gated on
  // crossOriginIsolated (COOP/COEP → SharedArrayBuffer); iOS WKWebView has no Workers and
  // is never isolated → chooseThreadCount returns 1 → single-thread in-thread.
  console.log("[PXE] Step C0: Pre-initializing Barretenberg...");
  const t_bb = Date.now();
  const { Barretenberg, BackendType } = await import("@aztec/bb.js");
  const _bbThreads = chooseThreadCount({
    isolated: typeof self !== "undefined" && self.crossOriginIsolated === true,
    isIOS,
    hardwareConcurrency: (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0,
    cap: 8,
  });

  // Probe that bb's main worker actually loads BEFORE committing the singleton to the
  // worker backend. createMainWorker()'s readiness wait has no error path, so a worker
  // that fails to load would hang bb init forever — and Barretenberg.initSingleton stores
  // that hung promise with no public way to reset it. The probe is cheap: main.worker.js
  // posts its ready message on load (`{ ready: true }`), before any wasm instantiation.
  const _bbMainWorkerLoads = async () => {
    try {
      const w = new Worker(new URL("./main.worker.js", import.meta.url), { type: "module" });
      const ok = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 8000);
        w.addEventListener("message", (ev) => {
          if (ev?.data?.ready === true) { clearTimeout(timer); resolve(true); }
        });
        w.addEventListener("error", () => { clearTimeout(timer); resolve(false); });
      });
      w.terminate();
      return ok;
    } catch (e) {
      console.warn("[PXE] bb main-worker probe threw:", e?.message || e);
      return false;
    }
  };

  let _bbThreaded = false;
  if (_bbThreads > 1) {
    const workerAvailable = await _bbMainWorkerLoads();
    if (shouldUseWorkerBackend({ threads: _bbThreads, workerAvailable })) {
      try {
        await Barretenberg.initSingleton({ backend: BackendType.WasmWorker, threads: _bbThreads });
        _bbThreaded = true;
        console.log(`[PXE] Barretenberg init: WasmWorker, threads=${_bbThreads}, crossOriginIsolated=true`);
      } catch (e) {
        // initSingleton clears its singleton on rejection, so the single-thread init below
        // starts clean. (Reached only if the worker loaded but bb's own init then failed.)
        console.warn(`[PXE] Threaded (WasmWorker) init (threads=${_bbThreads}) failed, falling back to single-thread:`, e?.message || e);
      }
    } else {
      console.warn(`[PXE] bb main worker did not load — using single-thread (threadsWanted=${_bbThreads})`);
    }
  }
  if (!_bbThreaded) {
    await Barretenberg.initSingleton({ backend: BackendType.Wasm, threads: 1 });
    console.log(`[PXE] Barretenberg init: Wasm, threads=1 (threadsWanted=${_bbThreads}, isolated=${typeof self !== "undefined" && self.crossOriginIsolated}, iOS=${isIOS})`);
  }
  console.log("[PXE] Step C0: Barretenberg singleton ready (" + (Date.now() - t_bb) + "ms)");

  // ── Native Prover Intercept (iOS only) ──
  // When running in WKWebView, PXEBridge injects window.nativeProver.
  // We intercept BB.js chonk calls to route them through native Swift prover.
  const _hasNativeProver = (typeof window !== "undefined" && window.nativeProver && window.nativeProver.available);
  console.log("[PXE] Step C0b: Native prover check —", _hasNativeProver ? "AVAILABLE" : "not available (WASM mode)");

  if (_hasNativeProver) {
    // Helper: Uint8Array → base64
    function toB64(uint8arr) {
      let binary = '';
      const bytes = uint8arr instanceof Uint8Array ? uint8arr : new Uint8Array(uint8arr);
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    }

    // SRS init is lazy — done on first chonk_start, not here
    let _nativeSrsReady = false;

    try {
      // Patch the singleton instance directly
      const bb = Barretenberg.getSingleton();
      console.log("[PXE] Step C0b: Got BB singleton, patching chonk methods...");

      bb.chonkStart = async function(command) {
        console.log("[NativeProver] chonk_start:", command.numCircuits, "circuits");
        // Lazy SRS init on first chonk call
        if (!_nativeSrsReady) {
          console.log("[NativeProver] Initializing native SRS (BN254 + Grumpkin)...");
          try {
            await window.nativeProver.setupForChonk({ bn254Size: 262144 });
            _nativeSrsReady = true;
            console.log("[NativeProver] SRS ready");
          } catch (srsErr) {
            console.error("[NativeProver] SRS init failed:", srsErr.message, "— falling back to WASM for this session");
            // Restore original and let WASM handle it
            throw srsErr;
          }
        }
        await window.nativeProver.chonkStart(command.numCircuits);
        return {};
      };

      bb.chonkLoad = async function(command) {
        const c = command.circuit;
        console.log("[NativeProver] chonk_load:", c.name);
        await window.nativeProver.chonkLoad(c.name, toB64(c.bytecode), toB64(c.verificationKey));
        return {};
      };

      bb.chonkAccumulate = async function(command) {
        console.log("[NativeProver] chonk_accumulate");
        await window.nativeProver.chonkAccumulate(toB64(command.witness));
        return {};
      };

      bb.chonkProve = async function(_command) {
        console.log("[NativeProver] chonk_prove — starting native IVC proving...");
        const t0 = Date.now();
        const result = await window.nativeProver.chonkProve();
        const elapsed = Date.now() - t0;
        console.log("[NativeProver] chonk_prove done in", (result.proveTimeMs || elapsed), "ms");

        // Decode base64 proof → msgpack → ChonkProof object
        const proofBytes = Uint8Array.from(atob(result.proof), c => c.charCodeAt(0));
        const { Decoder } = await import("msgpackr");
        const decoded = new Decoder({ useRecords: false }).unpack(proofBytes);
        return { proof: decoded };
      };

      console.log("[PXE] Step C0b: Chonk intercept installed (SRS will init on first prove)");
    } catch (err) {
      console.error("[PXE] Step C0b FAILED:", err.message, err.stack);
    }
  }

  initStep = "Loading WASM prover engine...";
  reportProgress("WASM prover yükleniyor...");
  console.log("[PXE] Step C: WASMSimulator + Prover...");
  const t_sim = Date.now();
  const [{ WASMSimulator }, { BBLazyPrivateKernelProver }] = await Promise.race([
    Promise.all([
      import("@aztec/simulator/client"),
      import("@aztec/bb-prover/client/lazy"),
    ]),
    new Promise((_, rej) => setTimeout(() => rej(new Error("WASM prover import timed out after 90s")), 90000)),
  ]);
  const simulator = new WASMSimulator();
  const prover = new BBLazyPrivateKernelProver(simulator);
  console.log("[PXE] Step C: OK (" + (Date.now() - t_sim) + "ms)");

  initStep = "Loading protocol contracts...";
  console.log("[PXE] Step D: LazyProtocolContractsProvider...");
  const t_pcp = Date.now();
  const { LazyProtocolContractsProvider } = await Promise.race([
    import("@aztec/protocol-contracts/providers/lazy"),
    new Promise((_, rej) => setTimeout(() => rej(new Error("Protocol contracts import timed out after 30s")), 30000)),
  ]);
  const protocolContractsProvider = new LazyProtocolContractsProvider();
  console.log("[PXE] Step D: OK (" + (Date.now() - t_pcp) + "ms)");

  // Step E removed: PXE.create was creating a PXE that competed with EmbeddedWallet's internal PXE
  // for the same IndexedDB store, causing "delete range without transaction" errors on WKWebView.
  // EmbeddedWallet.create() below creates its own PXE using the shared store, simulator, and prover.

  initStep = "Starting PXE wallet engine...";
  reportProgress("PXE wallet başlatılıyor...");
  console.log("[PXE] Step E: Creating EmbeddedWallet (single PXE with shared store)...");
  const t_pxe = Date.now();
  wallet = await Promise.race([
    EmbeddedWallet.create(node, { pxeConfig, pxeOptions: { store, simulator, proverOrOptions: prover } }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("EmbeddedWallet.create timed out after 4 min")), 240000)),
  ]);
  console.log("[PXE] Step E: OK (" + (Date.now() - t_pxe) + "ms) — EmbeddedWallet ready");

  // Override getAccountFromAddress so CelariPasskey accounts (custom contract)
  // are resolved via AccountManager instead of WalletDB (which only knows built-in types).
  const _origGetAccount = wallet.getAccountFromAddress.bind(wallet);
  wallet.getAccountFromAddress = async function (addr) {
    const entry = accountWallets.get(addr.toString());
    if (entry?.manager) {
      const acct = await entry.manager.getAccount();
      if (acct) return acct;
    }
    return _origGetAccount(addr);
  };

  // CelariPasskey accounts are never written to walletDB (registerAccount uses
  // AccountManager.create + registerContract, not storeAccount). The base
  // EmbeddedWallet.simulateViaEntrypoint reads the RAW walletDB.retrieveAccount(from)
  // to pick a kernelless-simulation stub by `type`, throwing "Account 0x... does
  // not exist on this wallet" for any authenticated tx (dApp orders + transfers).
  // Shim it to return a synthetic ecdsasecp256r1 record for our accounts (the
  // ECDSA stub is wire-compatible with CelariPasskey); real sends still use the
  // getAccountFromAddress override above for real P256 signing.
  installPasskeyWalletDbShim(wallet, accountWallets);

  const info = await Promise.race([
    wallet.getChainInfo(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("getChainInfo timed out after 15s")), 15000)),
  ]);
  console.log(`[PXE] Connected — Chain ${info.chainId}, Protocol v${info.version}`);

  // NOTE: SponsoredFPC setup removed from init — it calls registerContract() which
  // involves getContractMetadata + WASM ops that block WKWebView's single-threaded JS.
  // Deploy already calls setupSponsoredFPC() at line 553, so this was redundant.

  // Pre-flight: check import.meta.url and WASM file accessibility
  console.log(`[PXE] Pre-flight: import.meta.url = ${import.meta.url}`);
  try {
    // Check if WASM files are reachable via fetch (file:// polyfill in shim)
    const wasmUrl = new URL("noirc_abi_wasm_bg.wasm", import.meta.url).href;
    console.log(`[PXE] Pre-flight: WASM URL = ${wasmUrl}`);
    const resp = await fetch(wasmUrl);
    console.log(`[PXE] Pre-flight: WASM fetch status=${resp.status}, size=${resp.headers.get('content-length') || '?'}`);
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      console.log(`[PXE] Pre-flight: WASM loaded OK — ${buf.byteLength} bytes ✓`);
    } else {
      console.warn(`[PXE] Pre-flight: WASM fetch failed — status ${resp.status}`);
    }
  } catch (wasmErr) {
    console.warn(`[PXE] Pre-flight: WASM check error: ${wasmErr?.message?.slice(0, 150)}`);
  }

  reportProgress(null);
  pxeReady = true;
  return { status: "ready", chainId: info.chainId.toString() };
}

// --- Account Registration ---

async function registerAccount(data) {
  if (!wallet) throw new Error("PXE not initialized");

  const { publicKeyX, publicKeyY, secretKey, salt, privateKeyPkcs8 } = data;

  // Register account with CelariPasskey contract

  const pubKeyXBuf = hexToBuffer(publicKeyX);
  const pubKeyYBuf = hexToBuffer(publicKeyY);

  const accountContract = new BrowserCelariPasskeyAccountContract(
    pubKeyXBuf,
    pubKeyYBuf,
    privateKeyPkcs8,
  );

  const secretKeyFr = Fr.fromHexString(secretKey);
  const manager = await AccountManager.create(wallet, secretKeyFr, accountContract, Fr.fromHexString(salt));

  const address = manager.address.toString();
  const accountAddr = AztecAddress.fromString(address);

  // Register the account contract with the PXE (critical for re-registration after restart).
  try {
    console.log(`[PXE] Registering contract instance with PXE...`);
    const instance = manager.getInstance();
    await wallet.registerContract(instance, CelariPasskeyAccountArtifact, secretKeyFr);
    console.log(`[PXE] Contract registered OK`);
  } catch (err) {
    console.warn(`[PXE] Contract registration warning (may already exist): ${err.message}`);
  }

  // Force PXE to discover the account contract's notes (especially signing_public_key).
  try {
    console.log(`[PXE] Triggering note sync for account contract...`);
    const t0 = Date.now();
    // v4.2.x NotesFilter requires `scopes: AztecAddress[]` (no longer optional).
    // Omitting it triggers an internal `.filter()` on undefined.
    await wallet.pxe.debug.getNotes({ contractAddress: accountAddr, scopes: [accountAddr] });
    console.log(`[PXE] Note sync completed OK (${Date.now() - t0}ms)`);
  } catch (err) {
    console.warn(`[PXE] Note sync warning (non-fatal): ${err.message}`);
  }

  // The Proxy is needed so getAddress() returns the CelariPasskey address.
  const acctWallet = new Proxy(wallet, {
    get(target, prop) {
      // Address-related methods → from the registered account
      if (prop === 'getAddress') {
        return () => AztecAddress.fromString(address);
      }
      // Everything else → EmbeddedWallet (PXE + internal account dispatch)
      const val = target[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });

  accountWallets.set(address, { manager, wallet: acctWallet, secretKey: secretKeyFr, salt: Fr.fromHexString(salt) });
  if (!activeAddress) activeAddress = address;

  // Auto-register senders for private-note discovery. Aztec accounts are NOT
  // implicit senders, and note discovery is FORWARD-ONLY (the PXE has no
  // historical re-scan API), so we register as early as possible — here, which
  // runs at account creation AND on every launch (idempotent). Without this,
  // the account's own private notes (e.g. public→private conversions, self
  // transfers) and incoming private transfers from known counterparties are
  // never discovered, so private balances silently read as zero. All non-fatal.
  try {
    await wallet.registerSender(AztecAddress.fromString(address));
    console.log(`[PXE] Self-registered account as sender for note discovery`);
  } catch (err) {
    console.warn(`[PXE] Self-register sender warning (non-fatal): ${err?.message || err}`);
  }
  // Known counterparty that may send us private notes: the L2 token bridge.
  // Cheap + idempotent. (Public faucet mints need no sender — they create no
  // notes — so the faucet operator is intentionally not registered here.)
  try {
    await wallet.registerSender(AztecAddress.fromString(BRIDGE.TOKEN_BRIDGE_ADDRESS));
  } catch (err) {
    console.warn(`[PXE] Bridge sender register warning (non-fatal): ${err?.message || err}`);
  }

  console.log(`[PXE] Account registered: ${address.slice(0, 22)}... (total: ${accountWallets.size})`);
  return { address };
}

// --- Transfer ---

async function executeTransfer(data) {
  const acctWallet = getActiveWallet();
  if (!acctWallet) throw new Error("No account registered in PXE");

  const { to, amount, tokenAddress, transferType = "private" } = data;

  const { TokenContract } = await import("@aztec/noir-contracts.js/Token");
  const tokenAddr = AztecAddress.fromString(tokenAddress);
  const recipientAddr = AztecAddress.fromString(to);
  const rawAmount = BigInt(Math.floor(parseFloat(amount) * 1e18));

  // Ensure token contract is registered (in-memory PXE has no persistence)
  const { contractInstance: existing } = await wallet.getContractMetadata(tokenAddr);
  if (!existing && nodeClient) {
    console.log(`[PXE] Transfer: registering token contract from node...`);
    const onChainInstance = await nodeClient.getContract(tokenAddr);
    if (onChainInstance) {
      await wallet.registerContract(onChainInstance, TokenContract.artifact);
      console.log(`[PXE] Transfer: token contract registered OK`);
    }
  }

  reportProgress("Token kontratı hazırlanıyor...");
  const token = TokenContract.at(tokenAddr, acctWallet);
  reportProgress("Fee ödeme ayarlanıyor...");
  let paymentMethod;
  try {
    const fpc = await Promise.race([
      setupSponsoredFPC(acctWallet),
      new Promise((_, rej) => setTimeout(() => rej(new Error("SponsoredFPC timeout")), 30000)),
    ]);
    paymentMethod = fpc.paymentMethod;
    console.log("[PXE] Transfer: SponsoredFPC OK");
  } catch (e) {
    // v4.2.0: FeeJuicePaymentMethod removed. If SponsoredFPC is unavailable,
    // pass no paymentMethod — the wallet will use the account's Fee Juice balance
    // automatically via completeFeeOptions().
    console.warn(`[PXE] Transfer: SponsoredFPC unavailable (${e.message}), using account Fee Juice balance`);
    paymentMethod = undefined;
  }
  const senderAddr = acctWallet.getAddress();

  reportProgress("Transfer tx gönderiliyor...");
  console.log(`[PXE] ${transferType} transfer: ${amount} to ${to.slice(0, 16)}...`);
  console.log(`[PXE] senderAddr: ${senderAddr.toString().slice(0, 22)}...`);
  console.log(`[PXE] acctWallet type: ${acctWallet?.constructor?.name || 'Proxy'}`);
  console.log(`[PXE] acctWallet.getAddress(): ${acctWallet.getAddress().toString().slice(0, 22)}...`);

  let sendResult;
  const feeOpts = { estimateGas: true, estimatedGasPadding: 0.1 };
  if (paymentMethod) feeOpts.paymentMethod = paymentMethod;
  const sendOpts = { from: senderAddr, fee: feeOpts, wait: { timeout: 600_000 } };
  reportProgress("Blok onayı bekleniyor...");
  switch (transferType) {
    case "private":
      // Private-to-private: caller's private notes → recipient's private note
      sendResult = await token.methods
        .transfer(recipientAddr, rawAmount)
        .send(sendOpts);
      break;

    case "public":
      // Public-to-public: transfer_in_public(from, to, amount, authwit_nonce)
      sendResult = await token.methods
        .transfer_in_public(senderAddr, recipientAddr, rawAmount, 0)
        .send(sendOpts);
      break;

    case "shield":
      // Public → Private: move caller's public balance into recipient's private notes
      sendResult = await token.methods
        .transfer_to_private(recipientAddr, rawAmount)
        .send(sendOpts);
      break;

    case "unshield":
      // Private → Public: transfer_to_public(from, to, amount, authwit_nonce)
      sendResult = await token.methods
        .transfer_to_public(senderAddr, recipientAddr, rawAmount, 0)
        .send(sendOpts);
      break;

    default:
      throw new Error(`Unknown transfer type: ${transferType}`);
  }

  // In 4.1.0-rc.2, send() with wait returns { receipt: TxReceipt, ...OffchainOutput }
  const receipt = sendResult.receipt;
  console.log(`[PXE] Tx: ${receipt.txHash.toString().slice(0, 22)}...`);
  console.log(`[PXE] Confirmed! Block ${receipt.blockNumber}`);

  reportProgress(null);
  return {
    txHash: receipt.txHash.toString(),
    blockNumber: receipt.blockNumber?.toString() || "",
  };
}

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

  reportProgress("Köprü kontratları hazırlanıyor...");
  await _ensureContractRegistered(bridgeAddr, CelariTokenBridgeArtifact);
  await _ensureContractRegistered(tokenAddr, BridgedTokenArtifact);

  reportProgress("Bakiye kontrol ediliyor...");
  const token = await Contract.at(tokenAddr, BridgedTokenArtifact, acctWallet);
  let priv = 0n, pub = 0n;
  // NOTE: BridgedToken (MVP) implements only public balances — it has no
  // balance_of_private method, so private stays 0 and selectExitMode picks "public".
  if (token.methods.balance_of_private) {
    try { priv = BigInt((await token.methods.balance_of_private(sender).simulate({ from: sender })).toString()); } catch (e) { console.warn("[Bridge] private balance read failed:", e?.message); }
  }
  try { pub  = BigInt((await token.methods.balance_of_public(sender).simulate({ from: sender })).toString()); } catch (e) { console.warn("[Bridge] public balance read failed:", e?.message); }
  const mode = selectExitMode(priv, pub, amount);
  if (!mode) throw new Error(`Insufficient bridged balance: private ${priv}, public ${pub}, need ${amount}`);

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

  // Params match the website's L1 claim (withdraw(..., withCaller=true)):
  // l1Token=ETH(0x0), callerOnL1=recipient, nonce=0. Content-hash is enforced on-chain.
  const bridge = await Contract.at(bridgeAddr, CelariTokenBridgeArtifact, acctWallet);
  const l1Token    = EthAddress.fromString(BRIDGE.L1_ETH_TOKEN);
  const recipEth   = EthAddress.fromString(recipient);
  const callerOnL1 = EthAddress.fromString(recipient);
  const nonce      = new Fr(0n);

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

// --- Balance Query ---

let balanceFromAddress = null;

async function ensureBalanceAccount() {
  if (balanceFromAddress) return;
  try {
    // Always create a dedicated Schnorr test account for balance queries.
    // Real passkey accounts are incompatible with enableSimulatedSimulations().
    console.log("[PXE] Balance: creating test account for balance queries...");
    const mgr = await wallet.createSchnorrAccount(Fr.random(), Fr.random());
    balanceFromAddress = mgr.address;
    console.log(`[PXE] Balance: test account created — ${balanceFromAddress.toString().slice(0, 20)}...`);
  } catch (e) {
    console.warn(`[PXE] Balance: test account setup failed: ${e.message?.slice(0, 80)}`);
  }
}

// Fee Juice is a PROTOCOL contract — it is NOT discoverable via
// nodeClient.getContract — so we resolve its canonical instance + artifact from
// the SDK and register THAT. Lazy-loaded so the artifact JSON isn't parsed
// unless a Fee Juice balance is actually queried. Returns
// { instance, contractClass, artifact, address }.
let _feeJuice = null;
async function getFeeJuice() {
  if (_feeJuice) return _feeJuice;
  const { getCanonicalFeeJuice } = await import("@aztec/protocol-contracts/fee-juice");
  _feeJuice = getCanonicalFeeJuice();
  return _feeJuice;
}

// Query a token's balance using an EXPLICIT artifact, for non-standard tokens
// (Fee Juice, the bridged token) whose ABI/class differs from the standard
// Token contract. Registers the contract with the SAME artifact (so no class-id
// mismatch), reads the public balance, and the private balance only if the ABI
// exposes balance_of_private (Fee Juice and BridgedToken are public-only).
// Fully isolated from the standard-Token path in getBalances. Never throws.
async function queryBalanceViaArtifact(tk, tokenAddr, holderAddr, artifact, canonicalInstance = null) {
  try {
    const { contractInstance: existing } = await wallet.getContractMetadata(tokenAddr);
    if (!existing) {
      if (canonicalInstance) {
        // Protocol contract (Fee Juice): register the SDK canonical instance —
        // it is not returned by nodeClient.getContract.
        await wallet.registerContract(canonicalInstance, artifact);
      } else if (nodeClient) {
        const onChainInstance = await nodeClient.getContract(tokenAddr);
        if (onChainInstance) await wallet.registerContract(onChainInstance, artifact);
        else console.warn(`[PXE] Balance: contract ${tk.symbol} not found on-chain`);
      }
    }
    const c = await Contract.at(tokenAddr, artifact, wallet);
    let publicBalance = 0;
    let privateBalance = 0;
    if (c.methods.balance_of_public) {
      const sim = await c.methods.balance_of_public(holderAddr).simulate({ from: balanceFromAddress });
      const bal = sim.result !== undefined ? sim.result : sim;
      publicBalance = Number(bal) / 10 ** tk.decimals;
    }
    if (getActiveWallet() && c.methods.balance_of_private) {
      try {
        const sim = await c.methods.balance_of_private(holderAddr).simulate({ from: balanceFromAddress });
        const bal = sim.result !== undefined ? sim.result : sim;
        privateBalance = Number(bal) / 10 ** tk.decimals;
      } catch (e) {
        console.warn(`[PXE] Private balance unavailable for ${tk.symbol}: ${e.message?.slice(0, 80)}`);
      }
    }
    const fmt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return { name: tk.name, symbol: tk.symbol, address: tk.address, publicBalance: fmt(publicBalance), privateBalance: fmt(privateBalance), balance: fmt(publicBalance + privateBalance), usdValue: "0.00" };
  } catch (e) {
    console.warn(`[PXE] Balance query FAILED for ${tk.symbol} (artifact path): ${e.message?.slice(0, 200)}`);
    return { name: tk.name, symbol: tk.symbol, address: tk.address, publicBalance: "—", privateBalance: "—", balance: "—", usdValue: "0.00" };
  }
}

async function getBalances(data) {
  if (!wallet) throw new Error("PXE not initialized");

  const { address, tokens } = data;
  if (!tokens || tokens.length === 0) return [];

  // Ensure a test account exists for balance queries
  // (EmbeddedWallet in 4.1.0-rc.2 handles simulation internally via simulateViaEntrypoint)
  await ensureBalanceAccount();

  const results = [];
  const { TokenContract } = await import("@aztec/noir-contracts.js/Token");

  for (const tk of tokens) {
    try {
      const tokenAddr = AztecAddress.fromString(tk.address);
      const addr = AztecAddress.fromString(address);

      // Non-standard-ABI tokens (Fee Juice, bridged token) → isolated artifact
      // path; the standard Token path below is left untouched.
      const lcAddr = tk.address.toLowerCase();
      let specialArtifact = null;
      let canonicalInstance = null;
      if (lcAddr === BRIDGE.BRIDGED_TOKEN_ADDRESS.toLowerCase()) {
        specialArtifact = BridgedTokenArtifact;
      } else if (lcAddr === FEE_JUICE_ADDRESS.toLowerCase()) {
        const fj = await getFeeJuice();
        specialArtifact = fj.artifact;
        canonicalInstance = fj.instance;
      }
      if (specialArtifact) {
        results.push(await queryBalanceViaArtifact(tk, tokenAddr, addr, specialArtifact, canonicalInstance));
        continue;
      }

      console.log(`[PXE] Balance: querying ${tk.symbol} at ${tk.address.slice(0, 20)}... for ${address.slice(0, 20)}...`);

      // Step 0: Ensure token contract is registered with PXE
      const { contractInstance: existing } = await wallet.getContractMetadata(tokenAddr);
      if (!existing && nodeClient) {
        console.log(`[PXE] Balance: registering ${tk.symbol} contract from node...`);
        const onChainInstance = await nodeClient.getContract(tokenAddr);
        if (onChainInstance) {
          await wallet.registerContract(onChainInstance, TokenContract.artifact);
          console.log(`[PXE] Balance: registered ${tk.symbol} contract OK`);
        } else {
          console.warn(`[PXE] Balance: contract ${tk.symbol} not found on-chain`);
        }
      }

      // Step 1: Get contract instance
      const tokenForPublic = TokenContract.at(tokenAddr, wallet);

      // Step 2: Query public balance (from: test account to avoid getAccountFromAddress crash)
      // In 4.1.0-rc.2, simulate() returns SimulationResult { result, stats?, ... }
      console.log(`[PXE] Balance: querying public balance for ${tk.symbol}...`);
      const publicSim = await tokenForPublic.methods.balance_of_public(addr).simulate({ from: balanceFromAddress });
      const publicBal = publicSim.result !== undefined ? publicSim.result : publicSim;
      console.log(`[PXE] Balance: public balance OK — ${publicBal}`);
      const publicBalance = Number(publicBal) / 10 ** tk.decimals;

      let privateBalance = 0;
      if (getActiveWallet()) {
        try {
          // Use EmbeddedWallet (not AccountWithSecretKey) — it has simulateViaEntrypoint()
          // needed for unconstrained balance_of_private queries
          const tokenForPrivate = TokenContract.at(tokenAddr, wallet);
          const privateSim = await tokenForPrivate.methods.balance_of_private(addr).simulate({ from: balanceFromAddress });
          const privateBal = privateSim.result !== undefined ? privateSim.result : privateSim;
          privateBalance = Number(privateBal) / 10 ** tk.decimals;
          console.log(`[PXE] Balance: private balance OK — ${privateBal}`);
        } catch (e) {
          console.warn(`[PXE] Private balance unavailable for ${tk.symbol}: ${e.message?.slice(0, 80)}`);
        }
      }

      const fmt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

      results.push({
        name: tk.name,
        symbol: tk.symbol,
        address: tk.address,
        publicBalance: fmt(publicBalance),
        privateBalance: fmt(privateBalance),
        balance: fmt(publicBalance + privateBalance),
        usdValue: "0.00",
      });
    } catch (e) {
      console.warn(`[PXE] Balance query FAILED for ${tk.symbol}: ${e.message?.slice(0, 200)}`);
      if (e.stack) console.warn(`[PXE] Balance error stack: ${e.stack.slice(0, 500)}`);
      results.push({
        name: tk.name,
        symbol: tk.symbol,
        publicBalance: "—",
        privateBalance: "—",
        balance: "—",
        usdValue: "0.00",
      });
    }
  }

  // In 4.1.0-rc.2, EmbeddedWallet handles simulation mode internally — no toggle needed
  return { balances: results };
}

// --- Client-Side Account Deploy ---

async function generateP256KeyPairBrowser() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const pubKeyX = "0x" + Array.from(pubRaw.slice(1, 33))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const pubKeyY = "0x" + Array.from(pubRaw.slice(33, 65))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const privateKeyPkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  );
  const pkcs8Base64 = btoa(String.fromCharCode(...privateKeyPkcs8));
  return { pubKeyX, pubKeyY, privateKeyPkcs8: pkcs8Base64 };
}

async function deployAccountClientSide(data) {
  console.log(`[PXE] >>> deployAccountClientSide ENTERED`);
  if (!wallet) throw new Error("PXE not initialized");

  // Force PXE block sync before deploy to get fresh anchor block header
  console.log("[PXE] Deploy Step 0: Syncing PXE block state...");
  const t0 = Date.now();
  try {
    if (wallet.pxe.blockStateSynchronizer?.sync) {
      await wallet.pxe.blockStateSynchronizer.sync();
      console.log(`[PXE] Deploy Step 0: block sync OK (${Date.now() - t0}ms)`);
    } else {
      // Fallback: just fetch latest header to confirm connectivity
      const header = await wallet.pxe.getSyncedBlockHeader();
      console.log(`[PXE] Deploy Step 0: header fetched OK (${Date.now() - t0}ms), timestamp: ${header?.globalVariables?.timestamp}`);
    }
  } catch (e) {
    console.warn(`[PXE] Deploy Step 0: sync failed (${Date.now() - t0}ms) -- ${e.message}, continuing anyway...`);
  }

  const { publicKeyX, publicKeyY, privateKeyPkcs8 } = data;
  console.log(`[PXE] pubKeyX: ${publicKeyX?.slice(0,16)}..., pkcs8: ${privateKeyPkcs8 ? 'present' : 'MISSING'}`);

  // Use pre-computed keys if provided (from PXE_COMPUTE_ADDRESS), otherwise generate new ones
  const secretKey = data.secretKey ? Fr.fromHexString(data.secretKey) : Fr.random();
  const salt = data.salt ? Fr.fromHexString(data.salt) : Fr.random();

  const accountContract = new BrowserCelariPasskeyAccountContract(
    hexToBuffer(publicKeyX),
    hexToBuffer(publicKeyY),
    privateKeyPkcs8,
  );

  // Step 1: Create account
  console.log("[PXE] Deploy Step 1: wallet.createAccount()...");
  reportProgress("Hesap oluşturuluyor...");
  const t1 = Date.now();
  let manager;
  try {
    manager = await Promise.race([
      AccountManager.create(wallet, secretKey, accountContract, salt),
      new Promise((_, rej) => setTimeout(() => rej(new Error("AccountManager.create timed out after 3 min")), 180000)),
    ]);
    console.log(`[PXE] Deploy Step 1: OK (${Date.now() - t1}ms) -- address: ${manager.address.toString().slice(0, 22)}...`);
  } catch (e) {
    console.error(`[PXE] Deploy Step 1: FAILED (${Date.now() - t1}ms) -- ${e.message}`);
    throw e;
  }

  const address = manager.address;

  // Step 1b: Register account + contract with PXE (v4.0.4 requirement)
  console.log("[PXE] Deploy Step 1b: registerAccount + registerContract...");
  const t1b = Date.now();
  try {
    const instance = manager.getInstance();
    await wallet.registerContract(instance, CelariPasskeyAccountArtifact, secretKey);
    console.log(`[PXE] Deploy Step 1b: OK (${Date.now() - t1b}ms)`);
  } catch (e) {
    console.error(`[PXE] Deploy Step 1b: FAILED (${Date.now() - t1b}ms) -- ${e.message}`);
    throw e;
  }

  // Step 2: Fee payment — priority: FeeJuiceWithClaim (if available) → SponsoredFPC → FeeJuice → Error
  reportProgress("Fee ödeme ayarlanıyor...");
  console.log("[PXE] Deploy Step 2: setting up fee payment...");
  const t2 = Date.now();
  let paymentMethod;
  let deployGasSettings = undefined;

  // Priority 1: If user has faucet claim data, use it directly (most reliable)
  console.log(`[PXE] Deploy Step 2: checking claim data — claimSecret: ${data.claimSecret ? 'YES' : 'NO'}, leafIndex: ${data.messageLeafIndex || 'NO'}, claimAmount: ${data.claimAmount || 'NO'}`);
  console.log(`[PXE] Deploy Step 2: all data keys: ${Object.keys(data).join(', ')}`);
  if (data.claimSecret && data.messageLeafIndex) {
    const { FeeJuicePaymentMethodWithClaim } = await import("@aztec/aztec.js/fee");
    const { GasSettings } = await import("@aztec/stdlib/gas");
    // Get current network fees and compute gas settings with 2x margin
    const currentFees = await nodeClient.getCurrentMinFees();
    const maxFeesPerGas = currentFees.mul(2);
    const gasSettings = GasSettings.fallback({ maxFeesPerGas });
    paymentMethod = new FeeJuicePaymentMethodWithClaim(address, {
      claimAmount: BigInt(data.claimAmount || "1000000000000000000000"),
      claimSecret: Fr.fromHexString(data.claimSecret),
      messageLeafIndex: BigInt(data.messageLeafIndex),
    });
    // Store gasSettings to pass to send()
    deployGasSettings = gasSettings;
    console.log(`[PXE] Deploy Step 2: FeeJuicePaymentMethodWithClaim OK (leafIndex: ${data.messageLeafIndex}, ${Date.now() - t2}ms)`);
  } else {
    // Priority 2: Try SponsoredFPC (devnet only — may be depleted)
    try {
      const fpc = await Promise.race([
        setupSponsoredFPC(wallet),
        new Promise((_, rej) => setTimeout(() => rej(new Error("SponsoredFPC timed out")), 30000)),
      ]);
      paymentMethod = fpc.paymentMethod;
      console.log(`[PXE] Deploy Step 2: SponsoredFPC OK (${Date.now() - t2}ms)`);
    } catch (e) {
      console.warn(`[PXE] Deploy Step 2: SponsoredFPC unavailable (${e.message})`);
      // Priority 3: Use FeeJuicePaymentMethod if user has Fee Juice balance
      // v4.2.0: FeeJuicePaymentMethod removed. For deploy, the account isn't
      // on-chain yet so we can't fall back to the account's own Fee Juice.
      // User MUST bridge/claim Fee Juice first (use the Nethermind faucet button).
      throw new Error("Fee payment unavailable: Use 'Claim Fee Juice from Nethermind' in the Deploy banner, then try deploying again.");
    }
  }

  // Step 3: getDeployMethod
  reportProgress("Deploy metodu hazırlanıyor...");
  console.log("[PXE] Deploy Step 3: getDeployMethod...");
  const t3 = Date.now();
  const deployMethod = await manager.getDeployMethod();
  console.log(`[PXE] Deploy Step 3: OK (${Date.now() - t3}ms)`);

  // Step 4: send + wait (prove is the slowest part — may take minutes in WASM)
  // Retry on "Block header not found" — chain reorgs can invalidate the anchor block
  // during the long proving window (2-5 min on WASM).
  const MAX_DEPLOY_RETRIES = 3;
  let txReceipt;
  for (let attempt = 1; attempt <= MAX_DEPLOY_RETRIES; attempt++) {
    reportProgress(attempt > 1 ? `Deploy tx yeniden gönderiliyor... (deneme ${attempt})` : "Deploy tx gönderiliyor...");
    console.log(`[PXE] Deploy Step 4 (attempt ${attempt}/${MAX_DEPLOY_RETRIES}): deployMethod.send() + wait...`);
    console.log("[PXE] (proving may take several minutes in WKWebView WASM...)");
    const t4 = Date.now();
    const progressTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - t4) / 1000);
      console.log(`[PXE] Deploy Step 4: still running... ${elapsed}s elapsed`);
      reportProgress(`Deploy tx işleniyor... (${elapsed}s)`);
    }, 15000);
    try {
      const feeOpts = deployGasSettings
        ? { paymentMethod, gasSettings: deployGasSettings }
        : { paymentMethod, estimateGas: true, estimatedGasPadding: 0.1 };
      console.log(`[PXE] Deploy Step 4: fee method = ${paymentMethod.constructor?.name || 'unknown'}, hasGasSettings = ${!!deployGasSettings}`);
      const sendResult = await deployMethod.send({
        from: NO_FROM,
        fee: feeOpts,
        wait: { timeout: 900_000 },
      });
      clearInterval(progressTimer);
      txReceipt = sendResult.receipt;
      console.log(`[PXE] Deploy Step 4: txHash: ${txReceipt.txHash.toString().slice(0, 22)}... Deployed! Block ${txReceipt.blockNumber} (${Date.now() - t4}ms)`);
      break; // Success — exit retry loop
    } catch (e) {
      clearInterval(progressTimer);
      const isReorgError = e.message?.includes("Block header not found") || e.message?.includes("Invalid tx");
      console.error(`[PXE] Deploy Step 4: FAILED (attempt ${attempt}, ${Date.now() - t4}ms) -- ${e.message}`);
      if (isReorgError && attempt < MAX_DEPLOY_RETRIES) {
        console.warn(`[PXE] Deploy Step 4: Chain reorg detected — re-syncing PXE before retry...`);
        reportProgress("Chain reorg algılandı, yeniden sync ediliyor...");
        try {
          if (wallet.pxe.blockStateSynchronizer?.sync) {
            await wallet.pxe.blockStateSynchronizer.sync();
          }
        } catch (syncErr) {
          console.warn(`[PXE] Deploy Step 4: re-sync failed: ${syncErr.message}`);
        }
        // Brief delay before retry to let the chain stabilize
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw e; // Non-reorg error or final attempt — propagate
    }
  }

  reportProgress("Hesap deploy edildi ✓");

  // Store in multi-account map
  const addrStr = address.toString();
  const acctWallet = new Proxy(wallet, {
    get(target, prop) {
      if (prop === 'getAddress') {
        return () => AztecAddress.fromString(addrStr);
      }
      const val = target[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
  accountWallets.set(addrStr, { manager, wallet: acctWallet });
  activeAddress = addrStr;

  reportProgress(null);
  return {
    address: addrStr,
    secretKey: secretKey.toString(),
    salt: salt.toString(),
    txHash: txReceipt.txHash.toString(),
    blockNumber: txReceipt.blockNumber?.toString() || "",
  };
}

// --- Faucet (mint CLR via admin inside extension) ---

let faucetAdmin = null;   // { adminAddr, clrToken, tokenAddress }
const FAUCET_AMOUNT = 100n * 10n ** 18n; // 100 CLR
const FAUCET_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes (dev/test)
let lastFaucetTime = 0;

// Restore faucet rate limit via background.js
(async () => {
  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_FAUCET_RATE" }, (r) => {
        void chrome.runtime.lastError;
        resolve(r);
      });
    });
    if (res?.lastFaucetTime) lastFaucetTime = res.lastFaucetTime;
  } catch {}
})();

async function executeFaucet(data) {
  if (!wallet) throw new Error("PXE not initialized");

  const { address } = data;
  if (!address) throw new Error("Missing address");

  // Rate limit (persisted across SW restarts)
  if (Date.now() - lastFaucetTime < FAUCET_COOLDOWN_MS) {
    const remainingMin = Math.ceil((FAUCET_COOLDOWN_MS - (Date.now() - lastFaucetTime)) / 60000);
    throw new Error(`Rate limited. Try again in ${remainingMin} minutes.`);
  }

  const { TokenContract } = await import("@aztec/noir-contracts.js/Token");
  const { paymentMethod } = await setupSponsoredFPC(wallet);

  // Try loading cached admin via background.js (offscreen has no chrome.storage)
  if (!faucetAdmin) {
    try {
      const cached = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_FAUCET_CACHE" }, (res) => {
          void chrome.runtime.lastError;
          resolve(res?.data || null);
        });
      });
      if (cached?.secret && cached?.tokenAddress) {
        const mgr = await wallet.createSchnorrAccount(
          Fr.fromHexString(cached.secret),
          Fr.fromHexString(cached.salt),
        );
        const adminAddr = mgr.address;
        const tokenAddr = AztecAddress.fromString(cached.tokenAddress);

        const clrToken = TokenContract.at(tokenAddr, wallet);
        faucetAdmin = { adminAddr, clrToken, tokenAddress: cached.tokenAddress };
        console.log(`[PXE] Faucet admin loaded from cache: ${adminAddr.toString().slice(0, 22)}...`);
        console.log(`[PXE] Token contract verified on-chain ✓`);
      }
    } catch (e) {
      console.warn(`[PXE] Faucet cache load failed: ${e.message?.slice(0, 60)}`);
      faucetAdmin = null;
    }
  }

  // First-time setup: deploy admin + CLR token
  if (!faucetAdmin) {
    console.log("[PXE] Faucet first-time setup: deploying admin + CLR token...");
    reportProgress("Faucet kurulumu başlatılıyor...");

    const secret = Fr.random();
    const salt = Fr.random();
    const mgr = await wallet.createSchnorrAccount(secret, salt);
    const adminAddr = mgr.address;

    console.log(`[PXE] Deploying faucet admin ${adminAddr.toString().slice(0, 22)}...`);
    reportProgress("Admin hesap deploy ediliyor... (1/3)");
    reportProgress("Admin tx onayı bekleniyor... (1/3)");
    await (await mgr.getDeployMethod()).send({
      from: NO_FROM,
      fee: { paymentMethod, estimateGas: true, estimatedGasPadding: 0.1 },
      wait: { timeout: 600_000 },
    });
    console.log("[PXE] Faucet admin deployed!");

    // Retry token deploy — PXE block stream may not have synced the admin's
    // signing key note yet (getTxReceipt checks the node, not PXE local state).
    console.log("[PXE] Deploying CLR token...");
    reportProgress("CLR Token deploy ediliyor... (2/3)");
    let deployedToken;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const tokenDeploy = TokenContract.deploy(wallet, adminAddr, "Celari Token", "CLR", 18);
        const deployResult = await tokenDeploy.send({ from: adminAddr, fee: { paymentMethod, estimateGas: true, estimatedGasPadding: 0.1 }, wait: { timeout: 600_000 } });
        // In 4.1.0-rc.2, DeployMethod.send() returns { contract, receipt, ...OffchainOutput }
        deployedToken = deployResult.contract;
        break;
      } catch (e) {
        if (attempt < 5 && e.message?.includes("Failed to get a note")) {
          console.log(`[PXE] Admin note not synced yet — retrying in 5s (attempt ${attempt + 1}/6)...`);
          await new Promise(r => setTimeout(r, 5000));
        } else {
          throw e;
        }
      }
    }
    const tokenAddress = deployedToken.address.toString();

    const clrToken = deployedToken;
    faucetAdmin = { adminAddr, clrToken, tokenAddress };

    // Cache via background.js (offscreen has no chrome.storage)
    chrome.runtime.sendMessage({
      type: "SET_FAUCET_CACHE",
      data: {
        secret: secret.toString(),
        salt: salt.toString(),
        tokenAddress,
        adminAddress: adminAddr.toString(),
      },
    }, () => void chrome.runtime.lastError);

    console.log(`[PXE] Faucet setup complete! Token: ${tokenAddress.slice(0, 22)}...`);
  }

  // Mint to target address
  const to = AztecAddress.fromString(address);
  console.log(`[PXE] Faucet: minting 100 CLR to ${address.slice(0, 22)}...`);
  reportProgress("100 CLR mint ediliyor... (3/3)");

  reportProgress("Mint tx onayı bekleniyor... (3/3)");
  const mintResult = await faucetAdmin.clrToken.methods
    .mint_to_public(to, FAUCET_AMOUNT)
    .send({ from: faucetAdmin.adminAddr, fee: { paymentMethod, estimateGas: true, estimatedGasPadding: 0.1 }, wait: { timeout: 600_000 } });
  const mintReceipt = mintResult.receipt;

  lastFaucetTime = Date.now();
  // Persist rate limit via background.js
  chrome.runtime.sendMessage({ type: "SET_FAUCET_RATE", lastFaucetTime }, () => void chrome.runtime.lastError);

  console.log(`[PXE] Faucet done! Block ${mintReceipt.blockNumber}`);
  reportProgress(null); // Clear status bar
  return {
    txHash: mintReceipt.txHash.toString(),
    blockNumber: mintReceipt.blockNumber?.toString() || "",
    amount: "100",
    symbol: "CLR",
    tokenAddress: faucetAdmin.tokenAddress,
  };
}

// --- Sync Status ---

async function getSyncStatus() {
  if (!wallet) return { synced: false, pxeBlock: 0, nodeBlock: 0 };

  try {
    const nodeBlock = await wallet.getBlockNumber();
    return {
      synced: true,
      nodeBlock,
      accountCount: accountWallets.size,
      activeAddress,
    };
  } catch (e) {
    return { synced: false, error: e.message?.slice(0, 80) };
  }
}

// --- Sender Registration (for note discovery) ---

async function registerSender(senderAddress) {
  if (!wallet) throw new Error("PXE not initialized");
  await wallet.registerSender(AztecAddress.fromString(senderAddress));
  console.log(`[PXE] Sender registered: ${senderAddress.slice(0, 22)}...`);
  return { registered: true };
}

// --- Utilities ---

function hexToBuffer(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${clean.length} (must be even)`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// --- Wallet-SDK Method Dispatcher ---
// Handles standard Aztec wallet-sdk method calls from dApps.
// Delegates to acctWallet (AccountWithSecretKey) for account-scoped methods,
// and to wallet (EmbeddedWallet) for PXE-level methods.

// Fallback account list: returns PXE-registered accounts, or — if PXE
// registration hasn't happened yet this session (SW just woke / browser
// restart) — the deployed accounts persisted in chrome.storage.local.
// dApps need the address immediately for discovery/balance UI; account-
// scoped write methods (sendTx, createAuthWit) still require a real
// registered wallet and will surface a clear error on their own.
// Lazy-register a stored account in PXE when a dApp method needs it after
// a fresh offscreen boot (SW eviction wipes the in-memory accountWallets
// map). Pulls the account metadata + plaintext signing material from
// background (offscreen can't reach chrome.storage directly), then runs
// the same registerAccount() path the popup uses on unlock.
// Returns a reason code so the caller can produce an accurate error:
// "OK" (registered/already present), "WALLET_LOCKED", "NO_DEPLOYED_ACCOUNT",
// "BRIDGE_FAIL", "REGISTER_FAIL", or "BUNDLE_FAIL".
async function ensureAccountFromBundle(fromAddress) {
  // Already registered for this address? nothing to do.
  if (fromAddress && accountWallets.has(fromAddress)) return "OK";
  let bundle;
  try {
    bundle = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GET_ACCOUNT_BUNDLE", address: fromAddress },
        (r) => {
          void chrome.runtime.lastError;
          resolve(r);
        }
      );
    });
  } catch (e) {
    console.warn(`[PXE] ensureAccountFromBundle: bridge to background failed: ${e?.message || e}`);
    return "BRIDGE_FAIL";
  }
  if (!bundle?.success) {
    console.warn(`[PXE] ensureAccountFromBundle: ${bundle?.error || "unknown"} (code=${bundle?.code || "none"})`);
    return bundle?.code || "BUNDLE_FAIL";
  }
  console.log(`[PXE] ensureAccountFromBundle: registering ${bundle.bundle.address.slice(0, 22)}... into PXE`);
  try {
    await registerAccount(bundle.bundle);
    console.log(`[PXE] ensureAccountFromBundle: registered OK`);
    return "OK";
  } catch (e) {
    console.warn(`[PXE] ensureAccountFromBundle: registerAccount failed: ${e?.message || e}`);
    return "REGISTER_FAIL";
  }
}

async function listKnownAccounts() {
  const registered = Array.from(accountWallets.keys());
  if (registered.length > 0) {
    return registered.map(addr => ({ alias: "", item: AztecAddress.fromString(addr) }));
  }
  // Offscreen documents cannot access chrome.storage.* directly — only
  // chrome.runtime is available. Route the read through background.js.
  try {
    const stored = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_STORED_ACCOUNTS" }, (r) => {
        void chrome.runtime.lastError;
        resolve(Array.isArray(r?.accounts) ? r.accounts : []);
      });
    });
    // Expose accounts by address regardless of `deployed` — a dApp needs the
    // address pre-deploy to fund/claim Fee Juice (the deploy depends on it).
    const filtered = stored.filter(a => a?.address);
    console.log(`[PXE] listKnownAccounts: storage=${stored.length}, withAddress=${filtered.length}`);
    return filtered.map(a => {
      try {
        return { alias: a.label || "", item: AztecAddress.fromString(a.address) };
      } catch (e) {
        console.warn(`[PXE] listKnownAccounts: AztecAddress.fromString failed for ${a.address}: ${e.message}`);
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    console.warn("[PXE] listKnownAccounts: bridge to background failed:", e?.message || e);
    return [];
  }
}

async function handleWalletMethod(method, args) {
  if (!wallet) throw new Error("PXE not initialized");

  switch (method) {
    case "getAccounts": {
      const accts = await listKnownAccounts();
      console.log(`[PXE] getAccounts → ${accts.length} account(s): ${accts.map(a => a.item?.toString?.()?.slice(0, 22) + "...").join(", ") || "(none)"}`);
      return accts;
    }

    case "getChainInfo":
      return await wallet.getChainInfo();

    case "getAddressBook": {
      const senders = await wallet.getSenders();
      return senders.map(s => ({ alias: "", item: s }));
    }

    case "registerSender":
      return await wallet.registerSender(args[0], args[1] || "");

    case "registerContract":
      return await wallet.registerContract(args[0], args[1], args[2]);

    case "getContractMetadata":
      return await wallet.getContractMetadata(args[0]);

    case "getContractClassMetadata":
      return await wallet.getContractClassMetadata(args[0], args[1]);

    case "getTxReceipt":
      return await wallet.getTxReceipt(args[0]);

    // Auto-approve whatever the dApp asks for. For v1 we grant what the app
    // requested — Celari does not yet enforce per-method access control at
    // the wallet-sdk layer. We must shape the response per GrantedCapability
    // schemas: the "accounts" capability additionally requires a populated
    // `accounts: [{alias, item}]` array, otherwise the dApp's Zod parseAsync
    // rejects the response and falls back to getAccounts.
    case "requestCapabilities": {
      const app = args[0] || {};
      const requested = Array.isArray(app.capabilities) ? app.capabilities : [];
      const accountsList = await listKnownAccounts();
      const granted = requested.map((cap) => {
        if (cap?.type === "accounts") {
          return {
            type: "accounts",
            canGet: cap.canGet,
            canCreateAuthWit: cap.canCreateAuthWit,
            accounts: accountsList,
          };
        }
        // Other capability types (contracts, contractClasses, simulation,
        // transaction, data) use the same schema for requested and granted.
        return cap;
      });
      return {
        version: "1.0",
        granted,
        wallet: { name: "Celari Wallet", version: "0.5.0" },
      };
    }

    // Unconstrained / read-only function call (balance_of_private, etc.).
    case "executeUtility": {
      // Auto-register the target contract if PXE doesn't know about it.
      // dApps call executeUtility to read balances etc. from arbitrary
      // contracts; PXE throws "No contract instance found" unless we
      // register the on-chain instance *plus its artifact* first.
      //
      // v4.2.x wallet.registerContract requires the artifact (or for the
      // contract class to be in PXE's storage already). For unknown classes
      // we fall back to TokenContract.artifact — covers ~all dApp balance
      // queries (USDC, USDT, custom tokens). If the contract is not actually
      // a Token-class contract, executeUtility will still fail with a clear
      // class-mismatch error downstream.
      const euCall = args[0];
      const addrStr = euCall?.to?.toString?.() || String(euCall?.to || "");
      if (euCall?.to && nodeClient) {
        try {
          const { contractInstance: existing } = await wallet.getContractMetadata(euCall.to);
          if (!existing) {
            console.log(`[PXE] executeUtility: contract ${addrStr.slice(0, 20)}... not registered, fetching from node...`);
            const onChain = await nodeClient.getContract(euCall.to);
            if (!onChain) {
              console.warn(`[PXE] executeUtility: node returned no contract for ${addrStr.slice(0, 20)}...`);
            } else {
              // First try registering with no artifact (works if class already in PXE storage).
              try {
                await wallet.registerContract(onChain);
                console.log(`[PXE] executeUtility: auto-registered ${addrStr.slice(0, 20)}... via existing class artifact`);
              } catch (e1) {
                // Fallback: assume Token contract and supply its artifact.
                console.log(`[PXE] executeUtility: class not in storage (${e1.message?.slice(0, 60)}), trying TokenContract artifact fallback...`);
                const { TokenContract } = await import("@aztec/noir-contracts.js/Token");
                try {
                  await wallet.registerContract(onChain, TokenContract.artifact);
                  console.log(`[PXE] executeUtility: auto-registered ${addrStr.slice(0, 20)}... as TokenContract`);
                } catch (e2) {
                  console.warn(`[PXE] executeUtility: TokenContract fallback failed: ${e2.message?.slice(0, 120)}`);
                }
              }
            }
          }
        } catch (e) {
          console.warn(`[PXE] executeUtility: auto-register threw: ${e.message?.slice(0, 120)}`);
        }
      }
      return await wallet.executeUtility(...args);
    }

    // Account-scoped methods: delegate to active account wallet
    case "simulateTx":
    case "sendTx":
    case "profileTx":
    case "createAuthWit":
    case "getPrivateEvents": {
      // Try the in-memory account registry first; if empty (fresh offscreen
      // boot after SW eviction), lazy-register from storage + session.
      let acctWallet = getActiveWallet();
      if (!acctWallet) {
        // Pull the `from` address out of args so we can match the right
        // account when multiple are stored. Falls back to first deployed.
        const opts = args?.[1] || args?.[0];
        const fromAddr = opts?.from?.toString?.() || (typeof opts?.from === "string" ? opts.from : undefined);
        const reason = await ensureAccountFromBundle(fromAddr);
        acctWallet = getActiveWallet();
        if (!acctWallet) {
          // Honest, actionable errors — "Wallet locked" was previously thrown
          // for ALL of these, sending users to unlock when that wasn't the cause.
          if (reason === "NO_DEPLOYED_ACCOUNT") {
            throw new Error("Account not deployed yet — in the Celari popup, claim Fee Juice and Deploy first. An undeployed account can't send transactions (it has no Fee Juice to pay for one). Use the faucet's claim fields + Deploy instead of 'claim in wallet'.");
          }
          if (reason === "WALLET_LOCKED") {
            throw new Error("Wallet locked — open the Celari popup and unlock to use this dApp");
          }
          throw new Error("No usable account — create and deploy an account in the Celari popup first");
        }
      }
      if (typeof acctWallet[method] !== "function") {
        throw new Error(`Method ${method} not available on account wallet`);
      }
      return await acctWallet[method](...args);
    }

    case "batch": {
      const batchedMethods = args[0];
      const results = [];
      for (const m of batchedMethods) {
        const result = await handleWalletMethod(m.name, m.args);
        results.push({ name: m.name, result });
      }
      return results;
    }

    default:
      throw new Error(`Unsupported wallet method: ${method}`);
  }
}

// --- Message Handler ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log(`[PXE] Handler received: type=${msg?.type}, keys=${msg ? Object.keys(msg).join(',') : 'null'}`);
  // Only process messages relayed through background.js (tagged with _target)
  if (!msg || !msg.type?.startsWith("PXE_") || msg._target !== "offscreen") return false;
  console.log(`[PXE] Processing ${msg.type}...`);

  const handle = async () => {
    try {
      // Guard: prevent any PXE operation while init is in progress (except status checks)
      if (initInProgress && msg.type !== "PXE_INIT" && msg.type !== "PXE_STATUS") {
        console.warn(`[PXE] Blocking ${msg.type} — PXE_INIT in progress`);
        return { error: "PXE still initializing — please wait" };
      }

      switch (msg.type) {
        case "PXE_INIT":
          if (initInProgress) return { error: "PXE_INIT already in progress" };
          initInProgress = true;
          initError = null;
          try {
            const result = await initPXE(msg.nodeUrl);
            return result;
          } catch (e) {
            initError = e?.message || String(e);
            console.error("[PXE] PXE_INIT failed:", initError);
            throw e;
          } finally {
            initInProgress = false;
          }

        case "PXE_STATUS":
          return {
            ready: pxeReady,
            error: initError,
            hasAccount: accountWallets.size > 0,
            accountCount: accountWallets.size,
            activeAddress,
            initializing: initInProgress,
            initStep,
          };

        case "PXE_REGISTER_ACCOUNT":
          return await registerAccount(msg.data);

        case "PXE_TRANSFER":
          return await executeTransfer(msg.data);

        case "PXE_BRIDGE_EXIT":
          return await executeBridgeExit(msg.data);

        case "PXE_BALANCES":
          return await getBalances(msg.data);

        case "PXE_FAUCET":
          return await executeFaucet(msg.data);

        // Client-side deploy
        case "PXE_GENERATE_KEYS":
          return await generateP256KeyPairBrowser();

        case "PXE_DEPLOY_ACCOUNT":
          return await deployAccountClientSide(msg.data);

        // Sync & note discovery
        case "PXE_SYNC_STATUS":
          return await getSyncStatus();

        case "PXE_REGISTER_SENDER":
          return await registerSender(msg.data.address);

        // Multi-account
        case "PXE_SET_ACTIVE_ACCOUNT":
          if (accountWallets.has(msg.data.address)) {
            activeAddress = msg.data.address;
            return { activeAddress };
          }
          return { error: `Account not found: ${msg.data.address}` };

        case "PXE_DELETE_ACCOUNT": {
          const addr = msg.data.address;
          accountWallets.delete(addr);
          if (activeAddress === addr) {
            activeAddress = accountWallets.keys().next().value || null;
          }
          return { deleted: true, activeAddress, accountCount: accountWallets.size };
        }

        case "PXE_GET_ACCOUNTS":
          return {
            accounts: Array.from(accountWallets.keys()),
            activeAddress,
          };

        // Wallet-SDK protocol: standard Aztec wallet method calls
        case "PXE_WALLET_METHOD": {
          if (!msg.rawMessage || typeof msg.rawMessage !== "string") {
            return { error: "PXE_WALLET_METHOD requires a non-empty rawMessage string" };
          }
          const parsed = JSON.parse(msg.rawMessage);
          const method = parsed.type;
          const rawArgs = parsed.args || [];
          console.log(`[PXE] >>> wallet-sdk call: ${method}(${rawArgs.length} arg${rawArgs.length === 1 ? "" : "s"})`);

          // Use WalletSchema Zod schemas to deserialize args into proper Aztec types.
          // dApps may serialize args via JSON.stringify which strips trailing
          // `undefined` slots (e.g. registerContract sent as [instance] when schema
          // declares 3 args with the last two optional). Pad to expected arity
          // before parsing — otherwise Zod tuple parsing rejects with "too_small",
          // we fall back to raw string args, and downstream class-id computation
          // sees garbage strings instead of Fr/AztecAddress objects.
          const schema = WalletSchema[method];
          let typedArgs = rawArgs;
          if (schema && typeof schema.parameters === "function") {
            const params = schema.parameters();
            const expectedLen = params?._def?.items?.length ?? rawArgs.length;
            const paddedArgs = rawArgs.length < expectedLen
              ? [...rawArgs, ...Array(expectedLen - rawArgs.length).fill(undefined)]
              : rawArgs;
            try {
              typedArgs = params.parse(paddedArgs);
            } catch (e) {
              console.warn(`[PXE] WalletSchema parse failed for ${method} (got ${rawArgs.length} args, expected ${expectedLen}), using raw args:`, e.message?.slice(0, 120));
            }
          }

          let result;
          try {
            result = await handleWalletMethod(method, typedArgs);
          } catch (e) {
            // Wallet-sdk failures show up as opaque toString errors in the
            // dApp UI; log the full picture here so service-worker console
            // pinpoints where the throw actually originated.
            let argsPreview = "";
            try {
              argsPreview = jsonStringify(typedArgs).slice(0, 400);
            } catch {
              try { argsPreview = JSON.stringify(rawArgs).slice(0, 400); }
              catch { argsPreview = "(unserializable)"; }
            }
            console.error(`[PXE] wallet-sdk method "${method}" threw:`, e?.message || e);
            console.error(`[PXE] "${method}" args:`, argsPreview);
            if (e?.stack) console.error(`[PXE] "${method}" stack:\n${e.stack}`);
            const wrapped = new Error(`[${method}] ${e?.message || String(e)}`);
            wrapped.stack = e?.stack || wrapped.stack;
            throw wrapped;
          }

          // Serialize response with Aztec-aware JSON (handles bigint, Buffer, etc.)
          const responseJson = jsonStringify({
            messageId: parsed.messageId,
            result,
            walletId: "celari-wallet",
          });
          return { rawResponse: responseJson };
        }

        // ─── Snapshot Persistence ────────────────────────
        case "PXE_SNAPSHOT_SAVE": {
          if (!kvStore) return { error: "No in-memory KV store (not iOS or PXE not initialized)" };
          console.log("[PXE] Snapshot: serializing KV store...");
          const t = Date.now();
          const json = kvStore.serialize();
          console.log(`[PXE] Snapshot: serialized OK — ${(json.length / 1024).toFixed(0)} KB (${Date.now() - t}ms)`);
          return { snapshot: json, sizeBytes: json.length };
        }

        case "PXE_SNAPSHOT_RESTORE": {
          const { snapshot } = msg.data || {};
          if (!snapshot) return { error: "Missing snapshot data" };
          console.log(`[PXE] Snapshot: restoring ${(snapshot.length / 1024).toFixed(0)} KB...`);
          const t = Date.now();
          const restoredStore = MemoryAztecStore.deserialize(snapshot);
          kvStore = restoredStore;
          console.log(`[PXE] Snapshot: deserialized OK (${Date.now() - t}ms)`);

          // Re-create PXE/EmbeddedWallet with restored store
          if (nodeClient) {
            console.log("[PXE] Snapshot: re-creating EmbeddedWallet with restored store...");
            const t2 = Date.now();
            const { getPXEConfig } = await import("@aztec/pxe/client/lazy");
            const pxeConfig = Object.assign(getPXEConfig(), { proverEnabled: true });
            const { WASMSimulator } = await import("@aztec/simulator/client");
            const simulator = new WASMSimulator();
            const { BBLazyPrivateKernelProver } = await import("@aztec/bb-prover/client/lazy");
            const prover = new BBLazyPrivateKernelProver(simulator);
            wallet = await EmbeddedWallet.create(nodeClient, {
              pxeConfig,
              pxeOptions: { store: restoredStore, simulator, proverOrOptions: prover },
            });
            pxeReady = true;
            console.log(`[PXE] Snapshot: EmbeddedWallet restored OK (${Date.now() - t2}ms)`);
          }
          return { restored: true, sizeBytes: snapshot.length };
        }

        // ─── NFT Support ─────────────────────────────────
        case "PXE_NFT_BALANCES": {
          const contracts = msg.data?.contracts || [];
          const ownerAddr = activeAddress;
          if (!ownerAddr || !wallet) return { nfts: [] };

          const { NFTContract } = await import("@aztec/noir-contracts.js/NFT");
          const ownerAz = AztecAddress.fromString(ownerAddr);
          const activeWallet = accountWallets.get(ownerAddr)?.wallet;
          if (!activeWallet) return { nfts: [], error: "No active wallet" };

          const allNfts = [];
          for (const c of contracts) {
            try {
              const contractAddr = AztecAddress.fromString(c.address);
              const nft = NFTContract.at(contractAddr, activeWallet);
              // Fetch private NFTs (paginated)
              let page = 0;
              let hasMore = true;
              while (hasMore) {
                try {
                  const simResult = await nft.methods.get_private_nfts(ownerAz, page).simulate();
                  const rawResult = simResult.result !== undefined ? simResult.result : simResult;
                  const tokenIds = Array.isArray(rawResult) ? rawResult : (rawResult?.token_ids || []);
                  const filtered = tokenIds.filter(id => id && id.toString() !== "0");
                  for (const tokenId of filtered) {
                    allNfts.push({
                      contractAddress: c.address,
                      contractName: c.name || "NFT",
                      tokenId: tokenId.toString(),
                      visibility: "private",
                    });
                  }
                  hasMore = filtered.length >= 10;
                  page++;
                } catch {
                  hasMore = false;
                }
              }
            } catch (e) {
              console.warn(`[PXE] NFT query failed for ${c.address}:`, e.message?.slice(0, 80));
            }
          }
          return { nfts: allNfts };
        }

        case "PXE_NFT_TRANSFER": {
          const { contractAddress, tokenId, to, mode, nonce } = msg.data;
          const activeWallet = accountWallets.get(activeAddress)?.wallet;
          if (!activeWallet) return { error: "No active wallet" };

          const { NFTContract } = await import("@aztec/noir-contracts.js/NFT");
          const nft = NFTContract.at(AztecAddress.fromString(contractAddress), activeWallet);
          const fromAddr = AztecAddress.fromString(activeAddress);
          const toAddr = AztecAddress.fromString(to);
          const tokenIdBig = BigInt(tokenId);
          const nonceVal = nonce ? Fr.fromString(nonce) : Fr.ZERO;

          // Set up fee payment for NFT transfer
          let nftPaymentMethod;
          try {
            const fpc = await Promise.race([
              setupSponsoredFPC(activeWallet),
              new Promise((_, rej) => setTimeout(() => rej(new Error("SponsoredFPC timeout")), 30000)),
            ]);
            nftPaymentMethod = fpc.paymentMethod;
          } catch (e) {
            // v4.2.0: no explicit FeeJuicePaymentMethod — wallet uses account balance automatically
            nftPaymentMethod = undefined;
          }
          const nftFeeOpts = { estimateGas: true, estimatedGasPadding: 0.1 };
          if (nftPaymentMethod) nftFeeOpts.paymentMethod = nftPaymentMethod;
          const sendOpts = { from: fromAddr, fee: nftFeeOpts, wait: { timeout: 600_000 } };
          let nftResult;
          switch (mode) {
            case "private":
              nftResult = await nft.methods.transfer_in_private(fromAddr, toAddr, tokenIdBig, nonceVal).send(sendOpts);
              break;
            case "public":
              nftResult = await nft.methods.transfer_in_public(fromAddr, toAddr, tokenIdBig, nonceVal).send(sendOpts);
              break;
            case "shield":
              nftResult = await nft.methods.transfer_to_private(toAddr, tokenIdBig).send(sendOpts);
              break;
            case "unshield":
              nftResult = await nft.methods.transfer_to_public(fromAddr, toAddr, tokenIdBig, nonceVal).send(sendOpts);
              break;
            default:
              return { error: `Unknown NFT transfer mode: ${mode}` };
          }

          const nftReceipt = nftResult.receipt;
          return { txHash: nftReceipt.txHash.toString(), blockNumber: nftReceipt.blockNumber?.toString() || "" };
        }

        // ─── WalletConnect ───────────────────────────────
        case "PXE_WC_INIT": {
          if (wcClient) return { ready: true, sessions: wcClient.session.getAll().length };
          try {
            const { default: SignClient } = await import("@walletconnect/sign-client");
            wcClient = await SignClient.init({
              projectId: "b6c9964115c74a9aa36f9430d21d74aa",
              metadata: {
                name: "Celari Wallet",
                description: "Privacy-first wallet for Aztec Network",
                url: "https://celari.xyz",
                icons: ["https://celari.xyz/icon.png"],
              },
            });

            // Session proposal from dApp
            wcClient.on("session_proposal", async (event) => {
              chrome.runtime.sendMessage({ type: "WC_SESSION_PROPOSAL", proposal: event });
            });

            // Session request from dApp
            wcClient.on("session_request", async (event) => {
              try {
                const result = await handleWcRequest(event.params.request.method, event.params.request.params);
                await wcClient.respond({ topic: event.topic, response: { id: event.id, jsonrpc: "2.0", result } });
              } catch (e) {
                await wcClient.respond({ topic: event.topic, response: { id: event.id, jsonrpc: "2.0", error: { code: -32000, message: e.message } } });
              }
            });

            wcClient.on("session_delete", () => {
              console.log("[PXE] WC session deleted");
            });

            return { ready: true, sessions: wcClient.session.getAll().length };
          } catch (e) {
            console.error("[PXE] WC init failed:", e);
            return { error: e.message };
          }
        }

        case "PXE_WC_PAIR": {
          if (!wcClient) return { error: "WalletConnect not initialized" };
          await wcClient.pair({ uri: msg.data.uri });
          return { paired: true };
        }

        case "PXE_WC_APPROVE": {
          if (!wcClient) return { error: "WalletConnect not initialized" };
          const approveId = msg.data.proposalId ?? msg.data.id;
          const { namespaces } = msg.data;
          const session = await wcClient.approve({ id: approveId, namespaces });
          return { topic: session.topic, peer: session.peer?.metadata?.name || "Unknown" };
        }

        case "PXE_WC_REJECT": {
          if (!wcClient) return { error: "WalletConnect not initialized" };
          const rejectId = msg.data.proposalId ?? msg.data.id;
          await wcClient.reject({ id: rejectId, reason: { code: 4001, message: "User rejected" } });
          return { rejected: true };
        }

        case "PXE_WC_DISCONNECT": {
          if (!wcClient) return { error: "WalletConnect not initialized" };
          await wcClient.disconnect({ topic: msg.data.topic, reason: { code: 6000, message: "User disconnected" } });
          return { disconnected: true };
        }

        case "PXE_WC_SESSIONS": {
          if (!wcClient) return { sessions: [] };
          const sessions = wcClient.session.getAll().map(s => ({
            topic: s.topic,
            peer: s.peer?.metadata?.name || "Unknown dApp",
            peerUrl: s.peer?.metadata?.url || "",
            chains: Object.keys(s.namespaces || {}),
            expiry: s.expiry,
          }));
          return { sessions };
        }

        // ─── Guardian Recovery ────────────────────────────
        case "PXE_SETUP_GUARDIANS": {
          const recoveryArtifact = getRecoveryArtifact();
          if (!recoveryArtifact) return { error: "Recovery contract not available — recompile needed" };
          const acctWallet = getActiveWallet();
          if (!acctWallet) throw new Error("No active account");

          const { guardianHash0, guardianHash1, guardianHash2, threshold, cidPart1, cidPart2 } = msg.data;

          reportProgress("Guardian kontrati hazirlaniyor...");

          const contract = Contract.at(acctWallet.getAddress(), recoveryArtifact, acctWallet);

          reportProgress("Fee odeme ayarlaniyor...");
          const { paymentMethod } = await setupSponsoredFPC(acctWallet);

          reportProgress("Guardian setup tx gonderiliyor...");
          reportProgress("Blok onayi bekleniyor...");
          const guardianResult = await contract.methods
            .setup_guardians(
              Fr.fromString(guardianHash0),
              Fr.fromString(guardianHash1),
              Fr.fromString(guardianHash2),
              Fr.fromString(String(threshold)),
              Fr.fromString(cidPart1),
              Fr.fromString(cidPart2),
            )
            .send({ from: acctWallet.getAddress(), fee: { paymentMethod, estimateGas: true, estimatedGasPadding: 0.1 }, wait: { timeout: 600_000 } });

          const guardianReceipt = guardianResult.receipt;
          console.log(`[PXE] setup_guardians OK — block ${guardianReceipt.blockNumber}`);
          return { success: true, txHash: guardianReceipt.txHash?.toString() };
        }

        case "PXE_INITIATE_RECOVERY": {
          const recoveryArtifact = getRecoveryArtifact();
          if (!recoveryArtifact) return { error: "Recovery contract not available — recompile needed" };
          // Note: Recovery is initiated by someone WITHOUT the current signing key.
          // This is a public function, callable by anyone.
          // For now, we use the current wallet; in production, a new ephemeral wallet is needed.
          if (!wallet) throw new Error("PXE not initialized");

          const { newKeyX, newKeyY, guardianKeyA, guardianKeyB } = msg.data;
          // 3rd guardian slot (threshold up to 3-of-3). Unused → 0, which can
          // never match a non-zero stored guardian hash.
          const guardianKeyC = msg.data.guardianKeyC || "0x0";

          reportProgress("Recovery kontrati hazirlaniyor...");

          // Use the base wallet (not account-specific) for public calls
          const accountAddr = AztecAddress.fromString(msg.data.accountAddress || activeAddress);
          const contract = Contract.at(accountAddr, recoveryArtifact, wallet);

          reportProgress("Fee odeme ayarlaniyor...");
          const { paymentMethod } = await setupSponsoredFPC(wallet);

          reportProgress("Recovery tx gonderiliyor...");
          reportProgress("Blok onayi bekleniyor...");
          const recoveryInitResult = await contract.methods
            .initiate_recovery(
              Fr.fromString(newKeyX),
              Fr.fromString(newKeyY),
              Fr.fromString(guardianKeyA),
              Fr.fromString(guardianKeyB),
              Fr.fromString(guardianKeyC),
            )
            .send({ from: acctWallet.getAddress(), fee: { paymentMethod, estimateGas: true, estimatedGasPadding: 0.1 }, wait: { timeout: 600_000 } });

          const recoveryInitReceipt = recoveryInitResult.receipt;
          console.log(`[PXE] initiate_recovery OK — block ${recoveryInitReceipt.blockNumber}`);
          return { success: true, txHash: recoveryInitReceipt.txHash?.toString() };
        }

        case "PXE_EXECUTE_RECOVERY": {
          const recoveryArtifact = getRecoveryArtifact();
          if (!recoveryArtifact) return { error: "Recovery contract not available — recompile needed" };
          const acctWallet = getActiveWallet();
          if (!acctWallet) throw new Error("No active account");

          const { newKeyX, newKeyY } = msg.data;

          reportProgress("Recovery tamamlaniyor...");

          const contract = Contract.at(acctWallet.getAddress(), recoveryArtifact, acctWallet);

          const { paymentMethod } = await setupSponsoredFPC(acctWallet);

          // Convert hex key coordinates to byte arrays [u8; 32]
          const keyXBytes = hexToBuffer(newKeyX);
          const keyYBytes = hexToBuffer(newKeyY);

          reportProgress("Blok onayi bekleniyor...");
          const execRecoveryResult = await contract.methods
            .execute_recovery(Array.from(keyXBytes), Array.from(keyYBytes))
            .send({ from: acctWallet.getAddress(), fee: { paymentMethod, estimateGas: true, estimatedGasPadding: 0.1 }, wait: { timeout: 600_000 } });

          const execRecoveryReceipt = execRecoveryResult.receipt;
          console.log(`[PXE] execute_recovery OK — block ${execRecoveryReceipt.blockNumber}`);
          return { success: true, txHash: execRecoveryReceipt.txHash?.toString() };
        }

        case "PXE_CANCEL_RECOVERY": {
          const recoveryArtifact = getRecoveryArtifact();
          if (!recoveryArtifact) return { error: "Recovery contract not available — recompile needed" };
          const acctWallet = getActiveWallet();
          if (!acctWallet) throw new Error("No active account");

          reportProgress("Recovery iptal ediliyor...");

          const contract = Contract.at(acctWallet.getAddress(), recoveryArtifact, acctWallet);

          const { paymentMethod } = await setupSponsoredFPC(acctWallet);
          reportProgress("Blok onayi bekleniyor...");
          const cancelResult = await contract.methods.cancel_recovery()
            .send({ from: acctWallet.getAddress(), fee: { paymentMethod, estimateGas: true, estimatedGasPadding: 0.1 }, wait: { timeout: 600_000 } });

          const cancelReceipt = cancelResult.receipt;
          console.log(`[PXE] cancel_recovery OK — block ${cancelReceipt.blockNumber}`);
          return { success: true, txHash: cancelReceipt.txHash?.toString() };
        }

        case "PXE_IS_GUARDIAN_CONFIGURED": {
          try {
            const recoveryArtifact = getRecoveryArtifact();
            if (!recoveryArtifact) return { configured: false };
            const acctWallet = getActiveWallet();
            if (!acctWallet) return { configured: false };

            // Check if the account is actually deployed as a recoverable account
            // before attempting to simulate. If not, this will throw.
            const contract = Contract.at(acctWallet.getAddress(), recoveryArtifact, acctWallet);
            const guardianSim = await contract.methods.is_guardian_configured().simulate();
            const guardianConfigured = guardianSim.result !== undefined ? guardianSim.result : guardianSim;
            return { configured: !!guardianConfigured };
          } catch (e) {
            console.warn(`[PXE] is_guardian_configured check failed: ${e.message?.slice(0, 100)}`);
            return { configured: false };
          }
        }

        case "PXE_IS_RECOVERY_ACTIVE": {
          try {
            const recoveryArtifact = getRecoveryArtifact();
            if (!recoveryArtifact) return { active: false };
            const acctWallet = getActiveWallet();
            if (!acctWallet) return { active: false };
  
            const contract = Contract.at(acctWallet.getAddress(), recoveryArtifact, acctWallet);
            const result = await contract.methods.is_recovery_active().simulate();
            const active = result.result !== undefined ? result.result : result;
            return { active: Boolean(active) };
          } catch (e) {
            return { active: false };
          }
        }

        case "PXE_GET_RECOVERY_CID": {
          const recoveryArtifact = getRecoveryArtifact();
          if (!recoveryArtifact) return { cidPart1: "0", cidPart2: "0" };
          const acctWallet = getActiveWallet();
          if (!acctWallet) throw new Error("No active account");


          const contract = Contract.at(acctWallet.getAddress(), recoveryArtifact, acctWallet);
          const cidSim = await contract.methods.get_recovery_cid().simulate();
          const cidResult = cidSim.result !== undefined ? cidSim.result : cidSim;
          return { cidPart1: cidResult[0]?.toString() || "0", cidPart2: cidResult[1]?.toString() || "0" };
        }

        case "PXE_FEE_JUICE_BALANCE": {
          if (!wallet) throw new Error("PXE not initialized");
          const acctWallet = getActiveWallet();
          if (!acctWallet) throw new Error("No active account");
          try {
            const { getCanonicalFeeJuice } = await import("@aztec/protocol-contracts/fee-juice");
            const { TokenContract } = await import("@aztec/noir-contracts.js/Token");
            const feeJuiceContract = await getCanonicalFeeJuice();
            const feeJuice = TokenContract.at(feeJuiceContract.address, acctWallet);
            const bal = await feeJuice.methods.balance_of_public(acctWallet.getAddress()).simulate();
            const balResult = bal.result !== undefined ? bal.result : bal;
            return { balance: balResult.toString() };
          } catch (e) {
            console.warn(`[PXE] Fee Juice balance check failed: ${e.message}`);
            return { balance: "0" };
          }
        }

        case "PXE_PRIVATE_BALANCE": {
          if (!wallet) throw new Error("PXE not initialized");
          const acctWallet = getActiveWallet();
          if (!acctWallet) throw new Error("No active account");
          const { TokenContract } = await import("@aztec/noir-contracts.js/Token");
          const tokenAddr = AztecAddress.fromString(msg.tokenAddress);
          const ownerAddr = AztecAddress.fromString(msg.ownerAddress);
          const token = TokenContract.at(tokenAddr, acctWallet);
          const bal = await token.methods.balance_of_private(ownerAddr).simulate();
          const balResult = bal.result !== undefined ? bal.result : bal;
          return { balance: balResult.toString() };
        }

        case "PXE_PUBLIC_BALANCE": {
          if (!wallet) throw new Error("PXE not initialized");
          const acctWallet = getActiveWallet();
          if (!acctWallet) throw new Error("No active account");
          const { TokenContract } = await import("@aztec/noir-contracts.js/Token");
          const tokenAddr = AztecAddress.fromString(msg.tokenAddress);
          const ownerAddr = AztecAddress.fromString(msg.ownerAddress);
          const token = TokenContract.at(tokenAddr, acctWallet);
          const bal = await token.methods.balance_of_public(ownerAddr).simulate();
          const balResult = bal.result !== undefined ? bal.result : bal;
          return { balance: balResult.toString() };
        }

        case "PXE_COMPUTE_ADDRESS": {
          if (!wallet) throw new Error("PXE not initialized");
          const { publicKeyX, publicKeyY, privateKeyPkcs8 } = msg.data;

          const compSecretKey = Fr.random();
          const compSalt = Fr.random();

          const compContract = new BrowserCelariPasskeyAccountContract(
            hexToBuffer(publicKeyX),
            hexToBuffer(publicKeyY),
            privateKeyPkcs8,
          );

          console.log("[PXE] Computing deterministic address...");
          const compManager = await AccountManager.create(wallet, compSecretKey, compContract, compSalt);
          const compAddress = compManager.address.toString();
          console.log(`[PXE] Computed address: ${compAddress.slice(0, 22)}...`);

          return {
            address: compAddress,
            secretKey: compSecretKey.toString(),
            salt: compSalt.toString(),
          };
        }

        case "PXE_DEX_GET_QUOTE": {
          try {
            const { tokenIn, tokenOut, amountIn, slippage } = data;
            // Placeholder quote — will be connected to DEX contract
            const estimatedOut = BigInt(amountIn || "0") * 99n / 100n;
            return {
              success: true,
              quote: {
                tokenIn,
                tokenOut,
                amountIn: String(amountIn),
                amountOut: String(estimatedOut),
                priceImpact: 0.01,
                estimatedGas: "500000",
                expiresAt: Date.now() + 30000,
              }
            };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }

        case "PXE_DEX_EXECUTE_SWAP": {
          return { success: false, error: "DEX swap not yet connected to contract" };
        }

        case "PXE_DEX_SUPPORTED_PAIRS": {
          return { success: true, pairs: [] };
        }

        default:
          return { error: `Unknown PXE command: ${msg.type}` };
      }
    } catch (e) {
      const errMsg = e?.message || e?.originalMessage || (typeof e === 'object' ? JSON.stringify(e, Object.getOwnPropertyNames(e || {})).slice(0, 500) : String(e));
      console.error(`[PXE] ${msg.type} failed: ${errMsg}`);
      if (e?.stack) console.error(`[PXE] ${msg.type} stack: ${e.stack.slice(0, 400)}`);
      return { error: errMsg };
    }
  };

  handle()
    .then(r => { console.log(`[PXE] ${msg.type} completed OK`); sendResponse({ success: true, ...r }); })
    .catch(e => { console.error(`[PXE] ${msg.type} UNHANDLED:`, e?.message || e); sendResponse({ success: false, error: e?.message || String(e) }); });
  return true; // Keep message channel open for async response
});

// Disable early banner listener now that real listener is registered
if (typeof __pxeEarlyReady !== "undefined") __pxeEarlyReady = true;

// Signal to background that offscreen listener is active
chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }, () => {
  void chrome.runtime.lastError; // Suppress if background not listening yet
});
console.log("[PXE] Offscreen document loaded — waiting for PXE_INIT");
