import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../../i18n/routing";
import { Poiret_One, IBM_Plex_Mono, Outfit } from "next/font/google";
import "../globals.css";

const poiretOne = Poiret_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-poiret-one",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const outfit = Outfit({
  weight: ["200", "300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "en" | "tr")) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${poiretOne.variable} ${ibmPlexMono.variable} ${outfit.variable}`}
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg text-text-warm font-body font-light leading-relaxed overflow-x-hidden">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
