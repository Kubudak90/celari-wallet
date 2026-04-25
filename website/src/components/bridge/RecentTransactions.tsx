"use client";

import { useLocalTransactions } from "@/hooks/useLocalTransactions";

export default function RecentTransactions() {
  const { transactions } = useLocalTransactions();

  if (transactions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-mono text-[9px] tracking-[3px] uppercase text-text-dim">
        Recent Transactions
      </h3>
      <div className="flex flex-col border border-border-default divide-y divide-border-default">
        {transactions.slice(0, 5).map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[11px] text-text-body capitalize">
                {tx.type}
              </span>
              <span className="font-mono text-[9px] text-text-dim">
                {new Date(tx.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-mono text-[11px] text-text-warm">
                {(Number(tx.amount) / 1e18).toFixed(4)} ETH
              </span>
              <span
                className={`font-mono text-[9px] tracking-[1px] uppercase ${
                  tx.status === "completed"
                    ? "text-copper"
                    : tx.status === "failed"
                    ? "text-burgundy-light"
                    : "text-text-muted"
                }`}
              >
                {tx.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
