/**
 * Loads the ⌘K corpus behind its own Suspense boundary.
 *
 * `getPaletteIndex()` is cached, but the very first render on a cold instance
 * scrapes skills.sh. Isolating it here means the nameplate, the hero and the
 * footer all paint immediately and the search button upgrades in place, rather
 * than the whole shell waiting on a third-party site.
 */

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CommandPalette } from "@/components/chrome/command-palette";
import { getPaletteIndex } from "@/components/home/search-index";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { paths } from "@/lib/site";

/**
 * What the header shows while the corpus loads.
 *
 * A link, not a disabled button: before the index exists the honest fallback
 * is the full search page, which does its matching on the server. Keyboard
 * users reaching for the button get something that works.
 */
export function PaletteFallback() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="border-rule text-ink-muted gap-2"
      nativeButton={false}
      render={<a href={paths.search()} />}
    >
      <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" aria-hidden />
      <span className="hidden sm:inline">Search skills</span>
      <KbdGroup className="ml-1 hidden sm:inline-flex" aria-hidden>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </Button>
  );
}

export async function PaletteSlot() {
  const docs = await getPaletteIndex();
  return <CommandPalette docs={docs} />;
}
