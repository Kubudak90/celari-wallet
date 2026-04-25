"use client";

type Step = {
  label: string;
  status: "pending" | "active" | "done" | "error";
};

export default function TransactionFlow({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 py-4 px-4 border border-border-default bg-bg/30">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-5 h-5">
            {step.status === "active" && (
              <div className="absolute inset-0 border border-copper animate-pulse-glow" />
            )}
            {step.status === "done" && (
              <svg width="14" height="14" viewBox="0 0 14 14" className="text-copper">
                <path
                  d="M3 7l3 3 5-6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            )}
            {step.status === "error" && (
              <span className="text-burgundy-light font-mono text-[10px]">!</span>
            )}
            {step.status === "pending" && (
              <div className="w-1.5 h-1.5 bg-text-faint" />
            )}
          </div>
          <span
            className={`font-mono text-[11px] tracking-[1px] ${
              step.status === "active"
                ? "text-copper"
                : step.status === "done"
                ? "text-text-body"
                : step.status === "error"
                ? "text-burgundy-light"
                : "text-text-dim"
            }`}
          >
            {step.label}
          </span>
          {step.status === "active" && (
            <div className="ml-auto flex gap-1">
              <div className="w-1 h-1 bg-copper animate-breathe" />
              <div className="w-1 h-1 bg-copper animate-breathe [animation-delay:0.5s]" />
              <div className="w-1 h-1 bg-copper animate-breathe [animation-delay:1s]" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
