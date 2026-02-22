"use client";

import { useTranslations } from "next-intl";
import AnimateOnScroll from "./ScrollAnimation";

const statKeys = ["encrypted", "metadata", "proof"] as const;

export default function AztecSection() {
  const t = useTranslations("aztec");

  return (
    <section id="aztec" className="py-20 md:py-30 px-6 md:px-12 max-w-[1000px] mx-auto text-center">
      {/* Badge */}
      <AnimateOnScroll>
        <div className="inline-flex items-center gap-2.5 px-6 py-2.5 border border-border-default mb-10 relative">
          <span className="absolute inset-[-4px] border border-border-default opacity-30 pointer-events-none" />
          <div className="w-1.5 h-1.5 bg-copper rotate-45 animate-breathe" />
          <span className="font-mono text-[10px] tracking-[3px] uppercase text-text-dim">
            {t("badge")}
          </span>
        </div>
      </AnimateOnScroll>

      {/* Title */}
      <AnimateOnScroll delay={0.1}>
        <h2 className="font-display text-[clamp(24px,3.5vw,38px)] text-text-warm mb-6 tracking-[4px] leading-[1.5] uppercase">
          {t("title")}
        </h2>
      </AnimateOnScroll>

      {/* Description */}
      <AnimateOnScroll delay={0.2}>
        <p className="text-[15px] text-text-muted max-w-[580px] mx-auto mb-14 leading-[1.8]">
          {t("description")}
        </p>
      </AnimateOnScroll>

      {/* Stats */}
      <AnimateOnScroll delay={0.3}>
        <div className="flex justify-center gap-16 md:gap-16 flex-wrap pt-12 border-t border-border-default">
          {statKeys.map((key) => (
            <div key={key} className="text-center">
              <div className="font-display text-[42px] text-copper-light tracking-[2px]">
                {t(`stats.${key}.value`)}
              </div>
              <div className="font-mono text-[9px] tracking-[4px] uppercase text-text-dim mt-1">
                {t(`stats.${key}.label`)}
              </div>
            </div>
          ))}
        </div>
      </AnimateOnScroll>
    </section>
  );
}
