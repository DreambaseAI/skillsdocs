/**
 * Agent-facing serializers: markdown twins, `llms.txt`, and the Agent Skills
 * discovery manifest.
 *
 * Everything here is pure. The network lives in the route handlers; these
 * functions take an already-assembled `Book` and hand back bytes. That is what
 * makes the licence rules testable — and they are the rules most likely to get
 * quietly broken by a later edit.
 *
 * LICENCE POSITION. We re-publish third-party content. The rule, applied
 * uniformly by `chapterLicence()`:
 *
 *   1. A chapter is republishable only when a licence is *detectable* for it —
 *      frontmatter `license:`, a LICENSE file inside the skill directory, or a
 *      repository licence GitHub could identify.
 *   2. A chapter with no detectable licence is still *linked* — title,
 *      description, upstream URL — but its body is never inlined, and it is
 *      omitted from the agent-skills manifest entirely.
 *   3. Every surface carries the upstream URL and, when we can name it, the
 *      SPDX id. We never guess an SPDX id we did not read.
 *
 * Point 1 is why `anthropics/skills` works at all: GitHub reports
 * `license: null` for it, because the licences live in sixteen per-skill
 * `LICENSE.txt` files rather than one at the root. A naive repo-level check
 * would have silently dropped the flagship book.
 */

import type { Book } from "./book";
import { blobUrl, rawUrl, type RepoMeta } from "./github";
import type { Skill } from "./skills";
import {
  AGENT_SKILLS_SPEC,
  SITE_NAME,
  SITE_URL,
  TAKEDOWN_URL,
  absoluteUrl,
  external,
  installCommand,
  paths,
} from "./site";
import type { SeedRepo } from "./data/seed-repos";

/**
 * Where a rights complaint goes.
 *
 * Defaults to the same URL the human-facing footer prints — one address, one
 * queue. `mailto:` remains available through the env override for a deployment
 * that would rather take these privately.
 */
export const TAKEDOWN_CONTACT =
  process.env.NEXT_PUBLIC_TAKEDOWN_CONTACT ?? TAKEDOWN_URL;

/**
 * The Agent Skills discovery schema.
 *
 * The field shape is Mintlify's, copied from a live manifest, and their
 * `$schema` points at `https://schemas.agentskills.io/discovery/0.2.0/…`.
 * That hostname does not resolve — measured 2026-08: `host
 * schemas.agentskills.io` → NXDOMAIN, and `agentskills.io/schemas/…` → 404 — so
 * an agent that dereferences it gets a DNS failure rather than a schema.
 *
 * A `$schema` an agent cannot fetch is worse than no `$schema`, so we publish
 * our own copy of the shape we actually emit and point at that. The field
 * *values* stay wire-compatible with Mintlify; only the URL is ours.
 */
export const AGENT_SKILLS_SCHEMA_PATH =
  "/api/v1/schemas/agent-skills-index.json";

export const AGENT_SKILLS_SCHEMA = absoluteUrl(AGENT_SKILLS_SCHEMA_PATH);

/** The upstream field shape this manifest is compatible with. */
export const AGENT_SKILLS_SCHEMA_UPSTREAM =
  "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

/**
 * Site-wide discovery relations, for the `Link` header of any route that sets
 * its own (a header written by a route handler wins over one written by the
 * proxy, so a handler that sets `Link` must carry these itself).
 *
 * `rel="agent-skills"` is deliberately absent: on a book route the *book's*
 * manifest is the one an agent wants, and two links with the same relation
 * make the caller guess. Routes that have no book add the site-level one
 * themselves.
 *
 * `proxy.ts` keeps its own copy: it is deployed outside the app runtime and
 * must not import from `src/lib`.
 */
export const DISCOVERY_LINK = [
  '</llms.txt>; rel="llms-txt"',
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</api/v1/openapi.json>; rel="service-desc"',
] as const;

/* -------------------------------------------------------- upstream failures */

export type UpstreamFailure = {
  status: 404 | 429 | 502;
  code: "not_found" | "rate_limited" | "upstream_error";
  message: string;
};

/**
 * Classify a failure from `getBook` for an HTTP response.
 *
 * **`instanceof GitHubError` does not survive a `use cache` boundary.**
 * Verified against the live dev server: an exhausted quota inside `getBook`
 * arrives here as a plain `Error` carrying the original message but not the
 * class, so an `instanceof` check reports every 404 and every 429 as a generic
 * 502. Duck-type the `kind` field, then fall back to the message — which is the
 * only thing guaranteed to cross intact.
 */
export function classifyUpstreamError(error: unknown): UpstreamFailure {
  const message = error instanceof Error ? error.message : String(error);
  const kind = (error as { kind?: unknown })?.kind;

  if (kind === "not-found" || /^not found:/i.test(message)) {
    return { status: 404, code: "not_found", message };
  }
  if (kind === "rate-limited" || /rate limit/i.test(message)) {
    return { status: 429, code: "rate_limited", message };
  }
  return { status: 502, code: "upstream_error", message };
}

/**
 * What a direct, uncached probe of `GET /repos/{owner}/{repo}` found.
 *
 * Lives here rather than next to the probe itself so that the mapping below is
 * pure and testable; `lib/upstream.ts` owns the network.
 */
