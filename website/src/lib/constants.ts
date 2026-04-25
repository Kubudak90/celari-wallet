export const PORTAL_ADDRESS =
  "0x54b844835905B303d9618Ceb502601993040259B" as const;

export const SEPOLIA_RPC_URL =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

export const AZTEC_PXE_URL =
  process.env.NEXT_PUBLIC_AZTEC_PXE_URL || "http://localhost:8080";

export const ETH_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

export const WETH_ADDRESS =
  "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9" as const;

export const SUPPORTED_TOKENS = [
  { symbol: "ETH", address: ETH_ADDRESS, decimals: 18, isNative: true },
  { symbol: "WETH", address: WETH_ADDRESS, decimals: 18, isNative: false },
] as const;

export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const EXPLORER_URL = "https://sepolia.etherscan.io";
