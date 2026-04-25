"use client";

import { useCelariExtension } from "@/hooks/useCelariExtension";

export default function L2AddressInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { isAvailable, address, connect } = useCelariExtension();

  const handleConnect = async () => {
    const addr = await connect();
    if (addr) onChange(addr);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="font-mono text-[9px] tracking-[2px] uppercase text-text-dim">
        L2 Recipient (Aztec)
      </label>

      {isAvailable && !address && (
        <button
          onClick={handleConnect}
          className="w-full py-3 border border-copper/30 text-copper font-mono text-[11px] tracking-[2px] uppercase hover:bg-copper/5 transition-all duration-300"
        >
          Connect Celari Wallet
        </button>
      )}

      {isAvailable && address && (
        <div className="flex items-center gap-2 px-4 py-3 border border-copper/20 bg-bg-elevated">
          <div className="w-2 h-2 bg-copper animate-pulse-glow" />
          <span className="font-mono text-[11px] text-copper">Celari</span>
          <span className="font-mono text-[10px] text-text-muted truncate flex-1">
            {address.slice(0, 10)}...{address.slice(-8)}
          </span>
          <button
            onClick={() => onChange("")}
            className="font-mono text-[9px] text-text-dim hover:text-text-body transition-colors"
          >
            CLEAR
          </button>
        </div>
      )}

      <input
        type="text"
        placeholder={
          isAvailable
            ? "Or paste L2 address manually"
            : "Paste Aztec L2 address"
        }
        value={isAvailable && address && !value ? address : value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg/50 border border-border-default px-4 py-3 font-mono text-[12px] text-text-warm placeholder:text-text-faint outline-none focus:border-copper/50 transition-colors"
      />

      {!isAvailable && (
        <p className="font-mono text-[9px] text-text-dim">
          Install Celari extension for auto-detection
        </p>
      )}
    </div>
  );
}
