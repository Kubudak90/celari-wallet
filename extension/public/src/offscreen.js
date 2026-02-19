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

import { TestWallet } from "@aztec/test-wallet/client/lazy";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { DefaultAccountContract } from "@aztec/accounts/defaults";
import { AuthWitness } from "@aztec/stdlib/auth-witness";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { loadContractArtifact } from "@aztec/aztec.js/abi";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import { WalletSchema } from "@aztec/aztec.js/wallet";

// Contract artifact (compiled Noir → JSON)
import CelariPasskeyAccountArtifactJson from "../../../contracts/celari_passkey_account/target/celari_passkey_account-CelariPasskeyAccount.json" with { type: "json" };
const CelariPasskeyAccountArtifact = loadContractArtifact(CelariPasskeyAccountArtifactJson);

// --- Browser-compatible SponsoredFPC setup ---

async function setupSponsoredFPC(walletInstance) {
  const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
  const fpcInstance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    { salt: new Fr(0) },
  );
  await walletInstance.registerContract(fpcInstance, SponsoredFPCContract.artifact);
  return {
    instance: fpcInstance,
    paymentMethod: new SponsoredFeePaymentMethod(fpcInstance.address),
  };
}

// --- State ---

let wallet = null;       // TestWallet instance (wraps PXE)
let nodeClient = null;   // AztecNode client (for wallet-sdk protocol)
let pxeReady = false;
let initError = null;

// Multi-account support: address → { manager, wallet (AccountWithSecretKey) }
const accountWallets = new Map();
let activeAddress = null;

function getActiveWallet() {
  if (!activeAddress) return null;
  return accountWallets.get(activeAddress)?.wallet || null;
}

function getActiveManager() {
  if (!activeAddress) return null;
  return accountWallets.get(activeAddress)?.manager || null;
}

// --- Browser P256 Auth Witness Provider ---

class BrowserP256AuthWitnessProvider {
  constructor(privateKeyBase64) {
    this._pkcs8Base64 = privateKeyBase64;
  }

  async createAuthWit(messageHash) {
    // Decode base64 → PKCS8 Uint8Array
    const binaryStr = atob(this._pkcs8Base64);
    const pkcs8Bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      pkcs8Bytes[i] = binaryStr.charCodeAt(i);
    }

    // Import P256 key using browser WebCrypto
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8Bytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );

    // Sign: WebCrypto SHA-256 hashes internally, matching Noir contract's sha256(outer_hash)
    const hashBytes = messageHash.toBuffer();
    const sigRaw = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        hashBytes,
      ),
    );

    // Pack 64-byte P256 signature (r || s) into AuthWitness fields
    const witnessFields = [];
    for (let i = 0; i < 64; i++) {
      witnessFields.push(sigRaw[i]);
    }

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
      constructorArgs: [this._pubKeyX, this._pubKeyY],
    };
  }

  getAuthWitnessProvider(_address) {
    return new BrowserP256AuthWitnessProvider(this._privateKeyBase64);
  }
}

// --- PXE Initialization ---

async function initPXE(nodeUrl) {
  console.log(`[PXE] Connecting to ${nodeUrl}...`);
  const node = createAztecNodeClient(nodeUrl);
  nodeClient = node; // Store for wallet-sdk protocol
  wallet = await TestWallet.create(node, { proverEnabled: true });

  const info = await wallet.getChainInfo();
  console.log(`[PXE] Connected — Chain ${info.chainId}, Protocol v${info.version}`);

  // Pre-register SponsoredFPC for gas-free transactions
  try {
    const { instance: fpcInstance } = await setupSponsoredFPC(wallet);
    console.log(`[PXE] SponsoredFPC registered: ${fpcInstance.address.toString().slice(0, 22)}...`);
  } catch (e) {
    console.warn(`[PXE] SponsoredFPC setup skipped: ${e.message?.slice(0, 80)}`);
  }

  pxeReady = true;
  return { status: "ready", chainId: info.chainId.toString() };
}

// --- Account Registration ---

