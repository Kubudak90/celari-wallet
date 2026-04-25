"use client";

import { useTranslations } from "next-intl";

const socialLinks = [
  { key: "github", href: "https://github.com/Kubudak90/celari-wallet" },
  { key: "docs", href: "#" },
  { key: "twitter", href: "#" },
  { key: "discord", href: "#" },
] as const;

export default function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="px-6 md:px-12 py-12 border-t border-border-default flex flex-col md:flex-row items-center justify-between gap-5 text-center">
      <span className="font-display text-base tracking-[8px] uppercase text-text-dim">
        {t("brand")}
      </span>

      <div className="flex gap-7">
        {socialLinks.map(({ key, href }) => (
          <a
            key={key}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="font-mono text-[9px] tracking-[3px] uppercase text-text-faint hover:text-copper transition-colors duration-300"
          >
            {t(`links.${key}`)}
          </a>
        ))}
      </div>

      <span className="font-mono text-[9px] tracking-[2px] text-text-faint">
        {t("copyright", { year })}
      </span>
    </footer>
  );
}
