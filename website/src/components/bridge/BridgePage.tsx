"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance } from "wagmi";
import { formatEther } from "viem";
import { sepolia } from "viem/chains";
import type { BridgeTab } from "@/types/bridge";
import { ETH_ADDRESS, SUPPORTED_TOKENS } from "@/lib/constants";
import { useDepositFlow } from "@/hooks/useDepositFlow";
import { useWithdrawFlow } from "@/hooks/useWithdrawFlow";
import { useCelariExtension } from "@/hooks/useCelariExtension";
import TabSwitcher from "./TabSwitcher";
import ChainIndicator from "./ChainIndicator";
import TokenSelector from "./TokenSelector";
import AmountInput from "./AmountInput";
import L2AddressInput from "./L2AddressInput";
import TransactionFlow from "./TransactionFlow";
import SecretDisplay from "./SecretDisplay";
import RecentTransactions from "./RecentTransactions";

export default function BridgePage() {
  const [tab, setTab] = useState<BridgeTab>("deposit");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<`0x${string}`>(ETH_ADDRESS);
  const [l2Address, setL2Address] = useState("");

  const { address: l1Address, isConnected } = useAccount();
  const { data: ethBalance } = useBalance({
    address: l1Address,
    chainId: sepolia.id,
  });

  const depositFlow = useDepositFlow();
  const withdrawFlow = useWithdrawFlow();
  const celari = useCelariExtension();

  const selectedToken = SUPPORTED_TOKENS.find((t) => t.address === token);
  const isIdle = depositFlow.state === "idle" && withdrawFlow.state === "idle";

  const handleDeposit = () => {
    if (!amount || !l2Address) return;
    depositFlow.deposit({ token, amount, l2Address });
  };

  const handleWithdraw = () => {
    if (!amount || !l1Address) return;
    withdrawFlow.withdraw({ amount, l1Address });
  };

  const handleReset = () => {
    setAmount("");
    if (tab === "deposit") depositFlow.reset();
    else withdrawFlow.reset();
  };

  const depositSteps = () => {
    const s = depositFlow.state;
    if (s === "idle") return [];
    const steps = [
      {
        label: "Generating secret",
        status: s === "generating_secret" ? "active" : "done",
      },
    ] as { label: string; status: "pending" | "active" | "done" | "error" }[];

    if (token !== ETH_ADDRESS) {
      steps.push({
        label: "Approving token",
        status:
          s === "approving"
            ? "active"
            : s === "waiting_approval"
            ? "active"
            : ["depositing", "waiting_deposit", "confirmed"].includes(s)
            ? "done"
            : "pending",
      });
    }

    steps.push({
      label: "Depositing to bridge",
      status:
        s === "depositing"
          ? "active"
          : s === "waiting_deposit"
          ? "active"
          : s === "confirmed"
          ? "done"
          : s === "error"
          ? "error"
          : "pending",
    });

    steps.push({
      label: "Confirmed on L1",
      status: s === "confirmed" ? "done" : s === "error" ? "error" : "pending",
    });

    return steps;
  };

  const withdrawSteps = () => {
    const s = withdrawFlow.state;
    if (s === "idle") return [];
    return [
      {
        label: "L2 exit transaction",
        status:
          s === "l2_exit"
            ? "active"
            : ["waiting_finalization", "l1_claim", "waiting_claim", "completed"].includes(s)
            ? "done"
            : s === "error"
            ? "error"
            : ("pending" as const),
      },
      {
        label: "Waiting for finalization",
        status:
          s === "waiting_finalization"
            ? "active"
            : ["l1_claim", "waiting_claim", "completed"].includes(s)
            ? "done"
            : s === "error"
            ? "error"
            : ("pending" as const),
      },
      {
        label: "Claiming on L1",
        status:
          s === "l1_claim"
            ? "active"
            : s === "waiting_claim"
            ? "active"
            : s === "completed"
            ? "done"
            : s === "error"
            ? "error"
            : ("pending" as const),
      },
      {
        label: "Completed",
        status:
          s === "completed"
            ? "done"
            : s === "error"
            ? "error"
            : ("pending" as const),
      },
    ] as { label: string; status: "pending" | "active" | "done" | "error" }[];
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="px-6 md:px-12 py-5 flex items-center justify-between border-b border-border-default">
        <a href="/" className="flex items-center gap-3">
          <span className="font-display text-xl tracking-[8px] uppercase text-text-warm">
            Celari
          </span>
          <span className="font-mono text-[9px] tracking-[2px] uppercase text-copper ml-2">
            Bridge
          </span>
        </a>
        <div className="flex items-center gap-4">
          {/* Celari Extension */}
          {celari.isAvailable ? (
            celari.address ? (
              <div className="flex items-center gap-2 px-4 py-2 border border-copper/20 bg-bg-card">
                <div className="w-1.5 h-1.5 bg-copper animate-pulse-glow" />
                <span className="font-mono text-[9px] tracking-[1px] uppercase text-copper">
                  Celari
                </span>
                <span className="font-mono text-[10px] text-text-muted hidden sm:inline">
                  {celari.address.slice(0, 6)}...{celari.address.slice(-4)}
                </span>
              </div>
            ) : (
              <button
                onClick={celari.connect}
                className="flex items-center gap-2 px-4 py-2 border border-copper/30 hover:border-copper/60 transition-all"
              >
                <div className="w-1.5 h-1.5 bg-copper/50" />
                <span className="font-mono text-[9px] tracking-[2px] uppercase text-copper">
                  Connect Celari
                </span>
              </button>
            )
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 border border-border-default opacity-50">
              <div className="w-1.5 h-1.5 bg-text-dim" />
              <span className="font-mono text-[9px] tracking-[2px] uppercase text-text-dim">
                No Celari
              </span>
            </div>
          )}

          {/* L1 Wallet */}
          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus="address"
          />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center px-4 pt-16 pb-24">
        <div className="w-full max-w-[520px] flex flex-col gap-6">
          {/* Bridge Card */}
          <div className="border border-border-default bg-bg-card/80 backdrop-blur-sm">
            {/* Tabs */}
            <TabSwitcher
              active={tab}
              onChange={(t) => {
                setTab(t);
                setAmount("");
                depositFlow.reset();
                withdrawFlow.reset();
              }}
            />

            <div className="p-6 flex flex-col gap-5">
              {/* Chain Indicator */}
              <ChainIndicator
                from={tab === "deposit" ? "Ethereum Sepolia" : "Aztec Testnet"}
                to={tab === "deposit" ? "Aztec Testnet" : "Ethereum Sepolia"}
              />

              {/* Deposit Tab */}
              {tab === "deposit" && (
                <>
                  <TokenSelector value={token} onChange={setToken} />
                  <AmountInput
                    value={amount}
                    onChange={setAmount}
                    balance={
                      ethBalance ? formatEther(ethBalance.value) : undefined
                    }
                    symbol={selectedToken?.symbol ?? "ETH"}
                  />
                  <L2AddressInput
                    value={l2Address}
                    onChange={setL2Address}
                  />

                  {/* Action Button */}
                  {isIdle && (
                    <button
                      onClick={handleDeposit}
                      disabled={!isConnected || !amount || !l2Address}
                      className="w-full py-4 bg-burgundy text-text-warm font-mono text-[11px] tracking-[3px] uppercase hover:bg-burgundy-light transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed relative group"
                    >
                      <span className="absolute inset-[-2px] border border-burgundy opacity-0 group-hover:opacity-100 group-hover:inset-[-4px] transition-all duration-300 pointer-events-none" />
                      {!isConnected
                        ? "Connect Wallet"
                        : "Deposit"}
                    </button>
                  )}

                  {/* Deposit Flow */}
                  <TransactionFlow steps={depositSteps()} />

                  {/* Secret Display */}
                  {depositFlow.state === "confirmed" && depositFlow.secret && (
                    <SecretDisplay secret={depositFlow.secret} />
                  )}

                  {/* Deposit TX Hash */}
                  {depositFlow.depositTxHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${depositFlow.depositTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-copper hover:text-copper-light transition-colors"
                    >
                      View on Etherscan →
                    </a>
                  )}
                </>
              )}

              {/* Withdraw Tab */}
              {tab === "withdraw" && (
                <>
                  <AmountInput
                    value={amount}
                    onChange={setAmount}
                    symbol="ETH"
                  />

                  {/* L1 Address (auto from wallet) */}
                  {isConnected && l1Address && (
                    <div className="flex flex-col gap-2">
                      <label className="font-mono text-[9px] tracking-[2px] uppercase text-text-dim">
                        L1 Recipient
                      </label>
                      <div className="px-4 py-3 border border-border-default bg-bg/50 font-mono text-[12px] text-text-muted">
                        {l1Address}
                      </div>
                    </div>
                  )}

                  {/* Celari Extension Status */}
                  {!celari.isAvailable && (
                    <div className="px-4 py-3 border border-burgundy/30 bg-burgundy-deep/10">
                      <span className="font-mono text-[10px] text-burgundy-light">
                        Celari extension required for withdrawals
                      </span>
                    </div>
                  )}
                  {celari.isAvailable && !celari.address && (
                    <button
                      onClick={celari.connect}
                      className="w-full py-3 border border-copper/30 text-copper font-mono text-[11px] tracking-[2px] uppercase hover:bg-copper/5 transition-all duration-300"
                    >
                      Connect Celari Wallet
                    </button>
                  )}
                  {celari.isAvailable && celari.address && (
                    <div className="flex items-center gap-2 px-4 py-3 border border-copper/20 bg-bg-elevated">
                      <div className="w-2 h-2 bg-copper animate-pulse-glow" />
                      <span className="font-mono text-[11px] text-copper">Celari</span>
                      <span className="font-mono text-[10px] text-text-muted truncate flex-1">
                        {celari.address.slice(0, 10)}...{celari.address.slice(-8)}
                      </span>
                    </div>
                  )}

                  {/* Action Button */}
                  {isIdle && (
                    <button
                      onClick={handleWithdraw}
                      disabled={
                        !isConnected || !amount || !celari.isAvailable
                      }
                      className="w-full py-4 bg-burgundy text-text-warm font-mono text-[11px] tracking-[3px] uppercase hover:bg-burgundy-light transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed relative group"
                    >
                      <span className="absolute inset-[-2px] border border-burgundy opacity-0 group-hover:opacity-100 group-hover:inset-[-4px] transition-all duration-300 pointer-events-none" />
                      {!isConnected
                        ? "Connect Wallet"
                        : !celari.isAvailable
                        ? "Install Celari"
                        : "Withdraw"}
                    </button>
                  )}

                  {/* Withdraw Flow */}
                  <TransactionFlow steps={withdrawSteps()} />

                  {/* Claim TX Hash */}
                  {withdrawFlow.l1ClaimHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${withdrawFlow.l1ClaimHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-copper hover:text-copper-light transition-colors"
                    >
                      View claim on Etherscan →
                    </a>
                  )}
                </>
              )}

              {/* Error */}
              {(depositFlow.error || withdrawFlow.error) && (
                <div className="flex items-center justify-between px-4 py-3 border border-burgundy/40 bg-burgundy-deep/20">
                  <span className="font-mono text-[10px] text-burgundy-light">
                    {depositFlow.error || withdrawFlow.error}
                  </span>
                  <button
                    onClick={handleReset}
                    className="font-mono text-[9px] tracking-[2px] uppercase text-text-muted hover:text-text-warm transition-colors"
                  >
                    RETRY
                  </button>
                </div>
              )}

              {/* Completed */}
              {(depositFlow.state === "confirmed" ||
                withdrawFlow.state === "completed") && (
                <button
                  onClick={handleReset}
                  className="w-full py-3 border border-copper/30 text-copper font-mono text-[11px] tracking-[2px] uppercase hover:bg-copper/5 transition-all"
                >
                  New Transaction
                </button>
              )}
            </div>
          </div>

          {/* Recent Transactions */}
          <RecentTransactions />
        </div>
      </main>
    </div>
  );
}
