import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { CookieStatusBanner } from "@/components/CookieStatusBanner";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Repliq — Personalized outreach videos at scale",
    template: "%s · Repliq",
  },
  description:
    "Upload a CSV and a talking-head video. Repliq generates a personalized Loom-style outreach video for every lead.",
  metadataBase: new URL("http://localhost:3000"),
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={cn(
          inter.variable,
          mono.variable,
          "min-h-dvh bg-background font-sans text-foreground antialiased",
        )}
      >
        <div className="pointer-events-none fixed inset-0 -z-10 bg-grid-fade" />
        <CookieStatusBanner />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
