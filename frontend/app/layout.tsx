import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

/* globals.css has always consumed --font-grotesk / --font-body / --font-mono,
   but nothing ever defined them. An undefined var() inside a font-family
   shorthand invalidates the whole declaration, so every surface fell back to
   the UA serif and the "grotesque display, mono figures" identity never
   actually rendered. These three bind the variables the design system expects. */

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VoltPilot — Malaysia's AI car decision guide",
  description:
    "Answer 8 quick questions. Get a ranked EV vs hybrid recommendation, roadmap, and CO₂ savings — built on Malaysian prices, tariffs and incentives.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c4a3a", // pine — was a stale #0066cc blue from before the field-guide palette
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${grotesk.variable} ${body.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