async function registerAccount(data) {
  if (!wallet) throw new Error("PXE not initialized");

  const { publicKeyX, publicKeyY, secretKey, salt, privateKeyPkcs8 } = data;

  const pubKeyXBuf = hexToBuffer(publicKeyX);
  const pubKeyYBuf = hexToBuffer(publicKeyY);

  const accountContract = new BrowserCelariPasskeyAccountContract(
    pubKeyXBuf,
    pubKeyYBuf,
    privateKeyPkcs8,
  );

  const manager = await wallet.createAccount({
    secret: Fr.fromHexString(secretKey),
    salt: Fr.fromHexString(salt),
    contract: accountContract,
  });

  const acctWallet = await manager.getAccount();
  const address = manager.address.toString();

  accountWallets.set(address, { manager, wallet: acctWallet });
  if (!activeAddress) activeAddress = address;

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

  const token = await TokenContract.at(tokenAddr, acctWallet);
  const { paymentMethod } = await setupSponsoredFPC(wallet);

  console.log(`[PXE] ${transferType} transfer: ${amount} to ${to.slice(0, 16)}...`);

  let tx;
  switch (transferType) {
    case "private":
      // Private-to-private: caller's private notes → recipient's private note
      tx = await token.methods
        .transfer(recipientAddr, rawAmount)
        .send({ fee: { paymentMethod } });
      break;

    case "public":
      // Public-to-public: public balance mapping
      tx = await token.methods
        .transfer_in_public(recipientAddr, rawAmount)
        .send({ fee: { paymentMethod } });
      break;

    case "shield":
      // Public → Private: move caller's public balance into recipient's private notes
      tx = await token.methods
        .transfer_to_private(recipientAddr, rawAmount)
        .send({ fee: { paymentMethod } });
      break;

    case "unshield":
      // Private → Public: nullify caller's private notes, credit recipient's public balance
      tx = await token.methods
        .transfer_to_public(acctWallet.getAddress(), recipientAddr, rawAmount, 0)
        .send({ fee: { paymentMethod } });
      break;

    default:
      throw new Error(`Unknown transfer type: ${transferType}`);
  }

  const txHash = await tx.getTxHash();
  console.log(`[PXE] Tx: ${txHash.toString().slice(0, 22)}... — proving + waiting...`);

  const receipt = await tx.wait({ timeout: 300_000 });
  console.log(`[PXE] Confirmed! Block ${receipt.blockNumber}`);

  return {
    txHash: txHash.toString(),
    blockNumber: receipt.blockNumber?.toString() || "",
  };
}

// --- Balance Query ---

