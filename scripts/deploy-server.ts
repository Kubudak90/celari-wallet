#!/usr/bin/env npx tsx
/**
 * Celari Wallet -- Deploy API Server
 *
 * Lightweight HTTP server that deploys CelariPasskeyAccount contracts
 * on behalf of the browser extension. End users never touch a terminal.
 *
 * POST /api/deploy
 *   → Generates P256 key pair, deploys account, returns all info
 *
 * GET /api/health
 *   → Returns node connection status
 *
 * Usage:
 *   yarn deploy:server                        # default: testnet
 *   AZTEC_NODE_URL=http://localhost:8080 yarn deploy:server
 */

import { createServer, IncomingMessage, ServerResponse } from "http";

import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { TestWallet } from "@aztec/test-wallet/server";

import { CelariPasskeyAccountContract } from "../src/utils/passkey_account.js";

const PORT = parseInt(process.env.PORT || "3456");
const NODE_URL = process.env.AZTEC_NODE_URL || "https://rpc.testnet.aztec-labs.com/";

// --- Shared Wallet (lazy init) -------------------------------------------

let wallet: Awaited<ReturnType<typeof TestWallet.create>> | null = null;
let walletReady = false;
let initError: string | null = null;

async function getWallet() {
  if (wallet) return wallet;
  console.log(`Connecting to ${NODE_URL}...`);
  const node = createAztecNodeClient(NODE_URL);
  wallet = await TestWallet.create(node, { proverEnabled: true });
  const info = await wallet.getChainInfo();
  console.log(`Connected — Chain ${info.chainId}, Protocol v${info.version}`);

  // Pre-register SponsoredFPC
  const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
  const fpcInstance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    { salt: new Fr(0) },
  );
  await wallet.registerContract(fpcInstance, SponsoredFPCContract.artifact);
  console.log(`SponsoredFPC registered: ${fpcInstance.address.toString().slice(0, 22)}...`);

  walletReady = true;
  return wallet;
}

// Start connecting immediately
getWallet().catch((e) => {
  initError = e.message || String(e);
  console.error("Wallet init failed:", initError);
});

// --- Deploy Logic --------------------------------------------------------

async function deployAccount(): Promise<Record<string, string>> {
  const w = await getWallet();
  const { subtle } = (await import("crypto")).webcrypto as any;

  // 1. Generate fresh P256 key pair
  const keyPair = await subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pubRaw = new Uint8Array(await subtle.exportKey("raw", keyPair.publicKey));
  const pubKeyX = "0x" + Buffer.from(pubRaw.slice(1, 33)).toString("hex");
  const pubKeyY = "0x" + Buffer.from(pubRaw.slice(33, 65)).toString("hex");
  const privateKeyPkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", keyPair.privateKey));

  // 2. Create account contract
  const pubKeyXBuf = Buffer.from(pubKeyX.replace("0x", ""), "hex");
  const pubKeyYBuf = Buffer.from(pubKeyY.replace("0x", ""), "hex");
  const secretKey = Fr.random();
  const salt = Fr.random();

  const accountContract = new CelariPasskeyAccountContract(
    pubKeyXBuf, pubKeyYBuf, undefined, privateKeyPkcs8,
  );
  const accountManager = await w.createAccount({
    secret: secretKey,
    salt,
    contract: accountContract,
  });

  const address = accountManager.address;
  console.log(`Deploying ${address.toString().slice(0, 22)}...`);

  // 3. Deploy with SponsoredFPC
  const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
  const fpcInstance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    { salt: new Fr(0) },
  );
  const paymentMethod = new SponsoredFeePaymentMethod(fpcInstance.address);

  const deployMethod = await accountManager.getDeployMethod();
  const sentTx = await deployMethod.send({
    from: AztecAddress.ZERO,
    fee: { paymentMethod },
  });

  const txHash = await sentTx.getTxHash();
  console.log(`Tx: ${txHash.toString().slice(0, 22)}... — waiting...`);

  const receipt = await sentTx.wait({ timeout: 180_000 });
  console.log(`Deployed! Block ${receipt.blockNumber}`);

  const chainInfo = await w.getChainInfo();

  return {
    address: address.toString(),
    publicKeyX: pubKeyX,
    publicKeyY: pubKeyY,
    secretKey: secretKey.toString(),
    salt: salt.toString(),
    type: "passkey-p256",
    network: NODE_URL.includes("testnet") ? "testnet" : NODE_URL.includes("devnet") ? "devnet" : "local",
    nodeUrl: NODE_URL,
    chainId: chainInfo.chainId.toString(),
    txHash: txHash.toString(),
    blockNumber: receipt.blockNumber?.toString() || "",
    deployedAt: new Date().toISOString(),
  };
}

// --- HTTP Server ---------------------------------------------------------

// --- CORS whitelist --------------------------------------------------------

const CORS_ALLOWED_PATTERNS: RegExp[] = [
  /^chrome-extension:\/\/.+$/,
  /^http:\/\/localhost(:\d+)?$/,
];

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.CORS_ORIGIN;
  if (envOrigins) {
    return envOrigins.split(",").map((o) => o.trim());
  }
  return [];
}

function isOriginAllowed(origin: string): boolean {
  // Check explicit whitelist from env var
  if (getAllowedOrigins().includes(origin)) return true;
  // Check built-in patterns
  return CORS_ALLOWED_PATTERNS.some((pattern) => pattern.test(origin));
}

function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(req: IncomingMessage, res: ServerResponse, status: number, data: unknown) {
  cors(req, res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => resolve(body));
  });
}

const server = createServer(async (req, res) => {
  const url = req.url || "/";

  // CORS preflight
  if (req.method === "OPTIONS") {
    cors(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url === "/api/health" && req.method === "GET") {
    json(req, res, 200, {
      status: walletReady ? "ready" : initError ? "error" : "connecting",
      nodeUrl: NODE_URL,
      error: initError,
    });
    return;
  }

  // Deploy endpoint
  if (url === "/api/deploy" && req.method === "POST") {
    if (!walletReady) {
      json(req, res, 503, { error: "Server starting, try again in a few seconds" });
      return;
    }

    try {
      console.log("\n--- Deploy request received ---");
      const result = await deployAccount();
      json(req, res, 200, result);
    } catch (e: any) {
      console.error("Deploy failed:", e.message || e);
      json(req, res, 500, { error: e.message || "Deploy failed" });
    }
    return;
  }

  json(req, res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`\nCelari Deploy Server`);
  console.log(`http://localhost:${PORT}`);
  console.log(`Node: ${NODE_URL}\n`);
});