export type RepoStatus =
  | { kind: "ok" }
  | { kind: "not-found" }
  | { kind: "rate-limited"; resetAt: string | null }
  | { kind: "error"; detail: string };

/**
 * Turn a probe result into the status an agent surface should answer with.
 *
 * Reached only when `classifyUpstreamError` could not name the failure —
 * which, in a production build, is every failure that crossed a `"use cache"`
 * boundary from a route handler with dynamic params.
 */
export function failureFromProbe(
  probed: RepoStatus,
  owner: string,
  repo: string,
): UpstreamFailure {
  if (probed.kind === "not-found") {
    return {
      status: 404,
      code: "not_found",
      message: `No repository at github.com/${owner}/${repo}.`,
    };
  }
  if (probed.kind === "rate-limited") {
    return {
      status: 429,
      code: "rate_limited",
      message: `GitHub API rate limit reached.${probed.resetAt ? ` Resets ${probed.resetAt}.` : ""} Set GITHUB_TOKEN to raise the limit.`,
    };
  }
  if (probed.kind === "error") {
    return { status: 502, code: "upstream_error", message: probed.detail };
  }

  // The repository exists, so the failure was somewhere downstream of it — the
  // tree, a raw read, or our own pipeline. Say so rather than blaming GitHub
  // for a message we were never handed.
  return {
    status: 502,
    code: "upstream_error",
    message: `Could not assemble ${owner}/${repo}. The repository exists upstream; the failure was downstream of repository metadata.`,
  };
}

/* ----------------------------------------------------------------- licences */

export interface LicenceRef {
  /** Canonical SPDX id, or null when we could not identify one. */
  spdx: string | null;
  /** Human label, always present. */
  name: string;
  /** The licence document upstream, or the SPDX page when that is all we have. */
  url: string | null;
  /** Which level of the repo declared it. */
  scope: "repo" | "skill" | "none";
  /**
   * True when a licence exists at all. False means "all rights reserved by
   * default" — link only, never inline.
   */
  redistributable: boolean;
}

const NO_LICENCE: LicenceRef = {
  spdx: null,
  name: "No licence detected",
  url: null,
  scope: "none",
  redistributable: false,
};

/**
 * SPDX ids we are willing to name. Anything outside this list is reported as a
 * free-text licence name with a null SPDX id rather than normalised into a
 * guess.
 */
const SPDX_IDS = [
  "0BSD",
  "AGPL-3.0",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSL-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC0-1.0",
  "EPL-2.0",
  "GPL-2.0",
  "GPL-3.0",
  "ISC",
  "LGPL-3.0",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Unlicense",
  "WTFPL",
] as const;

const SPDX_BY_LOWER = new Map(SPDX_IDS.map((id) => [id.toLowerCase(), id]));

/** Spellings observed in real `SKILL.md` frontmatter and GitHub licence names. */
const SPDX_ALIASES: Record<string, string> = {
  "apache 2.0": "Apache-2.0",
  "apache-2": "Apache-2.0",
  apache2: "Apache-2.0",
  "apache license 2.0": "Apache-2.0",
  "bsd 2-clause": "BSD-2-Clause",
  "bsd 3-clause": "BSD-3-Clause",
  'bsd 3-clause "new" or "revised" license': "BSD-3-Clause",
  "cc by 4.0": "CC-BY-4.0",
  "cc-by": "CC-BY-4.0",
  cc0: "CC0-1.0",
  "gnu affero general public license v3.0": "AGPL-3.0",
  "gnu general public license v2.0": "GPL-2.0",
  "gnu general public license v3.0": "GPL-3.0",
  "gpl v3": "GPL-3.0",
  gpl3: "GPL-3.0",
  "isc license": "ISC",
  "mit license": "MIT",
  "mozilla public license 2.0": "MPL-2.0",
  "the unlicense": "Unlicense",
};

/** Canonical SPDX id for a free-text licence string, or null if unrecognised. */
export function normaliseSpdx(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key || key === "noassertion" || key === "other") return null;
  return SPDX_BY_LOWER.get(key) ?? SPDX_ALIASES[key] ?? null;
}

export function spdxUrl(spdx: string): string {
  return `https://spdx.org/licenses/${spdx}.html`;
}

const LICENCE_FILE = /^(LICEN[CS]E|COPYING|NOTICE)(\.[A-Za-z0-9]+)?$/i;

/** The repository-level licence, as GitHub reports it. */
export function repoLicence(repo: RepoMeta): LicenceRef {
  const gh = repo.license;
  if (!gh) return NO_LICENCE;

  const spdx = normaliseSpdx(gh.spdxId) ?? normaliseSpdx(gh.name);
  if (spdx) {
    return {
      spdx,
      name: gh.name,
      url: spdxUrl(spdx),
      scope: "repo",
      redistributable: true,
    };
  }
  // GitHub found a LICENSE file it could not classify (`NOASSERTION`). That is
  // still a grant of some kind, and it is still linkable.
  return {
    spdx: null,
    name: gh.name || "Licence file present, unidentified",
    url: external.repo(repo.owner, repo.repo),
    scope: "repo",
    redistributable: true,
  };
}

/**
 * The licence that actually governs one chapter.
 *
 * Skill-level beats repo-level, because a repo that licenses per skill means
 * it — see the sixteen `LICENSE.txt` files in `anthropics/skills`.
 */
