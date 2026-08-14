import Link from "next/link";
import { describeOrigin } from "@/components/book/book-cover";
import { editorialDate, licenceLabel, plural } from "@/components/book/format";
import type { Book } from "@/lib/book";
import type { HeadingRepair } from "@/lib/markdown";
import { AGENT_SKILLS_SPEC, external, paths, SITE_NAME, SKILLS_SH } from "@/lib/site";

/**
 * The colophon.
 *
 * A colophon is where a book admits how it was made, and this one has more to
 * admit than most: we discovered these files by shape rather than by
 * convention, collapsed copies that were not byte-identical, repaired a
 * heading outline we did not write, and substituted a typeface the brand asked
 * for but does not license to us. Every one of those is a decision a reader
 * might reasonably want to audit, so every one is printed here.
 *
 * It is also the accessibility report. Violations in third-party markdown do
 * not fail our build — that would make the pipeline hostage to arbitrary
 * repositories — so they surface here instead, addressed to the one person who
 * can fix them.
 */

export interface ColophonProps {
  book: Book;
  /** Heading repairs for the document being read. */
  repairs?: HeadingRepair[];
  /** What the repairs apply to, e.g. "the front matter". */
  repairScope?: string;
}

export function Colophon({
  book,
  repairs = [],
  repairScope = "the front matter",
}: ColophonProps) {
  const { repo, theme, marketplace } = book;
  const variants = book.skills.flatMap((s) => s.variants);
  const agents = [...new Set(variants.map((v) => v.label))].sort();
  const flagged = book.skills.filter((s) => s.issues.length > 0);
  const totalIssues = flagged.reduce((n, s) => n + s.issues.length, 0);
  const substitutions = fontNotes(theme);
  const missingAlt = 0; // Recorded per-image by the renderer; see the note below.

  return (
    <section
      id="colophon"
      aria-labelledby="colophon-title"
      className="book-measure mt-20 scroll-mt-24"
      // Additive: the heading and the label already carry the meaning.
      role="doc-credits"
    >
      <div className="book-part__head">
        <h2
          id="colophon-title"
          className="font-display text-ink-strong text-lg leading-tight font-medium tracking-tight"
        >
          Colophon
        </h2>
        <span className="book-eyebrow book-part__count">
          How this issue was made
        </span>
      </div>

      <dl className="book-colophon mt-5">
        <dt>Source</dt>
        <dd>
          <a
            className="hover:text-issue-accent underline underline-offset-3"
            href={repo.htmlUrl}
          >
            github.com/{repo.fullName}
          </a>
          , branch <code>{repo.defaultBranch}</code>
          {repo.pushedAt ? `, last pushed ${editorialDate(repo.pushedAt)}` : ""}.
        </dd>

        <dt>Licence</dt>
        <dd>
          {licenceLabel(repo.license)}
          {repo.license ? (
            <span className="text-ink-muted">
              {" "}
              — the text of every skill is reproduced unmodified, frontmatter
              included, under the upstream licence.
            </span>
          ) : (
            <span className="text-ink-muted">
              {" "}
              — with no detectable licence, this issue links rather than
              republishes: the skills are omitted from the agent manifest and
              from the whole-book markdown.
            </span>
          )}
        </dd>

        <dt>Discovery</dt>
        <dd>
          {book.skills.length} {plural(book.skills.length, "skill")} found by
          walking the repository tree for <code>SKILL.md</code>, not by matching
          a directory convention.{" "}
          {book.layouts.length === 1 ? (
            <>
              One layout observed: <code>{book.layouts[0]}</code>.
            </>
          ) : (
            <>
              {book.layouts.length} distinct layouts observed:{" "}
              {book.layouts.map((layout, i) => (
                <span key={layout}>
                  {i > 0 ? ", " : ""}
                  <code>{layout}</code>
                </span>
              ))}
              .
            </>
          )}
        </dd>

        {book.provenance !== "authored" ? (
          <>
            <dt>Authorship</dt>
            <dd>
              {book.provenance === "credited" ? (
                <>
                  Every skill in this issue is{" "}
                  <em>installed into</em> the repository — found under a single
                  agent&rsquo;s dot directory, which is where{" "}
                  <code>skills add</code> writes — rather than published from
                  it. The issue is the repository&rsquo;s working library, and
                  each skill remains the work of its own author.
                </>
              ) : (
                <>
                  {book.skills.filter((s) => s.origin === "credited").length}{" "}
                  of {book.skills.length}{" "}
                  {plural(book.skills.length, "skill")} are installed
                  into the repository rather than published from it. They are
                  shelved in the closing &ldquo;Credited skills&rdquo; part and
                  remain the work of their own authors.
                </>
              )}{" "}
              A skill counts as credited when its only copy lives under one
              agent&rsquo;s dot directory; visible directories, per-agent
              mirror sets, and skills installable from this repository on
              skills.sh all count as published.
            </dd>
          </>
        ) : null}

        {variants.length > 0 ? (
          <>
            <dt>Duplicates collapsed</dt>
            <dd>
              {variants.length} mirror {plural(variants.length, "copy", "copies")}{" "}
              folded into their canonical skill
              {agents.length > 0 ? (
                <>
                  {" "}
                  — republished for {agents.join(", ")}
                </>
              ) : null}
              . Copies match on content hash <em>and</em> on position once a
              leading per-agent prefix is stripped, because the same skill is
              routinely shipped under a dozen agent directories with a dozen
              different hashes.
            </dd>
          </>
        ) : null}

        {book.truncated ? (
          <>
            <dt>Completeness</dt>
            <dd>
              GitHub truncated the tree for this repository, so skills may be
              missing from this issue. The count above is a floor, not a total.
            </dd>
          </>
        ) : null}

        <dt>Issue colours</dt>
        <dd>
          Resolved from {describeOrigin(theme.origin)}
          {theme.origin !== "name-hash" ? (
            <>
              {" "}
              — hue {Math.round(theme.hue)}°, chroma {theme.chroma.toFixed(3)}
            </>
          ) : null}
          . Two accent tones are generated per issue and each is proven against
          its own ground before it ships: a single accent that passes AA on both
          light and dark paper is arithmetically impossible.
        </dd>

        {substitutions.length > 0 ? (
          <>
            <dt>Typefaces</dt>
            <dd>
              <ul className="m-0 list-disc space-y-0.5 ps-4">
                {substitutions.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <span className="text-ink-muted">
                We never load a typeface at request time from a third-party
                origin, so a brand face we do not already self-host is
                substituted rather than fetched.
              </span>
            </dd>
          </>
        ) : null}

        <dt>Heading repairs</dt>
        <dd>
          {repairs.length === 0 ? (
            <>
              None needed in {repairScope}: the outline was already valid.
            </>
          ) : (
            <>
              {repairs.length} {plural(repairs.length, "repair")} applied to{" "}
              {repairScope} so the document has one <code>h1</code> and no
              skipped levels:
              <ul className="mt-1 list-disc space-y-0.5 ps-4">
                {repairs.slice(0, 8).map((repair, i) => (
                  <li key={`${repair.kind}-${i}`}>{describeRepair(repair)}</li>
                ))}
              </ul>
              {repairs.length > 8 ? (
                <span className="text-ink-muted">
                  and {repairs.length - 8} more.
                </span>
              ) : null}
            </>
          )}
        </dd>

        <dt>Spec compliance</dt>
        <dd>
          {flagged.length === 0 ? (
            <>
              Every skill satisfies the{" "}
              <a
                className="hover:text-issue-accent underline underline-offset-3"
                href={AGENT_SKILLS_SPEC}
                target="_blank"
                rel="noopener noreferrer"
              >
                Agent Skills specification
              </a>
              &rsquo;s frontmatter rules.
            </>
          ) : (
            <>
              {totalIssues} editorial {plural(totalIssues, "note")} across{" "}
              {flagged.length} of {book.skills.length}{" "}
              {plural(book.skills.length, "skill")}. They are printed in the
              margin of each skill rather than as errors here.
              <ul className="mt-1 list-disc space-y-0.5 ps-4">
                {flagged.slice(0, 10).map((skill) => (
                  <li key={skill.slug}>
                    <Link
                      className="hover:text-issue-accent underline underline-offset-3"
                      href={paths.chapter(repo.owner, repo.repo, skill.slug)}
                    >
                      {skill.title}
                    </Link>
                    <span className="text-ink-muted">
                      {" "}
                      — {skill.issues.length}{" "}
                      {plural(skill.issues.length, "note")}
                    </span>
                  </li>
                ))}
              </ul>
              {flagged.length > 10 ? (
                <span className="text-ink-muted">
                  and {flagged.length - 10} more.
                </span>
              ) : null}
            </>
          )}
        </dd>

        <dt>Images</dt>
        <dd>
          Images inside a skill come from the upstream repository. Where the
          author gave no alternative text we mark the image decorative rather
          than inventing a description — a plausible caption we made up is worse
          than none for the reader who depends on it.
          {missingAlt > 0 ? ` ${missingAlt} such images in this issue.` : ""}
        </dd>

        {marketplace ? (
          <>
            <dt>Marketplace</dt>
            <dd>
              A plugin manifest is published at <code>{marketplace.path}</code>
              {marketplace.publisher ? ` by ${marketplace.publisher}` : ""}
              {marketplace.plugins.length > 0
                ? `, declaring ${marketplace.plugins.length} ${plural(marketplace.plugins.length, "plugin")}`
                : ""}
              . It is read for editorial metadata only — never as the skill
              index, which is always the repository tree.
            </dd>
          </>
        ) : null}

        <dt>Signal</dt>
        <dd>
          {book.signal ? (
            <>
              Install counts come from{" "}
              <a
                className="hover:text-issue-accent underline underline-offset-3"
                href={`${SKILLS_SH}/${repo.fullName}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                skills.sh
              </a>
              . They measure downloads, not quality, and an unranked repository
              is not an unread one.
            </>
          ) : (
            <>
              This repository is unranked on skills.sh, which says nothing about
              it: the leaderboard covers a fraction of published skills.
            </>
          )}
        </dd>

        <dt>Agent surfaces</dt>
        <dd>
          The whole issue is available as one markdown document at{" "}
          <a
            className="hover:text-issue-accent underline underline-offset-3"
            href={paths.bookMarkdown(repo.owner, repo.repo)}
          >
            <code>{paths.bookMarkdown(repo.owner, repo.repo)}</code>
          </a>
          , and each skill at its own <code>.md</code> URL.
        </dd>

        <dt>Publication</dt>
        <dd>
          Set by {SITE_NAME} from{" "}
          <a
            className="hover:text-issue-accent underline underline-offset-3"
            href={external.repo(repo.owner, repo.repo)}
          >
            the source repository
          </a>
          . Body text is Literata at the reader&rsquo;s chosen size and measure;
          code is Geist Mono. Nothing on this page was written by us except this
          paragraph.
        </dd>
      </dl>
    </section>
  );
}

export function describeRepair(repair: HeadingRepair): string {
  const text = repair.text ? `“${repair.text}”` : "a heading";
  switch (repair.kind) {
    case "stripped-h1":
      return `Removed ${text}, a leading h1 that duplicated the skill title.`;
    case "shifted":
      return `Shifted ${text} from h${repair.from} to h${repair.to} so the skill title is the only h1.`;
    default:
      return `Repaired ${text} from h${repair.from} to h${repair.to}, closing a skipped level.`;
  }
}

function fontNotes(theme: Book["theme"]): string[] {
  const resolution = theme.fontResolution;
  if (!resolution) return [];
  return (["display", "body", "mono"] as const)
    .map((role) => {
      const resolved = resolution[role];
      if (!resolved || !resolved.note) return null;
      return `${role[0].toUpperCase()}${role.slice(1)}: ${resolved.note}`;
    })
    .filter((note): note is string => note !== null);
}
