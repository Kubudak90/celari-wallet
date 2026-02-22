export function DiamondSeparator({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className ?? ""}`}>
      <div className="w-10 h-px bg-border-warm" />
      <div className="w-[5px] h-[5px] bg-copper rotate-45" />
      <div className="w-10 h-px bg-border-warm" />
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  className,
}: {
  eyebrow: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={`text-center mb-20 ${className ?? ""}`}>
      <p className="font-mono text-[9px] tracking-[6px] uppercase text-copper-muted mb-4">
        {eyebrow}
      </p>
      <h2 className="font-display text-[clamp(28px,4vw,44px)] text-text-warm tracking-[6px] uppercase">
        {title}
      </h2>
      <DiamondSeparator className="mt-5" />
    </div>
  );
}

export function GeoBars({ className }: { className?: string }) {
  const heights = [16, 28, 40, 52, 40, 28, 16];
  return (
    <div className={`flex justify-center gap-[3px] opacity-[0.12] ${className ?? ""}`}>
      {heights.map((h, i) => (
        <div key={i} className="w-[2px] bg-copper" style={{ height: h }} />
      ))}
    </div>
  );
}
