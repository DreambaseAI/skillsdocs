import { fileSize, plural } from "@/components/book/format";
import type { Book } from "@/lib/book";
import { deckOf } from "@/lib/deck";
import type { Skill, SkillResource } from "@/lib/skills";
import { external } from "@/lib/site";

/**
 * The chapter's apparatus: the metadata a printed book puts on the verso of
 * the title page, and the bundled files a skill ships alongside its prose.
 *
 * Resources are grouped by what they *are* — scripts, references, assets —
 * because that is the distinction that decides whether a reader wants to open
 * one. Sorting 40 files alphabetically tells them nothing; telling them "four
 * scripts, one reference, thirty assets" tells them everything.
 */

const KIND_LABEL: Record<SkillResource["kind"], string> = {
  script: "Scripts",
  reference: "References",
  asset: "Assets",
  other: "Other files",
};

const KIND_ORDER: SkillResource["kind"][] = [
  "script",
  "reference",
  "asset",
  "other",
];

export interface SkillApparatusProps {
  book: Book;
  skill: Skill;
}

export function SkillApparatus({ book, skill }: SkillApparatusProps) {
  const { repo } = book;
  const ref = repo.defaultBranch;

  const byKind = KIND_ORDER.map((kind) => ({
    kind,
    files: skill.resources.filter((r) => r.kind === kind),
  })).filter((g) => g.files.length > 0);

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

  if (!hasFacts && byKind.length === 0 && !showTrigger) return null;

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

      {byKind.map(({ kind, files }) => (
        <div key={kind} className="mt-6">
          <h3 className="book-eyebrow">
            {KIND_LABEL[kind]} · {files.length}{" "}
            {plural(files.length, "file")}
          </h3>
          <ul className="border-rule mt-2 border-t">
            {files.slice(0, 24).map((file) => (
              <li
                key={file.path}
                className="border-rule flex items-baseline justify-between gap-4 border-b py-1.5 text-sm"
              >
                <a
                  className="hover:text-issue-accent min-w-0 truncate font-mono text-[0.8125rem] underline-offset-3 hover:underline"
                  href={external.file(repo.owner, repo.repo, ref, file.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {file.relPath}
                </a>
                <span className="book-caption shrink-0 tabular-nums">
                  {fileSize(file.size)}
                </span>
              </li>
            ))}
          </ul>
          {files.length > 24 ? (
            <p className="book-caption mt-2">
              and {files.length - 24} more —{" "}
              <a
                className="hover:text-issue-accent underline underline-offset-3"
                href={external.file(
                  repo.owner,
                  repo.repo,
                  ref,
                  skill.dir || skill.skillMdPath,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                browse the directory on GitHub
              </a>
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
