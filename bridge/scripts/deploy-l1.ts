/**
 * Celari Bridge — Deploy L1 Contracts to Sepolia
 *
 * Resolves the L1<->L2 circular dependency (L1 initialize needs the L2 bridge
 * address; the L2 constructor needs the L1 portal address) by splitting into two
 * steps:
 *
 *   1) deploy : deploy the CelariBridgePortal only (no L2 address needed)
 *               -> prints PORTAL_ADDRESS, saves bridge/.l1-deployment.json
 *   2) (deploy L2 with that PORTAL_ADDRESS — yarn bridge:deploy:l2)
 *   3) init   : initialize the portal with the L2 bridge address + add tokens
 *
 * Usage:
 *   SEPOLIA_RPC_URL=... PRIVATE_KEY=... npx tsx bridge/scripts/deploy-l1.ts deploy
 *   ... deploy L2 with PORTAL_ADDRESS ...
 *   SEPOLIA_RPC_URL=... PRIVATE_KEY=... L2_BRIDGE_ADDRESS=... npx tsx bridge/scripts/deploy-l1.ts init
 *
 * (Legacy: with no mode arg AND L2_BRIDGE_ADDRESS already known, runs deploy+init
 *  in one shot — only valid when there is no circular dependency to break.)
 *
 * Environment variables:
 *   SEPOLIA_RPC_URL     — Sepolia RPC endpoint (Infura/Alchemy)
 *   PRIVATE_KEY         — Deployer wallet private key (0x-prefixed, funded EOA)
 *   L2_BRIDGE_ADDRESS   — L2 CelariTokenBridge address (init mode)
 *   PORTAL_ADDRESS      — L1 portal address (init mode; falls back to .l1-deployment.json)
 *   REGISTRY_ADDRESS    — Aztec Registry on Sepolia (optional, uses known address)
 *   WETH_ADDRESS        — WETH on Sepolia (optional, uses known address)
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Hash,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Known Addresses ─────────────────────────────────

const KNOWN_ADDRESSES = {
  // Aztec Testnet contracts on Sepolia
  registry: "0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba" as Address,
  inbox: "0x59f588603d55a45dd3e57d50403c7c359a39bfc9" as Address,
  outbox: "0x5fe98f5a4de64f7b5920b038cd32937ca30bab32" as Address,
  // Sepolia WETH
  weth: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9" as Address,
  // Common testnet tokens
  sepoliaUSDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
};

// ─── ABI (from compiled artifact) ────────────────────

const PORTAL_ABI = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "initialize",
    inputs: [
      { name: "_registry", type: "address" },
      { name: "_l2Bridge", type: "bytes32" },
      { name: "_weth", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addSupportedToken",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "initialized",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

// ─── Load Bytecode ────────────────────────────────────

function loadBytecode(): `0x${string}` {
  const artifactPath = join(
    process.cwd(),
    "bridge/contracts/l1/out/CelariBridgePortal.sol/CelariBridgePortal.json"
  );
  try {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
    const bytecode = artifact?.bytecode?.object as string | undefined;
    if (!bytecode) {
      throw new Error("bytecode.object not found in artifact");
    }
    return (bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`) as `0x${string}`;
  } catch (err) {
    console.error("Error loading bytecode from compiled artifact:", err);
    console.error("Run `cd bridge/contracts/l1 && forge build` first.");
    process.exit(1);
  }
}

// ─── Helpers ─────────────────────────────────────────

async function waitForReceipt(
  publicClient: ReturnType<typeof createPublicClient>,
  hash: Hash,
  label: string
) {
  console.log(`  Waiting for ${label} (${hash})...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction ${label} reverted (status: ${receipt.status})`);
  }
  console.log(`  ${label} confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

const DEPLOYMENT_PATH = () => join(process.cwd(), "bridge", ".l1-deployment.json");

function saveDeployment(obj: Record<string, unknown>) {
  writeFileSync(DEPLOYMENT_PATH(), JSON.stringify(obj, null, 2));
  return DEPLOYMENT_PATH();
}

function readDeployment(): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(DEPLOYMENT_PATH(), "utf-8"));
  } catch {
    return null;
  }
}

function getClients(rpcUrl: string, privateKey: string) {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  return { account, publicClient, walletClient };
}

async function ensureFunded(
  publicClient: ReturnType<typeof createPublicClient>,
  address: Address
) {
  const balance = await publicClient.getBalance({ address });
  console.log("Deployer balance:", (Number(balance) / 1e18).toFixed(4), "ETH");
  if (balance < BigInt("10000000000000000")) {
    console.error("Error: Insufficient balance. Need at least 0.01 ETH for deployment.");
    console.error("Get Sepolia ETH from: https://sepoliafaucet.com/");
    process.exit(1);
  }
}

// ─── Step 1: deploy the portal (no L2 address required) ──────────────────────

async function deployPortal(clients: ReturnType<typeof getClients>) {
  const { account, publicClient, walletClient } = clients;
  console.log("Loading compiled bytecode...");
  const bytecode = loadBytecode();
  console.log("Bytecode loaded:", bytecode.length / 2 - 1, "bytes\n");

  console.log("Deploying CelariBridgePortal...");
  const deployHash = await walletClient.deployContract({ abi: PORTAL_ABI, bytecode, args: [] });
  const receipt = await waitForReceipt(publicClient, deployHash, "deploy");
  const portalAddress = receipt.contractAddress;
  if (!portalAddress) throw new Error("Deploy succeeded but contractAddress is null");
  console.log("CelariBridgePortal deployed at:", portalAddress, "\n");

  saveDeployment({
    network: "sepolia",
    portalAddress,
    deployer: account.address,
    deployTxHash: deployHash,
    deployedAt: new Date().toISOString(),
    status: "deployed-uninitialized",
  });
  return { portalAddress, deployHash };
}

// ─── Step 3: initialize the deployed portal + add tokens ─────────────────────

async function initPortal(
  clients: ReturnType<typeof getClients>,
  portalAddress: Address,
  l2BridgeAddress: string,
  registryAddress: Address,
  wethAddress: Address
) {
  const { publicClient, walletClient } = clients;
  console.log("Initializing portal", portalAddress, "with L2 bridge", l2BridgeAddress);

  const l2BridgeBytes32 = (
    l2BridgeAddress.startsWith("0x")
      ? l2BridgeAddress.padEnd(66, "0")
      : `0x${l2BridgeAddress.padEnd(64, "0")}`
  ) as `0x${string}`;

  const initHash = await walletClient.writeContract({
    address: portalAddress,
    abi: PORTAL_ABI,
    functionName: "initialize",
    args: [registryAddress, l2BridgeBytes32, wethAddress],
  });
  await waitForReceipt(publicClient, initHash, "initialize");

  console.log("Adding supported tokens...");
  const addWethHash = await walletClient.writeContract({
    address: portalAddress,
    abi: PORTAL_ABI,
    functionName: "addSupportedToken",
    args: [wethAddress],
  });
  await waitForReceipt(publicClient, addWethHash, "addSupportedToken(WETH)");
  console.log("  WETH added:", wethAddress);

  const usdcAddress = KNOWN_ADDRESSES.sepoliaUSDC;
  const addUsdcHash = await walletClient.writeContract({
    address: portalAddress,
    abi: PORTAL_ABI,
    functionName: "addSupportedToken",
    args: [usdcAddress],
  });
  await waitForReceipt(publicClient, addUsdcHash, "addSupportedToken(USDC)");
  console.log("  USDC added:", usdcAddress);

  const prev = readDeployment() || {};
  saveDeployment({
    ...prev,
    network: "sepolia",
    portalAddress,
    registry: registryAddress,
    l2Bridge: l2BridgeAddress,
    weth: wethAddress,
    supportedTokens: [wethAddress, usdcAddress],
    initTxHash: initHash,
    initializedAt: new Date().toISOString(),
    status: "initialized",
  });
  return { initHash };
}

// ─── Main ────────────────────────────────────────────

async function main() {
  const mode = (process.argv[2] || "").toLowerCase();
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;

  if (!rpcUrl) {
    console.error("Error: SEPOLIA_RPC_URL environment variable required");
    console.error("  Example: export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY");
    process.exit(1);
  }
  if (!privateKey) {
    console.error("Error: PRIVATE_KEY environment variable required");
    process.exit(1);
  }

  const registryAddress = (process.env.REGISTRY_ADDRESS as Address) || KNOWN_ADDRESSES.registry;
  const wethAddress = (process.env.WETH_ADDRESS as Address) || KNOWN_ADDRESSES.weth;

  // ── Validate mode-specific inputs BEFORE any network/funding call ──
  let initPortalAddress: Address | undefined;
  let l2BridgeAddress: string | undefined;
  if (mode === "init") {
    initPortalAddress = (process.env.PORTAL_ADDRESS as Address) ||
      (readDeployment()?.portalAddress as Address);
    l2BridgeAddress = process.env.L2_BRIDGE_ADDRESS;
    if (!initPortalAddress) {
      console.error("Error: PORTAL_ADDRESS required (env or bridge/.l1-deployment.json). Run `deploy` first.");
      process.exit(1);
    }
    if (!l2BridgeAddress) {
      console.error("Error: L2_BRIDGE_ADDRESS required. Deploy L2 first: yarn bridge:deploy:l2");
      process.exit(1);
    }
  } else if (mode !== "deploy") {
    // Auto/legacy one-shot — only valid when L2 is already known.
    l2BridgeAddress = process.env.L2_BRIDGE_ADDRESS;
    if (!l2BridgeAddress) {
      console.error("L1<->L2 circular dependency — deploy in 3 steps:");
      console.error("  1) npx tsx bridge/scripts/deploy-l1.ts deploy                       # deploy portal, prints PORTAL_ADDRESS");
      console.error("  2) PORTAL_ADDRESS=<portal> L1_TOKEN=<erc20> yarn bridge:deploy:l2   # deploy L2 bridge");
      console.error("  3) L2_BRIDGE_ADDRESS=<l2> npx tsx bridge/scripts/deploy-l1.ts init  # initialize portal");
      process.exit(1);
    }
  }

  const clients = getClients(rpcUrl, privateKey);

  console.log("╔═══════════════════════════════════════════╗");
  console.log("║   Celari Bridge — L1 Deployment (Sepolia) ║");
  console.log("╚═══════════════════════════════════════════╝\n");
  console.log("Deployer:", clients.account.address);
  console.log("Mode:", mode || "(auto)");
  console.log("Registry:", registryAddress);
  console.log("WETH:", wethAddress, "\n");
  await ensureFunded(clients.publicClient, clients.account.address);
  console.log();

  if (mode === "deploy") {
    const { portalAddress } = await deployPortal(clients);
    console.log("Next steps (resolves the L1<->L2 circular dependency):");
    console.log("  1) PORTAL_ADDRESS=" + portalAddress + " L1_TOKEN=<erc20> yarn bridge:deploy:l2");
    console.log("  2) L2_BRIDGE_ADDRESS=<from L2 deploy> npx tsx bridge/scripts/deploy-l1.ts init");
    return;
  }

  if (mode === "init") {
    await initPortal(clients, initPortalAddress!, l2BridgeAddress!, registryAddress, wethAddress);
    console.log("\nPortal initialized:", initPortalAddress);
    return;
  }

  // Auto/legacy one-shot (l2BridgeAddress validated above).
  const { portalAddress } = await deployPortal(clients);
  await initPortal(clients, portalAddress, l2BridgeAddress!, registryAddress, wethAddress);

  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║           Deployment Complete!            ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log("CelariBridgePortal:", portalAddress);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
