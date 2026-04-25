import Image from "next/image";

interface LogoProps {
  variant?: "mark" | "lockup";
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const heights = {
  xs: 20,
  sm: 28,
  md: 56,
  lg: 96,
};

export default function Logo({
  variant = "mark",
  size = "sm",
  className,
}: LogoProps) {
  const height = heights[size];
  const isLockup = variant === "lockup";
  // logo-lockup viewBox is 1400×800 → aspect 1.75
  const aspect = isLockup ? 1400 / 800 : 1;
  const width = Math.round(height * aspect);

  return (
    <Image
      src={isLockup ? "/logo-lockup.svg" : "/logo-mark.svg"}
      width={width}
      height={height}
      alt="Celari"
      className={className}
      priority
    />
  );
}
