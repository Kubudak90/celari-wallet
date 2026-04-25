type Props = {
  className?: string;
  opacity?: number;
  radii?: number[];
};

export default function RadialRings({
  className,
  opacity = 0.18,
  radii = [380, 300, 220, 140],
}: Props) {
  return (
    <div
      className={
        className ??
        "absolute right-[-200px] top-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none"
      }
      style={{ opacity }}
    >
      <svg viewBox="0 0 800 800" fill="none" className="w-full h-full" aria-hidden>
        {radii.map((r) => (
          <circle
            key={r}
            cx="400"
            cy="400"
            r={r}
            stroke="var(--color-burgundy, #D4A853)"
            strokeWidth="1"
          />
        ))}
      </svg>
    </div>
  );
}
