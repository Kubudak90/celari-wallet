import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md";
  className?: string;
}

const dimensions = {
  sm: 28,
  md: 80,
};

export default function Logo({ size = "sm", className }: LogoProps) {
  const dim = dimensions[size];

  return (
    <Image
      src="/favicon.png"
      width={dim}
      height={dim}
      alt="Celari"
      className={`rounded-[22%] ${className ?? ""}`}
      priority
    />
  );
}
