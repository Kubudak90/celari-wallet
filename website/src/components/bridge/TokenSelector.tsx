"use client";

import { SUPPORTED_TOKENS } from "@/lib/constants";

export default function TokenSelector({
  value,
  onChange,
}: {
  value: `0x${string}`;
  onChange: (address: `0x${string}`) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-mono text-[9px] tracking-[2px] uppercase text-text-dim">
        Token
      </label>
      <div className="flex gap-2">
        {SUPPORTED_TOKENS.map((token) => (
          <button
            key={token.address}
            onClick={() => onChange(token.address)}
            className={`flex items-center gap-2 px-4 py-2.5 border transition-all duration-300 ${
              value === token.address
                ? "border-copper bg-bg-elevated text-text-warm"
                : "border-border-default text-text-muted hover:border-border-warm hover:text-text-body"
            }`}
          >
            <span className="font-mono text-[12px] tracking-[1px]">
              {token.symbol}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
