import type { Metadata } from "next";
import { paths } from "@/lib/site";

const ICON_BASE_URL =
  "https://raw.githubusercontent.com/aliasesapp/dreamstack-images/refs/heads/main/images/skillsdocs/favicon";

const SVG_ICON = {
  url: `${ICON_BASE_URL}/favicon.svg`,
  type: "image/svg+xml",
  sizes: "any",
};

const ICO_ICON = {
  url: `${ICON_BASE_URL}/favicon.ico`,
  type: "image/x-icon",
};

const APPLE_ICON = {
  url: `${ICON_BASE_URL}/apple-touch-icon.png`,
  type: "image/png",
  sizes: "180x180",
};

export const SITE_ICONS = {
  icon: [SVG_ICON, ICO_ICON],
  shortcut: ICO_ICON.url,
  apple: APPLE_ICON,
} satisfies NonNullable<Metadata["icons"]>;

export function bookIcons(
  owner: string,
  repo: string,
): NonNullable<Metadata["icons"]> {
  const icon = {
    url: paths.bookIcon(owner, repo),
    type: "image/png",
    sizes: "64x64",
  };

  return {
    icon,
    shortcut: icon,
    apple: APPLE_ICON,
  };
}
