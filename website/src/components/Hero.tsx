"use client";

import { useTranslations } from "next-intl";
import Logo from "./Logo";
import { DiamondSeparator } from "./DecoElements";

export default function Hero() {
  const t = useTranslations("hero");

  const tags = [
    t("tags.seedPhrases"),
    t("tags.metadata"),
    t("tags.passkey"),
    t("tags.aztec"),
  ];

  return (
    <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 md:px-12 pt-36 pb-24 relative overflow-hidden">
      {/* Background orbital rings */}
      <div className="absolute inset-0 overflow-hidden opacity-[0.04] pointer-events-none">
        <svg
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          width="800"
          height="800"
          viewBox="0 0 800 800"
          fill="none"
        >
          <circle cx="400" cy="400" r="350" stroke="#4dd4ac" strokeWidth="0.5" />
          <circle cx="400" cy="400" r="280" stroke="#e88c32" strokeWidth="0.5" />
          <circle cx="400" cy="400" r="200" stroke="#5bc4d4" strokeWidth="0.5" />
        </svg>
      </div>

      {/* Radial teal glow */}
      <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(77,212,172,0.06)_0%,transparent_60%)] pointer-events-none" />

      {/* Logo with rotating ring */}
      <div className="relative mb-12 animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <svg
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180px] h-[180px] animate-rotate-slow"
          viewBox="0 0 180 180"
          fill="none"
        >
          <circle cx="90" cy="90" r="85" stroke="#4dd4ac" strokeWidth="0.5" opacity="0.2" />
          <circle cx="90" cy="5" r="2" fill="#4dd4ac" opacity="0.3" />
          <circle cx="175" cy="90" r="2" fill="#e88c32" opacity="0.3" />
          <circle cx="90" cy="175" r="2" fill="#4dd4ac" opacity="0.3" />
          <circle cx="5" cy="90" r="2" fill="#e88c32" opacity="0.3" />
        </svg>
        <Logo size="md" className="relative z-10" />
      </div>

      {/* Title */}
      <h1
        className="font-display text-[clamp(52px,9vw,110px)] tracking-[clamp(14px,4vw,40px)] uppercase text-text-warm leading-tight mb-5 opacity-0 animate-fade-up font-light"
        style={{ animationDelay: "0.3s" }}
      >
        {t("title")}
      </h1>

      {/* Separator */}
      <div className="opacity-0 animate-fade-up" style={{ animationDelay: "0.45s" }}>
        <DiamondSeparator className="mb-7" />
      </div>

      {/* Subtitle */}
      <p
        className="font-heading text-[clamp(16px,2.2vw,22px)] text-text-muted tracking-[2px] mb-12 opacity-0 animate-fade-up font-light italic"
        style={{ animationDelay: "0.45s" }}
      >
        {t("subtitle")}
      </p>

      {/* Tags */}
      <div
        className="flex gap-4 flex-wrap justify-center mb-14 opacity-0 animate-fade-up"
        style={{ animationDelay: "0.6s" }}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="font-mono text-[9px] tracking-[4px] uppercase text-text-dim px-5 py-2 border border-border-default rounded hover:border-copper-muted hover:text-copper-light transition-all duration-300"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* CTA */}
      <div
        className="flex flex-col sm:flex-row gap-4 items-center opacity-0 animate-fade-up"
        style={{ animationDelay: "0.75s" }}
      >
        <a
          href="#waitlist"
          className="font-mono text-[11px] tracking-[4px] uppercase text-bg bg-burgundy px-11 py-4 rounded-lg hover:bg-burgundy-light transition-all duration-400 relative group"
        >
          {t("joinWaitlist")}
        </a>
        <a
          href="https://github.com/Kubudak90/celari-wallet"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] tracking-[4px] uppercase text-text-dim px-11 py-4 border border-border-default rounded-lg hover:border-copper-muted hover:text-copper-light transition-all duration-300"
        >
          {t("readDocs")}
        </a>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-breathe opacity-0 animate-fade-in"
        style={{ animationDelay: "1.1s" }}
      >
        <span className="font-mono text-[8px] tracking-[4px] uppercase text-text-faint">
          {t("scroll")}
        </span>
        <div className="w-px h-8 bg-gradient-to-b from-border-warm to-transparent" />
      </div>
    </section>
  );
}