async function getBalances(data) {
  if (!wallet) throw new Error("PXE not initialized");

  const { address, tokens } = data;
  if (!tokens || tokens.length === 0) return [];

  const results = [];
  const { TokenContract } = await import("@aztec/noir-contracts.js/Token");

  for (const tk of tokens) {
    try {
      const tokenAddr = AztecAddress.fromString(tk.address);
      const addr = AztecAddress.fromString(address);

      // Use accountWallet for private balance (needs account keys), wallet for public
      const tokenForPublic = await TokenContract.at(tokenAddr, wallet);
      const publicBal = await tokenForPublic.methods.balance_of_public(addr).simulate({});
      const publicBalance = Number(publicBal) / 10 ** tk.decimals;

      let privateBalance = 0;
      const acctWallet = getActiveWallet();
      if (acctWallet) {
        try {
          const tokenForPrivate = await TokenContract.at(tokenAddr, acctWallet);
          const privateBal = await tokenForPrivate.methods.balance_of_private(addr).simulate({});
          privateBalance = Number(privateBal) / 10 ** tk.decimals;
        } catch (e) {
          console.warn(`[PXE] Private balance unavailable for ${tk.symbol}: ${e.message?.slice(0, 60)}`);
        }
      }

      const fmt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

      results.push({
        name: tk.name,
        symbol: tk.symbol,
        publicBalance: fmt(publicBalance),
        privateBalance: fmt(privateBalance),
        balance: fmt(publicBalance + privateBalance),
        usdValue: "0.00",
      });
    } catch (e) {
      console.warn(`[PXE] Balance query failed for ${tk.symbol}: ${e.message?.slice(0, 80)}`);
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

  return results;
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
  if (!wallet) throw new Error("PXE not initialized");

  const { publicKeyX, publicKeyY, privateKeyPkcs8 } = data;

  // Generate secretKey + salt using browser-safe Fr.random()
  const secretKey = Fr.random();
  const salt = Fr.random();

  const accountContract = new BrowserCelariPasskeyAccountContract(
    hexToBuffer(publicKeyX),
    hexToBuffer(publicKeyY),
    privateKeyPkcs8,
  );

  console.log("[PXE] Creating account manager...");
  const manager = await wallet.createAccount({
    secret: secretKey,
    salt,
    contract: accountContract,
  });
  const address = manager.address;
  console.log(`[PXE] Account address: ${address.toString().slice(0, 22)}... — deploying...`);

  // Setup SponsoredFPC for gas-free deploy
  const { paymentMethod } = await setupSponsoredFPC(wallet);

  // Deploy the account contract on-chain
  const deployMethod = await manager.getDeployMethod();
  const sentTx = await deployMethod.send({
    from: AztecAddress.ZERO,
    fee: { paymentMethod },
  });

  const txHash = await sentTx.getTxHash();
  console.log(`[PXE] Deploy tx: ${txHash.toString().slice(0, 22)}... — waiting for confirmation...`);

  const receipt = await sentTx.wait({ timeout: 180_000 });
  console.log(`[PXE] Account deployed! Block ${receipt.blockNumber}`);

  // Store in multi-account map
  const acctWallet = await manager.getAccount();
  const addrStr = address.toString();
  accountWallets.set(addrStr, { manager, wallet: acctWallet });
  activeAddress = addrStr;

  return {
    address: addrStr,
    secretKey: secretKey.toString(),
    salt: salt.toString(),
    txHash: txHash.toString(),
    blockNumber: receipt.blockNumber?.toString() || "",
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
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// --- Wallet-SDK Method Dispatcher ---
// Handles standard Aztec wallet-sdk method calls from dApps.
// Delegates to acctWallet (AccountWithSecretKey) for account-scoped methods,
// and to wallet (TestWallet) for PXE-level methods.

async function handleWalletMethod(method, args) {
  if (!wallet) throw new Error("PXE not initialized");

  switch (method) {
    case "getAccounts":
      return Array.from(accountWallets.keys()).map(addr => ({
        item: AztecAddress.fromString(addr),
        alias: "",
      }));

    case "getChainInfo":
      return await wallet.getChainInfo();

    case "getAddressBook": {
      const senders = await wallet.getSenders();
      return senders.map(s => ({ item: s, alias: "" }));
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

    // Account-scoped methods: delegate to active account wallet
    case "simulateTx":
    case "sendTx":
    case "profileTx":
    case "createAuthWit":
    case "simulateUtility":
    case "getPrivateEvents": {
      const acctWallet = getActiveWallet();
      if (!acctWallet) throw new Error("No account registered in PXE");
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
  if (!msg || !msg.type?.startsWith("PXE_")) return false;

  const handle = async () => {
    try {
      switch (msg.type) {
        case "PXE_INIT":
          return await initPXE(msg.nodeUrl);

        case "PXE_STATUS":
          return {
            ready: pxeReady,
            error: initError,
            hasAccount: accountWallets.size > 0,
            accountCount: accountWallets.size,
            activeAddress,
          };

        case "PXE_REGISTER_ACCOUNT":
          return await registerAccount(msg.data);

        case "PXE_TRANSFER":
          return await executeTransfer(msg.data);

        case "PXE_BALANCES":
          return await getBalances(msg.data);

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

        case "PXE_GET_ACCOUNTS":
          return {
            accounts: Array.from(accountWallets.keys()),
            activeAddress,
          };

        // Wallet-SDK protocol: standard Aztec wallet method calls
        case "PXE_WALLET_METHOD": {
          const parsed = JSON.parse(msg.rawMessage);
          const method = parsed.type;
          const rawArgs = parsed.args || [];

          // Use WalletSchema Zod schemas to deserialize args into proper Aztec types
          const schema = WalletSchema[method];
          let typedArgs = rawArgs;
          if (schema && typeof schema.parameters === "function") {
            try {
              typedArgs = schema.parameters().parse(rawArgs);
            } catch (e) {
              console.warn(`[PXE] WalletSchema parse failed for ${method}, using raw args:`, e.message?.slice(0, 80));
            }
          }

          const result = await handleWalletMethod(method, typedArgs);

          // Serialize response with Aztec-aware JSON (handles bigint, Buffer, etc.)
          const responseJson = jsonStringify({
            messageId: parsed.messageId,
            result,
            walletId: "celari-wallet",
          });
          return { rawResponse: responseJson };
        }

        default:
          return { error: `Unknown PXE command: ${msg.type}` };
      }
    } catch (e) {
      console.error(`[PXE] ${msg.type} failed:`, e);
      return { error: e.message || String(e) };
    }
  };

  handle().then(sendResponse);
  return true; // Keep message channel open for async response
});

console.log("[PXE] Offscreen document loaded — waiting for PXE_INIT");
