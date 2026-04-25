"use client";

import { useState } from "react";

export default function SecretDisplay({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3 p-4 border border-burgundy/40 bg-burgundy-deep/20">
      <div className="flex items-start gap-2">
        <span className="text-burgundy-light font-mono text-[14px] leading-none mt-0.5">
          !
        </span>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-[2px] uppercase text-burgundy-light">
            Save Your Claim Secret
          </span>
          <span className="font-mono text-[10px] text-text-muted leading-relaxed">
            You need this secret to claim your deposit on L2. If you lose it,
            your funds cannot be recovered.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 bg-bg px-3 py-2 font-mono text-[10px] text-copper break-all border border-border-default">
          {secret}
        </code>
        <button
          onClick={copy}
          className="px-3 py-2 border border-border-default font-mono text-[9px] tracking-[2px] uppercase text-text-muted hover:text-text-warm hover:border-copper/30 transition-all"
        >
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
    </div>
  );
}
