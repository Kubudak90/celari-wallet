"use client";

import { useTranslations } from "next-intl";
import { SectionHeader } from "./DecoElements";
import AnimateOnScroll from "./ScrollAnimation";

const stepKeys = ["authenticate", "deploy", "transact"] as const;

function SideBars() {
  const heights = [20, 40, 60, 80, 100, 80, 60, 40, 20];
  return (
    <>
      <div className="absolute top-1/2 left-5 -translate-y-1/2 flex flex-col gap-1 opacity-[0.06] hidden lg:flex">
        {heights.map((h, i) => (
          <div key={i} className="w-[3px] bg-copper" style={{ height: h }} />
        ))}
      </div>
      <div className="absolute top-1/2 right-5 -translate-y-1/2 flex flex-col gap-1 opacity-[0.06] hidden lg:flex">
        {heights.map((h, i) => (
          <div key={i} className="w-[3px] bg-copper" style={{ height: h }} />
        ))}
      </div>
    </>
  );
}

export default function HowItWorks() {
  const t = useTranslations("howItWorks");

  return (
    <section id="how" className="bg-bg-section py-20 md:py-30 px-6 md:px-12 relative overflow-hidden">
      <SideBars />

      <SectionHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="max-w-[800px] mx-auto">
        {stepKeys.map((key, i) => (
          <AnimateOnScroll key={key} delay={i * 0.1}>
            <div className={`grid grid-cols-[60px_1fr] md:grid-cols-[100px_1fr] gap-5 md:gap-10 py-12 hover:pl-4 transition-all duration-300 ${i < stepKeys.length - 1 ? "border-b border-border-default" : ""}`}>
              <div className="flex flex-col items-center gap-2">
                <span className="font-display text-[52px] text-border-warm leading-none group-hover:text-copper transition-colors duration-300">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="w-1.5 h-1.5 bg-border-default rotate-45" />
              </div>
              <div>
                <h3 className="font-heading text-2xl text-text-warm mb-2.5 tracking-[2px]">
                  {t(`steps.${key}.title`)}
                </h3>
                <p className="text-sm text-text-muted leading-[1.8] max-w-[480px]">
                  {t(`steps.${key}.description`)}
                </p>
              </div>
            </div>
          </AnimateOnScroll>
        ))}
      </div>
    </section>
  );
}
