"use client";

export default function ChainIndicator({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  return (
    <div className="flex items-center justify-between py-4 px-4 bg-bg/50 border border-border-default">
      <div className="flex flex-col">
        <span className="font-mono text-[9px] tracking-[2px] uppercase text-text-dim">
          From
        </span>
        <span className="font-mono text-[12px] tracking-[1px] text-text-warm mt-1">
          {from}
        </span>
      </div>

      <div className="flex items-center gap-2 text-copper">
        <div className="w-8 h-px bg-copper/30" />
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-copper"
        >
          <path
            d="M3 8h10m0 0L9.5 4.5M13 8l-3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        <div className="w-8 h-px bg-copper/30" />
      </div>

      <div className="flex flex-col items-end">
        <span className="font-mono text-[9px] tracking-[2px] uppercase text-text-dim">
          To
        </span>
        <span className="font-mono text-[12px] tracking-[1px] text-text-warm mt-1">
          {to}
        </span>
      </div>
    </div>
  );
}
