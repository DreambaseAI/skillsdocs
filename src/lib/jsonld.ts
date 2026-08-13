/**
 * schema.org JSON-LD for the reader surfaces.
 *
 * Emitted as one `<script type="application/ld+json">` carrying a `@graph`,
 * which is what Next's own JSON-LD guide recommends, along with the XSS
 * mitigation reproduced in `jsonLdScriptProps` below.
 *
 * `schema-dts` is not a dependency here, so the shapes are hand-typed and
 * covered by `jsonld.test.ts` instead: every node must have `@type` and `@id`,
 * every `@id` must be absolute, and the graph must contain no `undefined`.
 *
 * No JSX in this file — it is a `.ts` module by contract, so the component is
 * built with `createElement`.
 */

import { createElement, type ReactElement } from "react";
import type { Book } from "./book";
import type { Skill } from "./skills";
import { chapterLicence, repoLicence } from "./serialize";
import {
  PUBLISHER,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  external,
  paths,
} from "./site";

type Json = Record<string, unknown>;

/** Drop keys whose value is null/undefined/"" so the graph stays clean. */
function compact<T extends Json>(node: T): T {
  const out: Json = {};
  for (const [key, value] of Object.entries(node)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as T;
}

/** A date GitHub gave us, narrowed to `YYYY-MM-DD` for schema.org `Date`. */
function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function licenceHref(
  spdx: string | null,
  url: string | null,
): string | undefined {
  if (spdx) return `https://spdx.org/licenses/${spdx}.html`;
  return url ?? undefined;
}

/* ---------------------------------------------------------------- publisher */

export function publisherNode(): Json {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#publisher`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    parentOrganization: {
      "@type": "Organization",
      name: PUBLISHER.name,
      url: PUBLISHER.url,
    },
  };
}

function authorNode(book: Book): Json {
  const { owner } = book.repo;
  return compact({
    "@type": book.repo.ownerType === "User" ? "Person" : "Organization",
    "@id": `${external.owner(owner)}#owner`,
    name: book.owner?.name || owner,
    alternateName: owner,
    url: external.owner(owner),
    image: book.repo.ownerAvatar,
  });
}

/* -------------------------------------------------------------- breadcrumbs */

export function breadcrumbJsonLd(
  parts: Array<{ name: string; url: string }>,
): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: parts.map((part, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: part.name,
      item: part.url.startsWith("http") ? part.url : absoluteUrl(part.url),
    })),
  };
}

function bookBreadcrumbs(book: Book): Json {
  const { owner, repo } = book.repo;
  return {
    ...breadcrumbJsonLd([
      { name: SITE_NAME, url: `${SITE_URL}/` },
      { name: owner, url: external.owner(owner) },
      { name: repo, url: absoluteUrl(paths.book(owner, repo)) },
    ]),
    "@id": `${absoluteUrl(paths.book(owner, repo))}#breadcrumbs`,
  };
}

/* ------------------------------------------------------- source code node */

export function sourceCodeJsonLd(book: Book): Json {
  const { owner, repo, stars, description, pushedAt } = book.repo;
  const licence = repoLicence(book.repo);

  return compact({
    "@type": "SoftwareSourceCode",
    "@id": `${external.repo(owner, repo)}#source`,
    name: `${owner}/${repo}`,
    description: description ?? undefined,
    codeRepository: external.repo(owner, repo),
    url: external.repo(owner, repo),
    programmingLanguage: { "@type": "ComputerLanguage", name: "Markdown" },
    runtimePlatform: "Agent Skills",
    codeSampleType: "full solution",
    license: licenceHref(licence.spdx, licence.url),
    author: { "@id": `${external.owner(owner)}#owner` },
    dateModified: isoDate(pushedAt),
    isAccessibleForFree: true,
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/LikeAction",
      userInteractionCount: stars,
    },
  });
}

/* ---------------------------------------------------------------- the book */

function chapterNode(book: Book, skill: Skill, position: number): Json {
  const { owner, repo } = book.repo;
  const url = absoluteUrl(paths.chapter(owner, repo, skill.slug));

  return compact({
    "@type": "Chapter",
    "@id": `${url}#chapter`,
    position,
    name: skill.name,
    headline: skill.title,
    description: skill.description || undefined,
    url,
    wordCount: skill.wordCount,
    timeRequired: `PT${skill.readingMinutes}M`,
    isPartOf: { "@id": `${absoluteUrl(paths.book(owner, repo))}#book` },
    encoding: {
      "@type": "MediaObject",
      contentUrl: `${url}.md`,
      encodingFormat: "text/markdown",
    },
  });
}

