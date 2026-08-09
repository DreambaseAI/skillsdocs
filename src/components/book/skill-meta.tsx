import type { Book } from "@/lib/book";
import { deckOf } from "@/lib/deck";
import type { Skill } from "@/lib/skills";
import { external } from "@/lib/site";

/**
 * The chapter's apparatus: the metadata a printed book puts on the verso of
 * the title page.
 *
 * **The bundled files are no longer here.** This section used to end with a
 * list of every resource linked out to github.com, which is what every other
 * skills browser does and is the single largest thing this book can do that
 * they cannot: 96% of those 2,518 files are renderable text. They are now the
 * appendix — numbered subchapters of this chapter, set on this site — and a
 * second, duller copy of the same list underneath it would only argue against
 * the first.
 */

export interface SkillApparatusProps {
  book: Book;
  skill: Skill;
}

export function SkillApparatus({ book, skill }: SkillApparatusProps) {
  const { repo } = book;
  const ref = repo.defaultBranch;

  const hasFacts =
    skill.allowedTools.length > 0 ||
    skill.compatibility !== null ||
    skill.license !== null ||
    skill.variants.length > 0;

  /*
   * The chapter opener shows a bounded, typeset deck. This is the other half:
   * the frontmatter `description` exactly as written, set in mono, because it
   * is not prose — it is the condition on which an agent loads this skill.
   * Showing it only when the deck did not already say all of it keeps short
   * descriptions from being printed twice on one page.
   */
  const trigger = (skill.description ?? "").trim();
  const showTrigger = trigger !== "" && deckOf(trigger).length < trigger.length;

  if (!hasFacts && !showTrigger) return null;

  return (
    <section
      aria-labelledby="chapter-apparatus"
      className="book-measure mt-14 mb-4"
    >
      <div className="book-part__head">
        <h2 id="chapter-apparatus" className="book-eyebrow m-0">
          About this skill
        </h2>
      </div>

      {showTrigger ? (
        <div className="mt-4">
          <h3 className="book-eyebrow m-0">Trigger</h3>
          <p className="book-trigger mt-1.5">{trigger}</p>
          <p className="book-caption mt-1.5">
            The verbatim <code>description</code> from this skill&rsquo;s front
            matter — the string an agent matches on to decide whether to load
            it.
          </p>
        </div>
      ) : null}

      {hasFacts ? (
        <dl className="book-colophon mt-4">
          {skill.allowedTools.length > 0 ? (
            <>
              <dt>Allowed tools</dt>
              <dd>
                <span className="flex flex-wrap gap-1.5">
                  {skill.allowedTools.map((tool) => (
                    <code
                      key={tool}
                      className="border-rule bg-paper-raised rounded-sm border px-1.5 py-0.5"
                    >
                      {tool}
                    </code>
                  ))}
                </span>
              </dd>
            </>
          ) : null}

          {skill.compatibility ? (
            <>
              <dt>Compatibility</dt>
              <dd>{skill.compatibility}</dd>
            </>
          ) : null}

          {skill.license ? (
            <>
              <dt>Licence</dt>
              <dd>{skill.license}</dd>
            </>
          ) : null}

          {skill.variants.length > 0 ? (
            <>
              <dt>Also published for</dt>
              <dd>
                {skill.variants.map((variant, i) => (
                  <span key={variant.path}>
                    {i > 0 ? ", " : ""}
                    <a
                      className="hover:text-issue-accent underline underline-offset-3"
                      href={external.file(repo.owner, repo.repo, ref, variant.path)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {variant.label}
                    </a>
                  </span>
                ))}
                <span className="text-ink-muted">
                  {" "}
                  — collapsed into this chapter because the copies are the same
                  skill.
                </span>
              </dd>
            </>
          ) : null}

          <dt>Source</dt>
          <dd>
            <a
              className="hover:text-issue-accent underline underline-offset-3"
              href={external.file(repo.owner, repo.repo, ref, skill.skillMdPath)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <code>{skill.skillMdPath}</code>
            </a>
          </dd>
        </dl>
      ) : null}
    </section>
  );
}
