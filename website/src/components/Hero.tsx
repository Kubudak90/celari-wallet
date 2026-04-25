"use client";

import { useTranslations } from "next-intl";
import PhoneMockup from "./PhoneMockup";
import RadialRings from "./RadialRings";

export default function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="min-h-[90vh] flex items-center px-6 md:px-12 pt-32 pb-20 relative overflow-hidden">
      {/* Background — gold radial rings (right side, behind phone) */}
      <RadialRings />

      {/* Center radial gold glow */}
      <div className="absolute right-[10%] top-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(212,168,83,0.10)_0%,transparent_60%)] pointer-events-none" />

      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
        {/* Left column — copy + CTAs */}
        <div className="opacity-0 animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <h1 className="font-heading font-semibold leading-[1.05] text-[clamp(48px,7vw,84px)] tracking-tight mb-8">
            <span className="block text-text-warm">{t("headlineLine1")}</span>
            <span className="block bg-gradient-to-b from-burgundy-light to-burgundy bg-clip-text text-transparent">
              {t("headlineLine2")}
            </span>
            <span className="block text-text-warm">{t("headlineLine3")}</span>
          </h1>

          <p className="font-body text-text-body text-[clamp(15px,1.4vw,18px)] leading-relaxed max-w-md mb-10">
            {t("tagline")}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-8 flex-wrap">
            <a
              href="#download"
              className="inline-flex items-center justify-center gap-2 font-body font-medium text-[15px] text-bg bg-gradient-to-b from-burgundy-light to-burgundy px-7 py-3.5 rounded-xl hover:opacity-90 transition-opacity shadow-[0_0_24px_rgba(212,168,83,0.18)]"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              {t("downloadIos")}
            </a>
            <a
              href="#download"
              className="inline-flex items-center justify-center gap-2 font-body font-medium text-[15px] text-burgundy border border-burgundy/60 px-7 py-3.5 rounded-xl hover:bg-burgundy/[0.06] transition-colors"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12 3.84 21.85c-.5-.25-.84-.76-.84-1.35zM16.81 15.12L6.05 21.34l8.49-8.49 2.27 2.27zM20.16 10.81c.34.27.54.69.54 1.19s-.2.91-.54 1.18l-2.41 1.39-2.51-2.51 2.51-2.51 2.41 1.41v.85zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z" />
              </svg>
              {t("downloadAndroid")}
            </a>
            <a
              href="#download"
              className="inline-flex items-center justify-center gap-2 font-body font-medium text-[15px] text-burgundy border border-burgundy/60 px-7 py-3.5 rounded-xl hover:bg-burgundy/[0.06] transition-colors"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="3" fill="var(--color-bg)" />
                <path d="M12 3 L20 7.5 L12 12 Z" />
                <path d="M3.5 7.5 L12 12 L7.5 19.5 Z" />
              </svg>
              {t("chromeExtension")}
            </a>
          </div>

          <div className="inline-flex items-center gap-2 text-burgundy">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M12 2 L20 5 V11 C20 15.5 16.5 19.5 12 22 C7.5 19.5 4 15.5 4 11 V5 Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-body text-[13px]">{t("privacyBadge")}</span>
          </div>
        </div>

        {/* Right column — phone mockup with lockup */}
        <div
          className="hidden lg:flex justify-center items-center opacity-0 animate-fade-up"
          style={{ animationDelay: "0.35s" }}
        >
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
