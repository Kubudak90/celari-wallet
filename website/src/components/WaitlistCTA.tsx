"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { GeoBars } from "./DecoElements";

export default function WaitlistCTA() {
  const t = useTranslations("waitlist");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    // TODO: Connect to actual waitlist API
    setStatus("success");
    setEmail("");
  }

  return (
    <section id="waitlist" className="py-24 md:py-30 px-6 md:px-12 text-center">
      <GeoBars className="mb-14" />

      <h2 className="font-heading italic text-[clamp(24px,3.5vw,38px)] text-text-warm mb-3 tracking-[3px]">
        {t("title")}
      </h2>
      <p className="font-mono text-[10px] tracking-[4px] uppercase text-text-dim mb-10">
        {t("subtitle")}
      </p>

      {status === "success" ? (
        <p className="font-mono text-sm text-copper-light tracking-[2px]">
          {t("success")}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row max-w-[460px] mx-auto border border-border-default relative">
          <span className="absolute inset-[-4px] border border-border-default opacity-30 pointer-events-none" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("placeholder")}
            className="flex-1 font-mono text-xs tracking-[1px] px-5 py-4 border-none bg-bg-card text-text-warm outline-none placeholder:text-text-faint"
            required
          />
          <button
            type="submit"
            className="font-mono text-[10px] tracking-[3px] uppercase text-text-warm bg-burgundy px-7 py-4 border-t sm:border-t-0 sm:border-l border-border-default hover:bg-burgundy-light transition-colors duration-300"
          >
            {t("button")}
          </button>
        </form>
      )}

      {status === "error" && (
        <p className="font-mono text-xs text-burgundy-light mt-4 tracking-[1px]">
          {t("error")}
        </p>
      )}
    </section>
  );
}
