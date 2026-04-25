import {
  createPublicClient,
  http,
  type Address,
  type Hash,
  type PublicClient,
  type Chain,
  parseAbi,
  encodeFunctionData,
} from "viem";
import { sepolia } from "viem/chains";

const PORTAL_ABI = parseAbi([
  "function depositToAztecPublic(address token, bytes32 to, uint256 amount, bytes32 secretHash) external returns (bytes32, uint256)",
  "function depositToAztecPrivate(address token, uint256 amount, bytes32 secretHash) external returns (bytes32, uint256)",
  "function depositETHToAztecPublic(bytes32 to, bytes32 secretHash) external payable returns (bytes32, uint256)",
  "function withdraw(address token, address recipient, uint256 amount, bool withCaller, uint256 blockNumber, uint256 leafIndex, bytes32[] path) external",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
]);

export interface L1ClientConfig {
  rpcUrl: string;
  portalAddress: Address;
  chain?: Chain;
}

export class L1Client {
  private publicClient: PublicClient;
  private portalAddress: Address;
  private chain: Chain;

  constructor(config: L1ClientConfig) {
    this.chain = config.chain || sepolia;
    this.portalAddress = config.portalAddress;
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl),
    });
  }

  async getETHBalance(account: Address): Promise<bigint> {
    return this.publicClient.getBalance({ address: account });
  }

  async waitForTransaction(txHash: Hash) {
    return this.publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  getApproveCalldata(token: Address, amount: bigint) {
    return {
      to: token,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [this.portalAddress, amount],
      }),
    };
  }

  getDepositPublicCalldata(
    token: Address,
    to: `0x${string}`,
    amount: bigint,
    secretHash: `0x${string}`
  ) {
    return {
      to: this.portalAddress,
      data: encodeFunctionData({
        abi: PORTAL_ABI,
        functionName: "depositToAztecPublic",
        args: [token, to, amount, secretHash],
      }),
    };
  }

  getDepositETHCalldata(to: `0x${string}`, secretHash: `0x${string}`) {
    return {
      to: this.portalAddress,
      data: encodeFunctionData({
        abi: PORTAL_ABI,
        functionName: "depositETHToAztecPublic",
        args: [to, secretHash],
      }),
      value: BigInt(0),
    };
  }

  getWithdrawCalldata(
    token: Address,
    recipient: Address,
    amount: bigint,
    withCaller: boolean,
    blockNumber: bigint,
    leafIndex: bigint,
    path: `0x${string}`[]
  ) {
    return {
      to: this.portalAddress,
      data: encodeFunctionData({
        abi: PORTAL_ABI,
        functionName: "withdraw",
        args: [token, recipient, amount, withCaller, blockNumber, leafIndex, path],
      }),
    };
  }
}
