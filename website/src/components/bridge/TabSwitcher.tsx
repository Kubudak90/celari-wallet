"use client";

import type { BridgeTab } from "@/types/bridge";

export default function TabSwitcher({
  active,
  onChange,
}: {
  active: BridgeTab;
  onChange: (tab: BridgeTab) => void;
}) {
  return (
    <div className="flex border border-border-default">
      <button
        onClick={() => onChange("deposit")}
        className={`flex-1 py-3 font-mono text-[11px] tracking-[3px] uppercase transition-all duration-300 ${
          active === "deposit"
            ? "bg-burgundy text-text-warm"
            : "bg-transparent text-text-muted hover:text-text-body"
        }`}
      >
        Deposit
      </button>
      <button
        onClick={() => onChange("withdraw")}
        className={`flex-1 py-3 font-mono text-[11px] tracking-[3px] uppercase transition-all duration-300 border-l border-border-default ${
          active === "withdraw"
            ? "bg-burgundy text-text-warm"
            : "bg-transparent text-text-muted hover:text-text-body"
        }`}
      >
        Withdraw
      </button>
    </div>
  );
}
