"use client";

import { useState, useCallback } from "react";
import { parseEther, type Hash } from "viem";
import { useSendTransaction } from "wagmi";
import { useLocalTransactions } from "./useLocalTransactions";
import { getL1Client } from "@/lib/bridge-sdk";
import { ETH_ADDRESS } from "@/lib/constants";

export type WithdrawState =
  | "idle"
  | "l2_exit"
  | "waiting_finalization"
  | "l1_claim"
  | "waiting_claim"
  | "completed"
  | "error";

export function useWithdrawFlow() {
  const [state, setState] = useState<WithdrawState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [l2TxHash, setL2TxHash] = useState<string | null>(null);
  const [l1ClaimHash, setL1ClaimHash] = useState<Hash | undefined>();
  const { sendTransactionAsync } = useSendTransaction();
  const { addTransaction } = useLocalTransactions();

  const withdraw = useCallback(
    async ({ amount, l1Address }: { amount: string; l1Address: `0x${string}` }) => {
      try {
        setError(null);
        const txId = `bridge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const amountWei = parseEther(amount);

        setState("l2_exit");
        if (!window.celari) throw new Error("Celari extension not found");

        const l2Result = await window.celari.sendTransaction({
          type: "bridge_exit",
          amount: amountWei.toString(),
          recipient: l1Address,
        });

        if (!l2Result.success) throw new Error("L2 exit transaction failed");

        const exitTxHash = l2Result.txHash;
        setL2TxHash(exitTxHash || null);
        if (!exitTxHash) throw new Error("No L2 transaction hash returned");

        setState("waiting_finalization");
        let proof: WithdrawProofData | undefined;

        for (let i = 0; i < 60; i++) {
          const proofResult = await window.celari!.getWithdrawProof(exitTxHash);
          if (proofResult.success && proofResult.proof) {
            proof = proofResult.proof;
            break;
          }
          await new Promise((r) => setTimeout(r, 10_000));
        }

        if (!proof) throw new Error("L2 block finalization timed out");

        setState("l1_claim");
        const l1Client = getL1Client();
        const calldata = l1Client.getWithdrawCalldata(
          ETH_ADDRESS,
          l1Address,
          amountWei,
          true,
          BigInt(proof.blockNumber),
          BigInt(proof.leafIndex),
          proof.path
        );

        const claimHash = await sendTransactionAsync({
          to: calldata.to,
          data: calldata.data,
        });
        setL1ClaimHash(claimHash);

        setState("waiting_claim");
        await l1Client.waitForTransaction(claimHash);

        addTransaction({
          id: txId,
          type: "withdraw",
          status: "completed",
          token: ETH_ADDRESS,
          amount: amountWei.toString(),
          from: "Aztec Testnet",
          to: l1Address,
          l1TxHash: claimHash,
          l2TxHash: exitTxHash,
          timestamp: Date.now(),
        });

        setState("completed");
      } catch (err: unknown) {
        setState("error");
        setError(err instanceof Error ? err.message : "Withdrawal failed");
      }
    },
    [sendTransactionAsync, addTransaction]
  );

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
    setL2TxHash(null);
    setL1ClaimHash(undefined);
  }, []);

  return { state, error, withdraw, reset, l2TxHash, l1ClaimHash };
}
