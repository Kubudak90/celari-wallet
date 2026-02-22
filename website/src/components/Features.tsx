"use client";

import { useTranslations } from "next-intl";
import { SectionHeader } from "./DecoElements";
import AnimateOnScroll from "./ScrollAnimation";

const featureIcons = [
  // 01 - Shield (Private)
  <svg key="shield" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C87941" strokeWidth="1.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  // 02 - Login (Passkey)
  <svg key="login" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C87941" strokeWidth="1.2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4m-5-4l5-5-5-5m5 5H3" /></svg>,
  // 03 - Globe (Metadata)
  <svg key="globe" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C87941" strokeWidth="1.2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
  // 04 - Lock (Account Abstraction)
  <svg key="lock" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C87941" strokeWidth="1.2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
  // 05 - Code (Open Source)
  <svg key="code" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C87941" strokeWidth="1.2"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
  // 06 - Pen (Crafted UX)
  <svg key="pen" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C87941" strokeWidth="1.2"><path d="M20.24 12.24a6 6 0 00-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /></svg>,
];

const featureKeys = [
  "private",
  "passkey",
  "metadata",
  "abstraction",
  "openSource",
  "ux",
] as const;

export default function Features() {
  const t = useTranslations("features");

  return (
    <section id="features" className="py-20 md:py-30 px-6 md:px-12 max-w-[1200px] mx-auto">
      <SectionHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border-default">
        {featureKeys.map((key, i) => (
          <AnimateOnScroll key={key} delay={i * 0.08}>
            <div className="bg-bg-card p-8 md:p-12 relative group hover:bg-bg-elevated hover:-translate-y-1 hover:z-10 hover:shadow-[0_20px_60px_rgba(0,0,0,0.3)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
              {/* Top gradient line on hover */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-burgundy via-copper to-burgundy opacity-0 group-hover:opacity-100 transition-opacity duration-400" />

              {/* Diamond icon container */}
              <div className="w-11 h-11 flex items-center justify-center mb-6 relative">
                <div className="absolute inset-0 border border-border-default rotate-45 group-hover:border-copper transition-colors duration-300" />
                {featureIcons[i]}
              </div>

              <p className="font-mono text-[9px] tracking-[2px] text-text-faint mb-4" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="font-heading text-xl text-text-warm mb-2.5 tracking-[1px]">
                {t(`cards.${key}.title`)}
              </h3>
              <p className="text-[13px] text-text-muted leading-[1.8]">
                {t(`cards.${key}.description`)}
              </p>
            </div>
          </AnimateOnScroll>
        ))}
      </div>
    </section>
  );
}
