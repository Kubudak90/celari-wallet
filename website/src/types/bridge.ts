export type DepositStatus =
  | "pending_approval"
  | "approving"
  | "pending_deposit"
  | "depositing"
  | "deposited"
  | "pending_claim"
  | "claiming"
  | "completed"
  | "failed";

export interface BridgeTransaction {
  id: string;
  type: "deposit" | "withdraw";
  status: DepositStatus;
  token: string;
  amount: string;
  from: string;
  to: string;
  l1TxHash?: string;
  l2TxHash?: string;
  secret?: string;
  secretHash?: string;
  timestamp: number;
}

export type BridgeTab = "deposit" | "withdraw";

export type Token = {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  isNative: boolean;
};
