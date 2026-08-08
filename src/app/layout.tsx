import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LiveRegions } from "@/components/chrome/live-regions";
import { SkipLinks } from "@/components/chrome/skip-links";
import { ReaderPrefsScript } from "@/components/providers/reader-prefs-script";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { FONT_VARIABLE_CLASSES } from "@/lib/fonts";
import {
  AUTHOR,
  PUBLISHER,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [AUTHOR],
  creator: AUTHOR.name,
  publisher: PUBLISHER.name,
  keywords: [
    "agent skills",
    "SKILL.md",
    "Claude skills",
    "LLM skills",
    "skills.sh",
    "documentation reader",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image", creator: "@kyleledbetter" },
  robots: { index: true, follow: true },
  alternates: { types: { "text/markdown": "/llms.txt" } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1917" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Next 16 no longer applies smooth scrolling automatically.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${FONT_VARIABLE_CLASSES} h-full antialiased`}
    >
      <head>
        {/* Runs before first paint so saved typography is never flashed over. */}
        <ReaderPrefsScript />
      </head>
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans">
        <ThemeProvider>
          <TooltipProvider>
            <SkipLinks />
            {children}
            <LiveRegions />
            <Toaster position="bottom-right" closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
