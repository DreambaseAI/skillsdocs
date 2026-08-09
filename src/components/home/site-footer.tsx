/**
 * The colophon at the foot of the publication.
 *
 * ARCHITECTURE §9 risk 4 makes the takedown path a hard requirement, not a
 * courtesy: this site republishes third-party markdown, and a repo owner must
 * have somewhere obvious to go. It is the last link in the last column and it
 * says what it does.
 */

import Link from "next/link";
import {
  AGENT_SKILLS_SPEC,
  AUTHOR,
  COPYRIGHT_YEAR,
  PUBLISHER,
  SITE_NAME,
  SKILLS_SH,
  SOURCE_URL,
  TAKEDOWN_URL,
  paths,
} from "@/lib/site";

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
  hint?: string;
}

const COLUMNS: Array<{ heading: string; links: FooterLink[] }> = [
  {
    heading: "Read",
    links: [
      { label: "The index", href: "/#contents" },
      { label: "Search", href: paths.search() },
      { label: "For agents — llms.txt", href: "/llms.txt", hint: "Machine-readable site index" },
    ],
  },
  {
    heading: "The ecosystem",
    links: [
      { label: "skills.sh", href: SKILLS_SH, external: true, hint: "Install counts and rankings" },
      {
        label: "Agent Skills specification",
        href: AGENT_SKILLS_SPEC,
        external: true,
        hint: "What a SKILL.md is",
      },
      { label: "Source", href: SOURCE_URL, external: true, hint: "This site, on GitHub" },
    ],
  },
  {
    heading: "Attribution",
    links: [
      {
        label: "Takedown & corrections",
        href: TAKEDOWN_URL,
        external: true,
        hint: "Own a repo listed here? Start with this.",
      },
    ],
  },
];

export function SiteFooter() {
  return (
    // `mt-24` used to sit *above* the top rule, so the index ended at y=6555,
    // the footer began at 6731, and 176px of empty page sat between two
    // horizontal rules with nothing in it — which reads as a module that
    // failed to render, not as breathing room. The page container already
    // contributes 80px of bottom padding; `mt-4` brings the total to 96.
    <footer className="border-rule/70 mt-4 border-t">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <p className="text-ink-strong text-[0.78rem] font-semibold tracking-[0.2em] uppercase">
              {SITE_NAME}
            </p>
            <p className="text-ink-muted mt-3 text-sm leading-relaxed">
              Every chapter is republished verbatim, with its own licence and a link to the
              upstream repository. We never edit a skill&rsquo;s words.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-ink-muted text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
                {column.heading}
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink hover:text-issue-accent text-sm transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-ink hover:text-issue-accent text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                    {link.hint && (
                      <span className="text-ink-muted block text-xs">{link.hint}</span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="border-rule/70 text-ink-muted mt-12 border-t pt-6 text-sm">
          Set by{" "}
          <a
            href={AUTHOR.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink hover:text-issue-accent underline decoration-1 underline-offset-4"
          >
            {AUTHOR.name}
          </a>
          . Brought to you by the team behind{" "}
          <a
            href={PUBLISHER.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink hover:text-issue-accent underline decoration-1 underline-offset-4"
          >
            {PUBLISHER.name}
          </a>
          . <span className="whitespace-nowrap">&copy; {COPYRIGHT_YEAR}</span>
        </p>
      </div>
    </footer>
  );
}
