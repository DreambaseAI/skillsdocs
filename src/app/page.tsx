/** Placeholder home — replaced by WS-9. */
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export default function HomePage() {
  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-24">
      <h1 className="font-display text-4xl">{SITE_NAME}</h1>
      <p className="text-muted-foreground text-lg">{SITE_TAGLINE}</p>
    </main>
  );
}
