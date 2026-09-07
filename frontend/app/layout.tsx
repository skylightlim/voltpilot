import type { Metadata, Viewport } from "next";
import { Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SkipLabel } from "@/components/skip-label";

/* Type follows DESIGN-figma.md, which runs ONE variable sans across display,
   body and UI and lets weight and size do the work — display at 340, body at
   320, buttons at 480. The previous pairing (Space Grotesk display + Inter
   body) cannot express that: two families with fixed weights.

   figmaSans is Figma's proprietary face. Figtree is the closest available
   substitute with a real 300-900 variable range, which the brief's light
   display weights require — a 400-min family would flatten the whole scale.
   JetBrains Mono keeps the figmaMono role for figures and measurements. */

const sans = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const DESCRIPTION =
  "Answer 8 quick questions. Get a ranked EV vs hybrid recommendation, roadmap, and CO₂ savings — built on Malaysian prices, tariffs and incentives.";

/* metadataBase resolves the relative OG image path to an absolute URL, which is
   what every scraper requires. It reads the deployment URL rather than a
   hardcoded host so the same build works on preview and production. */
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://voltpilot.pages.dev",
  ),
  title: {
    default: "VoltPilot — Malaysia's AI car decision guide",
    template: "%s · VoltPilot",
  },
  description: DESCRIPTION,
  applicationName: "VoltPilot",
  keywords: ["EV Malaysia", "hybrid car Malaysia", "EV vs hybrid", "TNB tariff", "car TCO Malaysia"],
  openGraph: {
    type: "website",
    siteName: "VoltPilot",
    locale: "en_MY",
    alternateLocale: "ms_MY",
    title: "VoltPilot — Malaysia's AI car decision guide",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "VoltPilot — Malaysia's AI car decision guide",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c4a3a", // pine
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {/* Keyboard users land on the nav first and would otherwise tab through
            every link on the page to reach the content. Visually hidden until
            focused, then it becomes an ordinary button in the top-left. */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:text-[15px] focus:font-[480] focus:text-primary-foreground"
        >
          <SkipLabel />
        </a>
        <div id="content">{children}</div>
      </body>
    </html>
  );
}
