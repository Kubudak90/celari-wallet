"use client";

import { usePathname, useRouter } from "../../i18n/navigation";
import { useLocale } from "next-intl";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(newLocale: "en" | "tr") {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <div className="flex items-center gap-1 font-mono text-[9px] tracking-[3px] uppercase">
      <button
        onClick={() => switchLocale("en")}
        className={`px-2 py-1 transition-colors duration-300 ${
          locale === "en" ? "text-copper-light" : "text-text-faint hover:text-text-dim"
        }`}
      >
        EN
      </button>
      <span className="text-border-warm">|</span>
      <button
        onClick={() => switchLocale("tr")}
        className={`px-2 py-1 transition-colors duration-300 ${
          locale === "tr" ? "text-copper-light" : "text-text-faint hover:text-text-dim"
        }`}
      >
        TR
      </button>
    </div>
  );
}
