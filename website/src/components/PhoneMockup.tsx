"use client";

import Logo from "./Logo";

type Props = {
  totalBalanceLabel?: string;
  totalBalanceValue?: string;
  changeLabel?: string;
};

export default function PhoneMockup({
  totalBalanceLabel = "Total Balance",
  totalBalanceValue = "$12,458.73",
  changeLabel = "▲ 2.35% Today",
}: Props) {
  return (
    <div className="relative">
      {/* iPhone bezel */}
      <div className="w-[300px] h-[610px] rounded-[44px] bg-bg-card border border-border-default shadow-[0_0_60px_rgba(212,168,83,0.15)] p-3">
        <div className="w-full h-full rounded-[36px] bg-bg flex flex-col items-center justify-center gap-6 relative overflow-hidden">
          {/* Notch */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full bg-black/80" />

          {/* Lockup */}
          <div
            className="mt-12 mb-2 opacity-0 animate-fade-up"
            style={{ animationDelay: "0.55s" }}
          >
            <Logo variant="lockup" size="lg" />
          </div>

          <div
            className="text-center px-6 opacity-0 animate-fade-up"
            style={{ animationDelay: "0.7s" }}
          >
            <p className="font-body text-text-muted text-[11px] tracking-[2px] uppercase mb-1">
              {totalBalanceLabel}
            </p>
            <p className="font-mono text-text-warm text-2xl font-semibold">
              {totalBalanceValue}
            </p>
            <p className="font-body text-status-up text-[11px] mt-1">{changeLabel}</p>
          </div>

          {/* Quick action circles */}
          <div className="flex gap-3 mt-2">
            {["↑", "↓", "⇄", "+"].map((icon, i) => (
              <div
                key={i}
                className="w-12 h-12 rounded-full border border-burgundy flex items-center justify-center text-burgundy text-lg"
              >
                {icon}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
