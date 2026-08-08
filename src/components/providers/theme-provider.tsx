"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Colour-scheme axis only.
 *
 * Paper mode and contrast are separate axes written as `data-paper` and
 * `data-contrast` by the reader-prefs provider — see `styles/tokens.css`.
 * next-themes owns nothing but the `dark` class.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Killing transitions during the swap avoids a full-page cross-fade of
      // every token, which reads as a flash rather than a transition.
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
