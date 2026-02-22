import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import AztecSection from "@/components/AztecSection";
import Roadmap from "@/components/Roadmap";
import WaitlistCTA from "@/components/WaitlistCTA";
import Footer from "@/components/Footer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      url: "https://celariwallet.com",
      siteName: "Celari",
      images: [{ url: "/og-dark.png", width: 1200, height: 630 }],
      locale: locale === "tr" ? "tr_TR" : "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("ogTitle"),
      description: t("ogDescription"),
      images: ["/og-dark.png"],
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main>
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <AztecSection />
      <Roadmap />
      <WaitlistCTA />
      <Footer />
    </main>
  );
}
