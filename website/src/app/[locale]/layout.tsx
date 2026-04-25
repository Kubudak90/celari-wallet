import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../../i18n/routing";
import { Inter, Outfit } from "next/font/google";
import type { Metadata } from "next";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["100", "300", "400"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Celari — Privacy First Wallet",
  description:
    "Celari Wallet is a privacy-first, non-custodial wallet built for the new internet.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Celari — Privacy First Wallet",
    description:
      "Privacy-first, non-custodial. Self-custody, passkey login, no tracking, zero trace.",
    images: ["/og-dark.png"],
  },
};

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
    <html lang={locale} className={`${inter.variable} ${outfit.variable}`}>
      <body className="bg-bg text-text-warm font-body font-light leading-relaxed overflow-x-hidden">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
