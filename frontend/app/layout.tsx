import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoltPilot — Malaysia's AI car decision guide",
  description:
    "Answer 8 quick questions. Get a ranked EV vs hybrid recommendation, roadmap, and CO₂ savings — built on Malaysian prices, tariffs and incentives.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0066cc",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}