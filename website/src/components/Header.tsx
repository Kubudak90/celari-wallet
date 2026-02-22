"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import Logo from "./Logo";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Header() {
  const t = useTranslations("nav");
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { href: "#features", label: t("features") },
    { href: "#how", label: t("howItWorks") },
    { href: "#aztec", label: t("aztec") },
    { href: "#roadmap", label: t("roadmap") },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 md:px-12 py-5 flex items-center justify-between bg-bg/90 backdrop-blur-xl border-b border-border-default">
      {/* Brand */}
      <a href="#" className="flex items-center gap-3.5">
        <Logo size="sm" />
        <span className="font-display text-xl tracking-[8px] uppercase text-text-warm">
          Celari
        </span>
      </a>

      {/* Desktop Nav */}
      <div className="hidden md:flex items-center gap-8">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="font-mono text-[10px] tracking-[3px] uppercase text-text-dim hover:text-copper-light transition-colors duration-300"
          >
            {link.label}
          </a>
        ))}
        <LanguageSwitcher />
        <a
          href="#waitlist"
          className="font-mono text-[10px] tracking-[3px] uppercase text-text-warm bg-burgundy px-6 py-2.5 hover:bg-burgundy-light transition-all duration-300 relative group"
        >
          <span className="absolute inset-[-2px] border border-burgundy opacity-0 group-hover:opacity-100 group-hover:inset-[-5px] transition-all duration-300 pointer-events-none" />
          {t("earlyAccess")}
        </a>
      </div>

      {/* Mobile Toggle */}
      <button
        className="md:hidden flex flex-col gap-1.5 p-2"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        <span className={`w-5 h-px bg-copper transition-all duration-300 ${mobileOpen ? "rotate-45 translate-y-[3.5px]" : ""}`} />
        <span className={`w-5 h-px bg-copper transition-all duration-300 ${mobileOpen ? "opacity-0" : ""}`} />
        <span className={`w-5 h-px bg-copper transition-all duration-300 ${mobileOpen ? "-rotate-45 -translate-y-[3.5px]" : ""}`} />
      </button>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="absolute top-full left-0 right-0 bg-bg/95 backdrop-blur-xl border-b border-border-default p-6 flex flex-col gap-4 md:hidden">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="font-mono text-[10px] tracking-[3px] uppercase text-text-dim hover:text-copper-light transition-colors"
            >
              {link.label}
            </a>
          ))}
          <LanguageSwitcher />
          <a
            href="#waitlist"
            onClick={() => setMobileOpen(false)}
            className="font-mono text-[10px] tracking-[3px] uppercase text-text-warm bg-burgundy px-6 py-2.5 text-center"
          >
            {t("earlyAccess")}
          </a>
        </div>
      )}
    </nav>
  );
}
