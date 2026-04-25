interface WithdrawProofData {
  blockNumber: string;
  leafIndex: string;
  path: `0x${string}`[];
}

interface CelariProvider {
  isCelari: boolean;
  version: string;
  connect(): Promise<{ success: boolean; address?: string }>;
  getAddress(): Promise<{ success: boolean; address?: string }>;
  getCompleteAddress(): Promise<{ success: boolean; completeAddress?: string }>;
  sendTransaction(tx: unknown): Promise<{ success: boolean; txHash?: string }>;
  createAuthWit(messageHash: string): Promise<{ success: boolean }>;
  isConnected(): Promise<boolean>;
  getWithdrawProof(l2TxHash: string): Promise<{
    success: boolean;
    proof?: WithdrawProofData;
    error?: string;
  }>;
  on(event: string, callback: (payload: unknown) => void): void;
}

interface Window {
  celari?: CelariProvider;
}