export function chapterLicence(book: Book, skill: Skill): LicenceRef {
  const { owner, repo, defaultBranch: ref } = book.repo;

  const declared = normaliseSpdx(skill.license);
  if (declared) {
    return {
      spdx: declared,
      name: declared,
      url: spdxUrl(declared),
      scope: "skill",
      redistributable: true,
    };
  }

  // A LICENSE file inside the skill directory. This is the `anthropics/skills`
  // shape and the reason the flagship book is republishable at all: sixteen
  // per-skill `LICENSE.txt` files, no root licence, and GitHub reporting
  // `license: null` for the repository.
  const file = skill.resources.find((r) => LICENCE_FILE.test(r.relPath));

  // Free text like `license: Complete terms in LICENSE.txt` is a grant we
  // cannot name. Point at the licence file when there is one — the SKILL.md is
  // where the claim was made, not where the terms are.
  if (skill.license) {
    return {
      spdx: null,
      name: skill.license,
      url: file
        ? blobUrl(owner, repo, ref, file.path)
        : external.file(owner, repo, ref, skill.skillMdPath),
      scope: "skill",
      redistributable: true,
    };
  }

  if (file) {
    return {
      spdx: null,
      name: `Declared in ${file.relPath}`,
      url: blobUrl(owner, repo, ref, file.path),
      scope: "skill",
      redistributable: true,
    };
  }

  return repoLicence(book.repo);
}

/** A chapter whose body we are allowed to inline. */
export function isRepublishable(book: Book, skill: Skill): boolean {
  return chapterLicence(book, skill).redistributable;
}

/** Short licence label for a one-line provenance row. */
function licenceLabel(licence: LicenceRef): string {
  if (licence.spdx) return licence.spdx;
  if (licence.redistributable) return licence.name;
  return "No licence detected — all rights reserved by its authors";
}

/* ------------------------------------------------------------------ helpers */

/** Escape a value so it survives a single-line YAML scalar. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, max: number): string {
  const flat = oneLine(value);
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Re-emit parsed frontmatter as YAML.
 *
 * Only used when the caller could not supply the upstream bytes; when it can,
 * the raw file is passed through untouched and this never runs.
 */
function frontmatterYaml(skill: Skill): string {
  const entries = Object.entries(skill.frontmatter).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return "";
  const lines = entries.map(([key, value]) =>
    typeof value === "string"
      ? `${key}: ${yamlString(value)}`
      : `${key}: ${JSON.stringify(value)}`,
  );
  return `---\n${lines.join("\n")}\n---`;
}

/**
 * The bytes of one chapter as they exist upstream.
 *
 * `raw` is the map of verbatim upstream files, keyed by slug, that the route
 * handler fetched. When a body is missing from it we reconstruct
 * frontmatter + body, which is faithful in content but not byte-identical —
 * so the digest surfaces never take this path.
 */
function chapterSource(skill: Skill, raw?: ReadonlyMap<string, string>): string {
  const upstream = raw?.get(skill.slug);
  if (upstream != null) return upstream.replace(/\s+$/, "");
  const fm = frontmatterYaml(skill);
  return fm ? `${fm}\n\n${skill.body}` : skill.body;
}

