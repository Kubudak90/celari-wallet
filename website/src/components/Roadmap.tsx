"use client";

import { useTranslations } from "next-intl";
import { SectionHeader } from "./DecoElements";
import AnimateOnScroll from "./ScrollAnimation";

const phaseKeys = [
  "phase0",
  "phase1",
  "phase2",
  "phase3",
  "phase4",
  "phase5",
] as const;

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <div className="w-3 h-3 rotate-45 bg-copper" />
    );
  }
  if (status === "current") {
    return (
      <div className="w-3 h-3 rotate-45 bg-burgundy animate-pulse-glow" />
    );
  }
  return (
    <div className="w-3 h-3 rotate-45 border border-border-warm" />
  );
}

export default function Roadmap() {
  const t = useTranslations("roadmap");

  return (
    <section id="roadmap" className="py-20 md:py-30 px-6 md:px-12 max-w-[1000px] mx-auto">
      <SectionHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="relative max-w-[700px] mx-auto">
        {/* Vertical timeline line */}
        <div className="absolute left-[29px] md:left-[49px] top-0 bottom-0 w-px bg-border-default" />

        {phaseKeys.map((key, i) => {
          const status = t(`phases.${key}.status`);
          return (
            <AnimateOnScroll key={key} delay={i * 0.08}>
              <div className="grid grid-cols-[60px_1fr] md:grid-cols-[100px_1fr] gap-5 md:gap-8 py-8 relative">
                {/* Phase number + status */}
                <div className="flex flex-col items-center gap-3">
                  <span className="font-mono text-[9px] tracking-[2px] uppercase text-text-faint" aria-hidden="true">
                    {t(`phases.${key}.name`)}
                  </span>
                  <StatusIcon status={status} />
                </div>

                {/* Content */}
                <div>
                  <h3 className={`font-heading text-lg mb-1.5 tracking-[1px] ${status === "upcoming" ? "text-text-dim" : "text-text-warm"}`}>
                    {t(`phases.${key}.title`)}
                  </h3>
                  <p className="text-[13px] text-text-muted leading-[1.8]">
                    {t(`phases.${key}.description`)}
                  </p>
                  {status === "current" && (
                    <span className="inline-block mt-3 font-mono text-[8px] tracking-[3px] uppercase text-burgundy-light border border-burgundy/30 px-3 py-1">
                      In Progress
                    </span>
                  )}
                </div>
              </div>
            </AnimateOnScroll>
          );
        })}
      </div>
    </section>
  );
}
