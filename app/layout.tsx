import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://cars-kevindoyle.vercel.app"),
  title: "CarWise | Live electrified SUV decision engine",
  description: "Personalised UK BEV and PHEV purchase intelligence with live data freshness, TCO, warranty and deal analysis.",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    title: "CarWise | Live electrified SUV decision engine",
    description: "Personalised UK BEV and PHEV purchase intelligence with live data freshness, TCO, warranty and deal analysis.",
    url: "https://cars-kevindoyle.vercel.app",
    siteName: "CarWise",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