function isoNow(now?: Date): string {
  return (now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/* -------------------------------------------------------- provenance blocks */

interface ProvenanceLine {
  label: string;
  value: string;
}

function blockquote(lines: string[]): string {
  return lines.map((l) => (l ? `> ${l}` : ">")).join("\n");
}

function bullets(rows: ProvenanceLine[]): string {
  return rows.map((r) => `- **${r.label}:** ${r.value}`).join("\n");
}

/**
 * Marks where our words stop and the repository's begin.
 *
 * A comment rather than a `---` rule because the upstream file opens with its
 * own `---` frontmatter delimiter; two rules in a row read as a parsing bug,
 * and a comment is invisible when rendered but greppable when not.
 */
const UPSTREAM_MARKER =
  "<!-- Verbatim upstream SKILL.md follows, YAML frontmatter included. -->";

/** How many bundled files a provenance header will name before summarising. */
const MAX_LISTED_RESOURCES = 24;

/**
 * The files that sit next to a `SKILL.md` and that its body refers to.
 *
 * Without this our Markdown twin is strictly *worse* than raw GitHub for the
 * skills that need it most: `anthropics/skills/skill-creator` cites
 * `references/schemas.md`, `assets/eval_review.html`, `scripts/…` and
 * `eval-viewer/generate_review.py` at nine separate call sites, and an agent
 * reading our copy had no way to resolve any of them — where an agent on raw
 * GitHub can at least list the sibling directory. The data was already in the
 * JSON API (`resources[]`); it just never reached the document agents actually
 * fetch.
 */
function bundledFiles(
  book: Book,
  skill: Skill,
): string[] {
  const { owner, repo: name, defaultBranch: ref } = book.repo;
  const files = skill.resources.filter((r) => r.relPath !== "SKILL.md");
  if (files.length === 0) return [];

  const listed = files.slice(0, MAX_LISTED_RESOURCES);
  const rows = listed.map(
    (r) => `  - \`${r.relPath}\` — ${rawUrl(owner, name, ref, r.path)}`,
  );
  if (files.length > listed.length) {
    rows.push(
      `  - …and ${files.length - listed.length} more, listed in ${absoluteUrl(paths.chapterJson(owner, name, skill.slug))}`,
    );
  }
  return [
    `Bundled files (${files.length}), referenced from this skill's directory:`,
    ...rows,
  ];
}

/* ------------------------------------------------------------ book markdown */

export interface SerializeOptions {
  /** Verbatim upstream `SKILL.md` bytes, keyed by slug. */
  raw?: ReadonlyMap<string, string>;
  /** Fixed timestamp, for reproducible tests. */
  now?: Date;
}

/**
 * The whole book as one markdown document — this *is* the book's
 * `llms-full.txt`.
 *
 * Chapters keep their upstream bytes. Chapters with no detectable licence are
 * listed with their upstream link and deliberately left un-inlined.
 */
export function bookToMarkdown(book: Book, options: SerializeOptions = {}): string {
  const { repo } = book;
  const { owner, repo: name, defaultBranch: ref } = repo;
  const bookUrl = absoluteUrl(paths.book(owner, name));
  const licence = repoLicence(repo);
  const included = book.skills.filter((s) => isRepublishable(book, s));
  const withheld = book.skills.filter((s) => !isRepublishable(book, s));

  const base = `${external.repo(owner, name)}/blob/${ref}/`;

  const head = [
    "---",
    `title: ${yamlString(`${owner}/${name}`)}`,
    `description: ${yamlString(oneLine(repo.description ?? `Agent Skills from ${owner}/${name}.`))}`,
    `source: ${external.repo(owner, name)}`,
    `ref: ${ref}`,
    // An SPDX id or nothing. `license: "No licence detected"` put a sentence
    // where a machine expects an identifier, and it contradicted the document
    // it headed: 16 of those 17 chapters were inlined under per-skill licences.
    `license: ${licence.spdx ?? "null"}`,
    `licenseName: ${yamlString(licence.name)}`,
    `canonical: ${bookUrl}`,
    // Relative links inside the inlined README and chapter bodies resolve
    // against this, not against the URL of this document.
    `base: ${base}`,
    // "authored" | "credited" | "mixed" — credited means the skills are
    // *installed into* this repository, not published from it.
    `provenance: ${book.provenance}`,
    `chapters: ${book.skills.length}`,
    `inlined: ${included.length}`,
    `withheld: ${withheld.length}`,
    `words: ${book.totalWords}`,
    `updated: ${repo.pushedAt ?? isoNow(options.now)}`,
    `generator: ${yamlString(SITE_NAME)}`,
    "---",
  ].join("\n");

  const pointer = blockquote([
    `**${owner}/${name}** — every Agent Skill in this repository, inlined verbatim.`,
    "",
    `Canonical HTML: ${bookUrl}`,
    `Per-skill Markdown: ${absoluteUrl(paths.book(owner, name))}/<skill>.md`,
    `Machine manifest: ${absoluteUrl(paths.bookManifest(owner, name))}`,
    `JSON: ${absoluteUrl(paths.bookJson(owner, name))}`,
    // A repository with no SKILL.md has nothing to install; printing the
    // command anyway told an agent to run something that does nothing. And a
    // credited book must not print one at all: installing from here would
    // republish other authors' skills under this repository's name.
    ...(book.skills.length && book.provenance !== "credited"
      ? [`Install: \`${installCommand(owner, name)}\``]
      : []),
    ...(book.provenance === "credited"
      ? [
          "Provenance: credited — these skills are installed into this repository and in use here, not published from it, so there is no install command.",
        ]
      : []),
    `Upstream: ${external.repo(owner, name)} @ \`${ref}\``,
    `Licence: ${licenceLabel(licence)}`,
    "",
    `Content is mirrored from GitHub and © its authors, served unmodified. Takedown: ${TAKEDOWN_CONTACT}`,
  ]);

  const toc = book.skills.length
    ? [
        "## Table of contents",
        "",
        book.skills
          .map((skill, i) => {
            const url = `${absoluteUrl(paths.chapter(owner, name, skill.slug))}.md`;
            const note = isRepublishable(book, skill)
              ? truncate(skill.description || "No description.", 160)
              : "Not licensed for republication — link only.";
            return `${i + 1}. [${skill.name}](${url}) — ${note}`;
          })
          .join("\n"),
      ].join("\n")
    : "_This repository contains no Agent Skills._";

  // The README is *our* composition, not a skill body, so unlike a chapter it
  // may be rewritten. Its relative links resolved against this document's URL
  // and 404'd — `[grill-me](./skills/productivity/grill-me/SKILL.md)` in
  // `mattpocock/skills.md` became `/mattpocock/skills/productivity/…`, which
  // does not exist. Absolutising them against the repo tree is the only form
  // that works from here.
  const frontMatter = book.readme
    ? [
        "## Front matter",
        "",
        `_The repository README, verbatim except that relative links are resolved against ${base}._`,
        "",
        absolutiseLinks(book.readme.trim(), base),
      ].join("\n")
    : "";

  // Part headings. `/api/v1/books/mattpocock/skills` reports four parts;
  // the markdown flattened all 35 chapters into one `1.`–`35.` run and threw
  // that structure away, which is exactly what a chunker needs most.
  const partOf = new Map<string, string>();
  if (book.parts.length > 1) {
    for (const part of book.parts) {
      for (const skill of part.skills) partOf.set(skill.slug, part.title);
    }
  }

  let currentPart: string | null = null;
  const chapters = book.skills.flatMap((skill, i) => {
    const part = partOf.get(skill.slug) ?? null;
    const section = chapterSection(book, skill, i + 1, options);
    if (part && part !== currentPart) {
      currentPart = part;
      return [`---\n\n## Part: ${part}\n`, section];
    }
    return [section];
  });

  const notice = withheld.length
    ? [
        "## Licence notice",
        "",
        `${withheld.length} of ${book.skills.length} skills in this book have no licence that we could detect, at either the repository or the skill level. Their bodies are **not** reproduced here and they are **not** listed in the Agent Skills manifest. Read them upstream:`,
        "",
        withheld
          .map(
            (s) =>
              `- ${s.name} — ${external.file(owner, name, ref, s.skillMdPath)}`,
          )
          .join("\n"),
      ].join("\n")
    : "";

  const stats = bullets([
    { label: "Skills", value: String(book.skills.length) },
    ...(book.provenance !== "authored"
      ? [
          {
            label: "Authorship",
            value:
              book.provenance === "credited"
                ? "credited — skills in use in this repository, not published from it"
                : `mixed — ${book.skills.filter((s) => s.origin === "credited").length} of ${book.skills.length} are credited — skills in use here, not published from here`,
          },
        ]
      : []),
    { label: "Inlined", value: `${included.length} (licence detected)` },
    { label: "Words", value: book.totalWords.toLocaleString("en-US") },
    { label: "Reading time", value: `${book.totalReadingMinutes} min` },
    { label: "Stars", value: repo.stars.toLocaleString("en-US") },
    ...(book.truncated
      ? [
          {
            label: "Warning",
            value: "GitHub truncated this repository's tree; skills may be missing.",
          },
        ]
      : []),
  ]);

  return [
    head,
    "",
    pointer,
    "",
    `# ${owner}/${name}`,
    "",
    repo.description ? oneLine(repo.description) : "",
    "",
    stats,
    "",
    toc,
    "",
    notice,
    notice ? "" : null,
    frontMatter,
    frontMatter ? "" : null,
    ...chapters,
  ]
    .filter((part): part is string => part !== null)
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimEnd()
    .concat("\n");
}

function chapterSection(
  book: Book,
  skill: Skill,
  position: number,
  options: SerializeOptions,
): string {
  const { owner, repo: name, defaultBranch: ref } = book.repo;
  const licence = chapterLicence(book, skill);
  const rows: ProvenanceLine[] = [
    {
      label: "Source",
      value: external.file(owner, name, ref, skill.skillMdPath),
    },
    { label: "Raw", value: rawUrl(owner, name, ref, skill.skillMdPath) },
    {
      label: "Markdown",
      value: `${absoluteUrl(paths.chapter(owner, name, skill.slug))}.md`,
    },
    ...(skill.origin === "credited"
      ? [
          {
            label: "Origin",
            value:
              "Credited — installed into this repository, not published from it.",
          },
        ]
      : []),
    {
      label: "Licence",
      value: licence.url
        ? `${licenceLabel(licence)} — ${licence.url}`
        : licenceLabel(licence),
    },
  ];

  const files = bundledFiles(book, skill);

  // Explicit chunk boundaries. An inlined `SKILL.md` keeps its own `# ` H1 —
  // "headings unshifted" is a promise we make in `llms.txt` and it is the right
  // one — which leaves a heading-tree chunker looking at 74 top-level siblings
  // of the document title in `anthropics/skills.md`. Splitting on `---` is no
  // better: that is also the frontmatter delimiter of every inlined chapter.
  // A named begin/end comment pair is unambiguous and costs the reader nothing.
  const begin = `<!-- chapter:begin slug=${skill.slug} position=${position} -->`;
  const end = `<!-- chapter:end slug=${skill.slug} -->`;

  if (!licence.redistributable) {
    return [
      "---",
      "",
      begin,
      "",
      `## ${position}. ${skill.name}`,
      "",
      skill.description ? oneLine(skill.description) : "",
      "",
      bullets(rows),
      ...(files.length ? ["", files.join("\n")] : []),
      "",
      "_Body withheld: no licence could be detected for this skill. Read it upstream._",
      "",
      end,
      "",
    ].join("\n");
  }

  return [
    "---",
    "",
    begin,
    "",
    `## ${position}. ${skill.name}`,
    "",
    bullets(rows),
    ...(files.length ? ["", files.join("\n")] : []),
    "",
    UPSTREAM_MARKER,
    "",
    chapterSource(skill, options.raw),
    "",
    end,
    "",
  ].join("\n");
}

/**
 * Rewrite relative Markdown links and images to absolute URLs under `base`.
 *
 * Only ever applied to the README, never to a skill body — those are served
 * verbatim, and that is a promise. Anchors, absolute URLs and protocol-relative
 * URLs are left alone; a root-relative `/x` resolves against the repository
 * root, which is what it means inside a repository.
 */
export function absolutiseLinks(markdown: string, base: string): string {
  const root = base.replace(/\/+$/, "");
  const resolve = (target: string): string => {
    const trimmed = target.trim();
    if (!trimmed) return target;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed)) return target;
    if (trimmed.startsWith("/")) return `${root}${trimmed}`;
    return `${root}/${trimmed.replace(/^\.\//, "")}`;
  };

  // `[text](target)` and `![alt](target)`, with an optional "title" tail.
  return markdown.replace(
    /(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g,
    (_m, head: string, target: string, tail: string) =>
      `${head}${resolve(target)}${tail}`,
  );
}

/* --------------------------------------------------------- chapter markdown */

/**
 * One chapter as markdown: a provenance header, then the upstream file
 * verbatim — frontmatter included.
 *
 * The header cannot live *inside* the frontmatter without modifying it, and it
 * cannot precede the frontmatter without displacing it from byte 0. We choose
 * the header: an agent that wants byte-exact input has the `Raw` link, which
 * every response also carries as an `X-Skill-Raw` header.
 */
export function skillToMarkdown(
  book: Book,
  skill: Skill,
  options: SerializeOptions = {},
): string {
  const { owner, repo: name, defaultBranch: ref } = book.repo;
  const position = book.skills.findIndex((s) => s.slug === skill.slug) + 1;
  const licence = chapterLicence(book, skill);
  const raw = rawUrl(owner, name, ref, skill.skillMdPath);

  const dir = skill.skillMdPath.replace(/\/?SKILL\.md$/i, "");
  const files = bundledFiles(book, skill);

  const head = (redistributable: boolean): string =>
    blockquote([
      `**${skill.name}** — skill ${position} of ${book.skills.length} in [${owner}/${name}](${absoluteUrl(paths.book(owner, name))}).`,
      "",
      `Book (all skills, one file): ${absoluteUrl(paths.bookMarkdown(owner, name))}`,
      `Machine manifest: ${absoluteUrl(paths.bookManifest(owner, name))}`,
      skill.origin === "credited"
        ? "Origin: credited — this skill is installed into this repository and in use here, not published from it, so there is no install command."
        : `Install the book: \`${installCommand(owner, name)}\``,
      `Upstream: ${external.file(owner, name, ref, skill.skillMdPath)} @ \`${ref}\``,
      `Raw bytes, no header: ${raw}`,
      // Relative paths inside the body — `references/schemas.md`,
      // `scripts/init.py` — resolve against this, not against this URL.
      `Base for relative paths: ${rawUrl(owner, name, ref, dir)}/`,
      `Licence: ${licenceLabel(licence)}${licence.url ? ` — ${licence.url}` : ""}`,
      ...(files.length ? ["", ...files] : []),
      "",
      redistributable
        ? `Content © its authors, served unmodified. Takedown: ${TAKEDOWN_CONTACT}`
        : `Content © its authors. This skill's body is not served here; the links above are. Takedown: ${TAKEDOWN_CONTACT}`,
    ]);

  if (!licence.redistributable) {
    return [
      head(false),
      "",
      `# ${skill.name}`,
      "",
      skill.description ? oneLine(skill.description) : "",
      "",
      "No licence could be detected for this skill at either the repository or the skill level, so its body is not reproduced here. Read it upstream:",
      "",
      raw,
      "",
    ].join("\n");
  }

  const pointer = head(true);

  // An HTML comment, not a `---` rule: the upstream file opens with its own
  // `---` frontmatter delimiter, and two rules in a row read as a parsing bug.
  return [
    pointer,
    "",
    UPSTREAM_MARKER,
    "",
    chapterSource(skill, options.raw),
    "",
  ].join("\n");
}

/* ------------------------------------------------------------- llms.txt */

export interface LlmsTxtInput {
  featured: Array<Pick<SeedRepo, "owner" | "repo" | "description">>;
  now?: Date;
}

/**
 * The site index, in the shape llmstxt.org specifies: an H1, a blockquote
 * summary, free prose, then `##` file-list sections. `## Optional` is last
 * because the spec gives that heading the meaning "skippable for a shorter
 * context".
 */
export function siteLlmsTxt({ featured }: LlmsTxtInput): string {
  const list = (
    rows: Array<{ name: string; url: string; note: string }>,
  ): string => rows.map((r) => `- [${r.name}](${r.url}): ${r.note}`).join("\n");

  const books = featured.slice(0, 25).map((b) => ({
    name: `${b.owner}/${b.repo}`,
    url: absoluteUrl(paths.bookMarkdown(b.owner, b.repo)),
    note: truncate(b.description ?? `Agent Skills from ${b.owner}.`, 160),
  }));

  return `# ${SITE_NAME}

> Any GitHub repository containing Agent Skills (\`SKILL.md\` files), rendered as a
> typeset book at ${SITE_URL}/<owner>/<repo>. Every page is available as clean
> Markdown by appending \`.md\` to its URL, or by sending \`Accept: text/markdown\`.
> One repository is one issue; one \`SKILL.md\` is one skill — a chapter of the book.

Content served here is mirrored from public GitHub repositories and is owned by its
original authors under the licence declared in each repository. Skill bodies are served
verbatim — frontmatter intact, headings unshifted, descriptions unedited. Attribution and
an upstream link are on every page and in every Markdown response. A repository with no
detectable licence is linked but never inlined. Takedown: ${TAKEDOWN_CONTACT}.

URL patterns:

- \`/<owner>/<repo>\` — the book: cover, table of contents, colophon
- \`/<owner>/<repo>/<skill>\` — one skill
- Append \`.md\` to either for Markdown; \`/<owner>/<repo>.md\` is that book's full text
- \`/<owner>/<repo>/.well-known/agent-skills/index.json\` — installable manifest with sha256 digests

## Featured books

${list(books)}

## API

${list([
  {
    name: "OpenAPI 3.1 description",
    url: absoluteUrl("/api/v1/openapi.json"),
    note: "Every agent-facing endpoint, machine-readable.",
  },
  {
    name: "Book catalog",
    url: absoluteUrl("/api/v1/books"),
    note: "Every book we index, paginated. Start here to enumerate the site.",
  },
  {
    name: "Book JSON",
    url: absoluteUrl("/api/v1/books/{owner}/{repo}"),
    note: "Book manifest: skills, digests, licence, install commands.",
  },
  {
    name: "Skill JSON",
    url: absoluteUrl("/api/v1/books/{owner}/{repo}/skills/{skill}"),
    note: "One skill, with its verbatim content and outline.",
  },
  {
    name: "Search",
    url: absoluteUrl("/api/v1/search?q="),
    note: "Search across every indexed book and skill.",
  },
  {
    name: "Health",
    url: absoluteUrl("/api/v1/health"),
    note: "Liveness plus the live GitHub rate-limit budget.",
  },
  {
    name: "Agent Skills discovery",
    url: absoluteUrl("/.well-known/agent-skills/index.json"),
    note: "The skill this site itself publishes, for driving this API.",
  },
  {
    name: "API catalog",
    url: absoluteUrl("/.well-known/api-catalog"),
    note: "RFC 9727 linkset pointing at everything above.",
  },
])}

## Optional

${list([
  {
    name: "Sitemap",
    url: absoluteUrl("/sitemap.xml"),
    note: "Every indexed book and skill.",
  },
  {
    name: "Agent Skills specification",
    url: AGENT_SKILLS_SPEC,
    note: "What a SKILL.md must contain. Not our document.",
  },
  {
    name: "Robots policy",
    url: absoluteUrl("/robots.txt"),
    note: "Content-Signal: search=yes, ai-input=yes, ai-train=yes. Being read by agents is the point.",
  },
])}
`;
}

/* -------------------------------------------------- agent-skills manifests */

export interface AgentSkillEntry {
  name: string;
  type: "skill-md";
  description: string;
  /** Our Markdown twin. `digest` is over *these* bytes. */
  url: string;
  digest: string;
  /**
   * The unheadered bytes on raw.githubusercontent, and their digest.
   *
   * Absent on the one skill this site authors, which has no upstream.
   */
  source?: string;
  sourceDigest?: string;
  /**
   * Present, and always `"credited"`, when the skill is installed into the
   * repository rather than published from it — the entry is readable and
   * verifiable, but this repo is not its author.
   */
  origin?: "credited";
}

export interface AgentSkillsManifest {
  $schema: string;
  skills: AgentSkillEntry[];
}

/** The two hashes one manifest entry needs. Both hex sha256, no prefix. */
export interface ChapterDigests {
  /** sha256 of the exact bytes served at the entry's `url`. */
  document: string;
  /** sha256 of the raw upstream `SKILL.md`. */
  source: string;
}

/**
 * The per-book discovery manifest.
 *
 * **`digest` must verify against `url`.** It did not: the entry paired our
 * `.md` twin — which prepends a ~1.1 KB provenance blockquote — with a hash of
 * the *raw upstream* bytes, so `curl <url> | shasum -a 256` failed on 16 of 16
 * entries for `anthropics/skills`, on every book. Our own published skill tells
 * an agent to "verify the digest before writing a skill to disk", so an agent
 * that obeyed us concluded we had tampered with every chapter, and the manifest
 * gave it no raw URL to fall back to. Mintlify, whose field shape this is,
 * hashes the bytes at `url`; so do we now.
 *
 * The raw hash is still useful — it is what `shasum` of the GitHub file gives —
 * so it is kept, next to the URL it actually describes, as
 * `source` / `sourceDigest`.
 *
 * A chapter with no digests, or no detectable licence, is omitted: a manifest
 * entry is an invitation to install, and we only extend it for content we can
 * both verify and lawfully redistribute.
 */
export function bookToAgentSkills(
  book: Book,
  digests: ReadonlyMap<string, ChapterDigests>,
): AgentSkillsManifest {
  const { owner, repo: name, defaultBranch: ref } = book.repo;

  const skills = book.skills
    .filter((skill) => isRepublishable(book, skill) && digests.has(skill.slug))
    .map((skill) => {
      const pair = digests.get(skill.slug)!;
      return {
        name: skill.name,
        type: "skill-md" as const,
        description: truncate(
          skill.description ||
            `${skill.name} — ${skill.origin === "credited" ? "in use in" : "from"} ${owner}/${name}.`,
          1024,
        ),
        url: absoluteUrl(`${paths.chapter(owner, name, skill.slug)}.md`),
        digest: `sha256:${pair.document}`,
        source: rawUrl(owner, name, ref, skill.skillMdPath),
        sourceDigest: `sha256:${pair.source}`,
        ...(skill.origin === "credited" ? { origin: "credited" as const } : {}),
      };
    });

  return { $schema: AGENT_SKILLS_SCHEMA, skills };
}

/**
 * The one skill this site authors: it teaches an agent to drive these
 * endpoints.
 *
 * Held here as a string constant rather than a file on disk so that the bytes
 * hashed for the manifest digest are provably the bytes served by the route.
 */
export const SITE_SKILL_NAME = "skills-docs";

export const SITE_SKILL_MD = `---
name: ${SITE_SKILL_NAME}
description: Find, read, and install Agent Skills from any public GitHub repository through ${SITE_URL}. Use when the user asks whether a skill exists for a task, wants to compare skill collections, wants to read a SKILL.md without cloning, or wants the install command for a skills repository.
license: MIT
---

# ${SITE_NAME}

${SITE_URL} renders any GitHub repository that contains \`SKILL.md\` files as a book:
one repository is one issue, one \`SKILL.md\` is one skill — a chapter of the book. Every surface has a
machine-readable twin, so you never need to clone or scrape HTML.

## The one rule

Append \`.md\` to any reader URL and you get clean Markdown. That is the fastest path
to content and it is cacheable. \`Accept: text/markdown\` works on the same URLs if you
prefer content negotiation.

## Reading a repository you already know

1. \`GET ${SITE_URL}/<owner>/<repo>.md\` — the whole book: repository README plus every
   skill, bodies verbatim with their YAML frontmatter intact, in reading order.
2. \`GET ${SITE_URL}/<owner>/<repo>/<skill>.md\` — one skill, when you know the slug.
3. \`GET ${SITE_URL}/<owner>/<repo>/.well-known/agent-skills/index.json\` — a discovery
   manifest with one entry per skill. Each entry carries \`url\` + \`digest\` (sha256 of
   the exact bytes served at \`url\`) and \`source\` + \`sourceDigest\` (sha256 of the raw
   upstream \`SKILL.md\` on raw.githubusercontent). Verify whichever pair you fetch
   before writing a skill to disk; the two digests differ because our \`.md\` twin
   prepends a provenance header.

Every \`.md\` and JSON response carries a strong \`ETag\`. Send \`If-None-Match\` when you
poll and you will get a 304 instead of the document.

## Finding a repository

\`GET ${SITE_URL}/api/v1/books\` lists every book in the catalog, paginated, with the
Markdown, JSON and manifest URL of each. That is the answer to "what do you have?".

\`GET ${SITE_URL}/api/v1/search?q=<query>\` searches the indexed catalog and the
skills.sh install index. Results carry the book, the skill slug, the Markdown URL, and
the install command.

## Installing

The only install form verified in the wild is repository-level:

\`\`\`bash
npx skills add <owner>/<repo>
\`\`\`

Do not invent a per-skill install argument. To install a single skill, fetch its
\`.md\` twin and write it to your skills directory yourself.

## JSON, if you want structure instead of prose

- \`GET ${SITE_URL}/api/v1/books\` — the whole catalog, paginated (\`limit\`, \`cursor\`).
- \`GET ${SITE_URL}/api/v1/books/<owner>/<repo>\` — skills, digests, licence, stats.
- \`GET ${SITE_URL}/api/v1/books/<owner>/<repo>/skills/<skill>\` — one skill with its
  content and heading outline.
- \`GET ${SITE_URL}/api/v1/openapi.json\` — the full OpenAPI 3.1 description.
- \`GET ${SITE_URL}/api/v1/health\` — liveness and the upstream GitHub rate-limit budget.
  Check this first if book requests start failing; unauthenticated GitHub allows 60
  requests per hour.

## Licensing, which matters here

Content is mirrored from public repositories and owned by its authors. A skill with no
detectable licence is linked but never inlined, and it is omitted from the discovery
manifest — if a skill's body is missing, that is why, and the upstream URL is in the
response. Preserve the attribution block when you quote a skill.
`;

export function siteAgentSkills(digest: string): AgentSkillsManifest {
  return {
    $schema: AGENT_SKILLS_SCHEMA,
    skills: [
      {
        name: SITE_SKILL_NAME,
        type: "skill-md",
        description: truncate(
          `Find, read, and install Agent Skills from any public GitHub repository through ${SITE_URL}. Use when the user asks whether a skill exists for a task, wants to compare skill collections, wants to read a SKILL.md without cloning, or wants the install command for a skills repository.`,
          1024,
        ),
        url: absoluteUrl(`/.well-known/agent-skills/${SITE_SKILL_NAME}/skill.md`),
        digest: `sha256:${digest}`,
      },
    ],
  };
}

/* --------------------------------------------------------------- api-catalog */

/** RFC 9727 linkset. Served as `application/linkset+json`. */
export function apiCatalog(): object {
  return {
    linkset: [
      {
        anchor: `${SITE_URL}/`,
        "service-desc": [
          {
            href: absoluteUrl("/api/v1/openapi.json"),
            type: "application/vnd.oai.openapi+json",
          },
        ],
        "service-doc": [
          { href: absoluteUrl("/llms.txt"), type: "text/plain" },
          {
            href: absoluteUrl(`/.well-known/agent-skills/${SITE_SKILL_NAME}/skill.md`),
            type: "text/markdown",
          },
        ],
        "service-meta": [
          {
            href: absoluteUrl("/.well-known/agent-skills/index.json"),
            type: "application/json",
          },
        ],
        // The enumeration entry point. Without it a client that starts from the
        // catalog document has no way to ask what books exist.
        collection: [
          { href: absoluteUrl("/api/v1/books"), type: "application/json" },
        ],
        status: [
          { href: absoluteUrl("/api/v1/health"), type: "application/json" },
        ],
      },
    ],
  };
}
