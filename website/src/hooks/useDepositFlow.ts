"use client";

import { useState, useCallback } from "react";
import { parseEther, type Hash } from "viem";
import { useSendTransaction } from "wagmi";
import { getL1Client, generateSecret } from "@/lib/bridge-sdk";
import { useLocalTransactions } from "./useLocalTransactions";
import { ETH_ADDRESS } from "@/lib/constants";

export type DepositState =
  | "idle"
  | "generating_secret"
  | "approving"
  | "waiting_approval"
  | "depositing"
  | "waiting_deposit"
  | "confirmed"
  | "error";

export function useDepositFlow() {
  const [state, setState] = useState<DepositState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [depositTxHash, setDepositTxHash] = useState<Hash | undefined>();
  const { sendTransactionAsync } = useSendTransaction();
  const { addTransaction } = useLocalTransactions();

  const deposit = useCallback(
    async ({
      token,
      amount,
      l2Address,
    }: {
      token: `0x${string}`;
      amount: string;
      l2Address: string;
    }) => {
      try {
        setError(null);
        setState("generating_secret");

        const l1Client = getL1Client();
        const { secret: secretHex, secretHash } = await generateSecret();
        setSecret(secretHex);

        const amountWei = parseEther(amount);
        const isETH = token === ETH_ADDRESS;
        const txId = `bridge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        if (!isETH) {
          setState("approving");
          const approveTx = l1Client.getApproveCalldata(token, amountWei);
          const hash = await sendTransactionAsync({
            to: approveTx.to,
            data: approveTx.data,
          });
          setState("waiting_approval");
          await l1Client.waitForTransaction(hash);
        }

        setState("depositing");
        let hash: Hash;

        if (isETH) {
          const calldata = l1Client.getDepositETHCalldata(
            l2Address as `0x${string}`,
            secretHash as `0x${string}`
          );
          hash = await sendTransactionAsync({
            to: calldata.to,
            data: calldata.data,
            value: amountWei,
          });
        } else {
          const calldata = l1Client.getDepositPublicCalldata(
            token,
            l2Address as `0x${string}`,
            amountWei,
            secretHash as `0x${string}`
          );
          hash = await sendTransactionAsync({
            to: calldata.to,
            data: calldata.data,
          });
        }

        setDepositTxHash(hash);
        setState("waiting_deposit");
        await l1Client.waitForTransaction(hash);

        addTransaction({
          id: txId,
          type: "deposit",
          status: "deposited",
          token,
          amount: amountWei.toString(),
          from: "Sepolia",
          to: l2Address,
          l1TxHash: hash,
          secret: secretHex,
          secretHash,
          timestamp: Date.now(),
        });

        setState("confirmed");
      } catch (err: unknown) {
        setState("error");
        setError(err instanceof Error ? err.message : "Transaction failed");
      }
    },
    [sendTransactionAsync, addTransaction]
  );

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
    setSecret(null);
    setDepositTxHash(undefined);
  }, []);

  return { state, error, secret, deposit, reset, depositTxHash };
}