export function bookJsonLd(book: Book): Json {
  const { owner, repo, description, createdAt, pushedAt } = book.repo;
  const url = absoluteUrl(paths.book(owner, repo));
  const licence = repoLicence(book.repo);

  const bookNode = compact({
    "@type": "Book",
    "@id": `${url}#book`,
    name: book.owner?.name ? `${book.owner.name} — ${repo}` : `${owner}/${repo}`,
    alternateName: `${owner}/${repo}`,
    url,
    description:
      description ??
      `Agent Skills published in the GitHub repository ${owner}/${repo}.`,
    bookFormat: "https://schema.org/EBook",
    inLanguage: "en",
    numberOfPages: book.skills.length,
    datePublished: isoDate(createdAt),
    dateModified: isoDate(pushedAt),
    license: licenceHref(licence.spdx, licence.url),
    isAccessibleForFree: true,
    // A credited book is the repo's *library* — claiming the owner as its
    // author in structured data would be a lie search engines repeat.
    author:
      book.provenance === "credited"
        ? undefined
        : { "@id": `${external.owner(owner)}#owner` },
    contributor:
      book.provenance === "credited"
        ? { "@id": `${external.owner(owner)}#owner` }
        : undefined,
    publisher: { "@id": `${SITE_URL}/#publisher` },
    image: `${url}/opengraph-image`,
    isBasedOn: { "@id": `${external.repo(owner, repo)}#source` },
    workExample: {
      "@type": "Book",
      bookFormat: "https://schema.org/EBook",
      url: absoluteUrl(paths.bookMarkdown(owner, repo)),
      encodingFormat: "text/markdown",
    },
    hasPart: book.skills.map((skill, i) => chapterNode(book, skill, i + 1)),
  });

  return graph([
    bookNode,
    authorNode(book),
    sourceCodeJsonLd(book),
    publisherNode(),
    bookBreadcrumbs(book),
  ]);
}

/* -------------------------------------------------------------- a chapter */

export function chapterJsonLd(book: Book, skill: Skill): Json {
  const { owner, repo, defaultBranch: ref, pushedAt } = book.repo;
  const url = absoluteUrl(paths.chapter(owner, repo, skill.slug));
  const bookUrl = absoluteUrl(paths.book(owner, repo));
  const licence = chapterLicence(book, skill);
  const position = book.skills.findIndex((s) => s.slug === skill.slug) + 1;
  const upstream = external.file(owner, repo, ref, skill.skillMdPath);

  const node = compact({
    "@type": ["Chapter", "TechArticle"],
    "@id": `${url}#chapter`,
    position,
    name: skill.name,
    headline: skill.title,
    description: skill.description || undefined,
    url,
    inLanguage: "en",
    wordCount: skill.wordCount,
    timeRequired: `PT${skill.readingMinutes}M`,
    dateModified: isoDate(pushedAt),
    license: licenceHref(licence.spdx, licence.url),
    isAccessibleForFree: true,
    isPartOf: {
      "@type": "Book",
      "@id": `${bookUrl}#book`,
      name: `${owner}/${repo}`,
      url: bookUrl,
    },
    // A credited chapter was installed into this repo, not written by its
    // owner; the owner appears as contributor, never author.
    author:
      skill.origin === "credited"
        ? undefined
        : { "@id": `${external.owner(owner)}#owner` },
    contributor:
      skill.origin === "credited"
        ? { "@id": `${external.owner(owner)}#owner` }
        : undefined,
    publisher: { "@id": `${SITE_URL}/#publisher` },
    image: `${url}/opengraph-image`,
    encoding: {
      "@type": "MediaObject",
      contentUrl: `${url}.md`,
      encodingFormat: "text/markdown",
    },
    mainEntity: compact({
      "@type": "SoftwareSourceCode",
      "@id": `${upstream}#src`,
      name: skill.skillMdPath,
      description: skill.description || undefined,
      codeRepository: external.repo(owner, repo),
      url: upstream,
      programmingLanguage: { "@type": "ComputerLanguage", name: "Markdown" },
      runtimePlatform: "Agent Skills",
      license: licenceHref(licence.spdx, licence.url),
      targetProduct: {
        "@type": "SoftwareApplication",
        name: "Agent Skills compatible agent",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "macOS, Linux, Windows",
      },
      isAccessibleForFree: true,
    }),
  });

  return graph([
    node,
    authorNode(book),
    publisherNode(),
    {
      ...breadcrumbJsonLd([
        { name: SITE_NAME, url: `${SITE_URL}/` },
        { name: owner, url: external.owner(owner) },
        { name: repo, url: bookUrl },
        { name: skill.name, url },
      ]),
      "@id": `${url}#breadcrumbs`,
    },
  ]);
}

/* ----------------------------------------------------------------- home */

export function siteJsonLd(): Json {
  return graph([
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: `${SITE_URL}/`,
      publisher: { "@id": `${SITE_URL}/#publisher` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "DataCatalog",
      "@id": `${SITE_URL}/#catalog`,
      name: "Agent Skills catalog",
      description:
        "Every indexed Agent Skills repository, rendered as a book and as Markdown.",
      url: `${SITE_URL}/`,
      isAccessibleForFree: true,
      publisher: { "@id": `${SITE_URL}/#publisher` },
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "text/plain",
          contentUrl: absoluteUrl("/llms.txt"),
        },
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: absoluteUrl("/api/v1/openapi.json"),
        },
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: absoluteUrl("/.well-known/agent-skills/index.json"),
        },
      ],
    },
    publisherNode(),
  ]);
}

/* --------------------------------------------------------------- emission */

function graph(nodes: Json[]): Json {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/**
 * Props for a JSON-LD `<script>`.
 *
 * The `<` escape is Next's documented XSS mitigation: JSON-LD is injected as
 * raw text, so a `</script>` inside any third-party description would
 * otherwise close the tag.
 */
export function jsonLdScriptProps(data: object): {
  type: "application/ld+json";
  dangerouslySetInnerHTML: { __html: string };
} {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(data).replace(/</g, "\\u003c"),
    },
  };
}

export function JsonLd({ data }: { data: object }): ReactElement {
  return createElement("script", jsonLdScriptProps(data));
}
