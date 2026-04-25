"use client";

import { useTranslations } from "next-intl";

const PILLARS = ["noMetadata", "shieldedDefault", "auditable", "selfCustody"] as const;

const ICONS: Record<(typeof PILLARS)[number], React.ReactNode> = {
  // No metadata — eye with slash
  noMetadata: (
    <>
      <path d="M3 12 C 6 7, 18 7, 21 12 C 18 17, 6 17, 3 12 Z" />
      <circle cx="12" cy="12" r="3" />
      <line x1="4" y1="20" x2="20" y2="4" strokeLinecap="round" />
    </>
  ),
  // Shielded — shield with lock
  shieldedDefault: (
    <>
      <path d="M12 3 L20 6 V12 C 20 16.5 16.5 20 12 21.5 C 7.5 20 4 16.5 4 12 V6 Z" strokeLinejoin="round" />
      <rect x="9.5" y="11" width="5" height="5" rx="0.6" />
      <path d="M10.3 11 V9.5 A 1.7 1.7 0 0 1 13.7 9.5 V11" />
    </>
  ),
  // Auditable — code brackets with checkmark
  auditable: (
    <>
      <path d="M8 6 L4 12 L8 18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 6 L20 12 L16 18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 13 L11.7 14.2 L14 11" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Self-custody — key
  selfCustody: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12 L20 12 L20 14.5 M16.5 12 L16.5 15" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export default function PrivacySection() {
  const t = useTranslations("privacy");

  return (
    <section
      id="privacy"
      className="px-6 md:px-12 py-24 md:py-32 relative overflow-hidden"
    >
      {/* Faint gold ring backdrop, top-left */}
      <div className="absolute -left-[300px] top-[10%] w-[700px] h-[700px] pointer-events-none opacity-[0.10]">
        <svg viewBox="0 0 700 700" fill="none" className="w-full h-full" aria-hidden>
          {[330, 260, 190, 120].map((r) => (
            <circle key={r} cx="350" cy="350" r={r} stroke="#D4A853" strokeWidth="1" />
          ))}
        </svg>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-16 md:mb-20">
          <p className="font-body text-burgundy text-[12px] tracking-[3px] uppercase mb-4">
            {t("eyebrow")}
          </p>
          <h2 className="font-heading font-semibold leading-[1.1] text-[clamp(36px,5vw,56px)] tracking-tight mb-6 text-text-warm">
            {t("title")}
          </h2>
          <p className="font-body text-text-body text-[clamp(15px,1.3vw,18px)] leading-relaxed max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          {PILLARS.map((key) => (
            <div
              key={key}
              className="flex gap-5 p-6 rounded-2xl border border-border-default bg-bg-card/40 hover:bg-bg-card/70 transition-colors"
            >
              <div className="shrink-0 w-12 h-12 rounded-xl bg-burgundy/[0.08] border border-burgundy/30 flex items-center justify-center text-burgundy">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  {ICONS[key]}
                </svg>
              </div>
              <div>
                <h3 className="font-heading font-semibold text-text-warm text-lg mb-2">
                  {t(`pillars.${key}.title`)}
                </h3>
                <p className="font-body text-text-body text-[15px] leading-relaxed">
                  {t(`pillars.${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
