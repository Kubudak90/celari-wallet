"use client";

export default function AmountInput({
  value,
  onChange,
  balance,
  symbol,
}: {
  value: string;
  onChange: (v: string) => void;
  balance?: string;
  symbol: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="font-mono text-[9px] tracking-[2px] uppercase text-text-dim">
          Amount
        </label>
        {balance && (
          <button
            onClick={() => onChange(balance)}
            className="font-mono text-[9px] tracking-[1px] text-copper hover:text-copper-light transition-colors"
          >
            BAL: {Number(balance).toFixed(4)} {symbol}
          </button>
        )}
      </div>
      <div className="flex items-center border border-border-default bg-bg/50 focus-within:border-copper/50 transition-colors">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^[0-9]*\.?[0-9]*$/.test(v)) onChange(v);
          }}
          className="flex-1 bg-transparent px-4 py-3 font-mono text-[16px] text-text-warm placeholder:text-text-faint outline-none"
        />
        <span className="pr-4 font-mono text-[11px] tracking-[2px] text-text-dim">
          {symbol}
        </span>
      </div>
    </div>
  );
}
