/**
 * `GET /api/v1/openapi.json` — OpenAPI 3.1 description of every agent surface.
 *
 * Includes the Markdown and `.well-known` routes as well as the JSON ones. They
 * are not JSON, but they are the endpoints an agent most wants, and OpenAPI 3.1
 * can describe a `text/markdown` response perfectly well. A description that
 * omitted them would be an accurate map of the wrong territory.
 *
 * Pure and dependency-free, so Cache Components prerenders it at build time.
 */

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { TAKEDOWN_CONTACT } from "@/lib/serialize";

const OWNER_PARAM = {
  name: "owner",
  in: "path",
  required: true,
  description: "GitHub account or organisation, e.g. `anthropics`.",
  schema: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9-]{0,38}$" },
} as const;

const REPO_PARAM = {
  name: "repo",
  in: "path",
  required: true,
  description: "Repository name, e.g. `skills`.",
  schema: { type: "string", pattern: "^[\\w.-]{1,100}$" },
} as const;

const SKILL_PARAM = {
  name: "skill",
  in: "path",
  required: true,
  description: "Chapter slug, as listed in the book's `chapters[].slug`.",
  schema: { type: "string" },
} as const;

const ERRORS = {
  "400": { $ref: "#/components/responses/Error" },
  "404": { $ref: "#/components/responses/Error" },
  "429": { $ref: "#/components/responses/Error" },
  "502": { $ref: "#/components/responses/Error" },
} as const;

/**
 * The `.md` routes answer failures as `text/plain`, not as the JSON envelope.
 * Declaring `application/json` here made every generated client `JSON.parse`
 * a sentence and throw.
 */
const TEXT_ERRORS = {
  "400": { $ref: "#/components/responses/TextError" },
  "404": { $ref: "#/components/responses/TextError" },
  "429": { $ref: "#/components/responses/TextError" },
  "502": { $ref: "#/components/responses/TextError" },
} as const;

const NOT_MODIFIED = {
  "304": {
    description:
      "The `If-None-Match` you sent still matches. No body; the `ETag` is repeated.",
  },
} as const;

function markdownResponse(description: string) {
  return {
    "200": {
      description,
      headers: {
        ETag: {
          description: "Strong validator over the response bytes.",
          schema: { type: "string" },
        },
        "X-Content-Tokens": {
          description: "Rough token count of the body, for context budgeting.",
          schema: { type: "string" },
        },
      },
      content: { "text/markdown": { schema: { type: "string" } } },
    },
    ...NOT_MODIFIED,
    ...TEXT_ERRORS,
  };
}

/**
 * The OpenAPI document.
 *
 * `unknown`, not `any`: the shape is a spec document assembled by hand and
 * nothing downstream indexes into it, so the loose type buys nothing and
 * `any` fails the lint gate.
 */
export function document(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} API`,
      version: "1.0.0",
      summary: "Read Agent Skills from any public GitHub repository.",
      description: `${SITE_DESCRIPTION}\n\nRead-only, unauthenticated, CORS-open. Content is mirrored from public GitHub repositories and owned by its authors; skills with no detectable licence are linked but never inlined. Takedown: ${TAKEDOWN_CONTACT}.\n\nThe fastest path to content is not JSON: append \`.md\` to any reader URL.`,
      license: { name: "MIT", identifier: "MIT" },
      contact: { name: SITE_NAME, url: SITE_URL },
    },
    servers: [{ url: SITE_URL, description: "Production" }],
    // Read-only and unauthenticated by design. An empty root `security` says
    // so explicitly; without it every default Redocly/Spectral run reports
    // eleven `security-defined` errors against a document that is correct.
    security: [],
    externalDocs: {
      description: "llms.txt — the human- and agent-readable site index",
      url: `${SITE_URL}/llms.txt`,
    },
    tags: [
      { name: "markdown", description: "Verbatim skill content as text/markdown." },
      { name: "books", description: "Structured book and chapter data." },
      { name: "discovery", description: "Machine-installable manifests." },
      { name: "meta", description: "Search, health, and description documents." },
    ],
    paths: {
      "/{owner}/{repo}.md": {
        get: {
          tags: ["markdown"],
          operationId: "getBookMarkdown",
          summary: "The whole book as one Markdown document",
          description:
            "Repository README plus every licensed chapter, bodies verbatim with YAML frontmatter intact, in reading order. This is the book's llms-full.txt. Also reachable by sending `Accept: text/markdown` to `/{owner}/{repo}`.",
          parameters: [OWNER_PARAM, REPO_PARAM],
          responses: markdownResponse("The book, as Markdown."),
        },
      },
      "/{owner}/{repo}/{skill}.md": {
        get: {
          tags: ["markdown"],
          operationId: "getChapterMarkdown",
          summary: "One chapter as Markdown",
          description:
            "A provenance blockquote followed by the upstream SKILL.md verbatim. The `X-Skill-Raw` response header points at the unheadered bytes on raw.githubusercontent.",
          parameters: [OWNER_PARAM, REPO_PARAM, SKILL_PARAM],
          responses: markdownResponse("The chapter, as Markdown."),
        },
      },
      "/{owner}/{repo}/.well-known/agent-skills/index.json": {
        get: {
          tags: ["discovery"],
          operationId: "getBookAgentSkills",
          summary: "Agent Skills discovery manifest for one book",
          description:
            "One entry per licensed chapter, each with a sha256 digest computed over the raw upstream bytes. Verify the digest before writing a skill to disk. Chapters with no detectable licence are omitted; the count is in `X-Skills-Omitted`.",
          parameters: [OWNER_PARAM, REPO_PARAM],
          responses: {
            "200": {
              description: "Discovery manifest.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AgentSkillsManifest" },
                },
              },
            },
            ...NOT_MODIFIED,
            ...ERRORS,
          },
        },
      },
      "/.well-known/agent-skills/index.json": {
        get: {
          tags: ["discovery"],
          operationId: "getSiteAgentSkills",
          summary: "Agent Skills published by this site",
          responses: {
            "200": {
              description: "Discovery manifest.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AgentSkillsManifest" },
                },
              },
            },
          },
        },
      },
      "/.well-known/api-catalog": {
        get: {
          tags: ["discovery"],
          operationId: "getApiCatalog",
          summary: "RFC 9727 linkset",
          responses: {
            "200": {
              description: "Linkset.",
              content: { "application/linkset+json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/v1/books": {
        get: {
          tags: ["books"],
          operationId: "listBooks",
          summary: "Every book in the catalog",
          description:
            "The answer to \"what do you have?\". Paginated, ordered by install count, one row per repository with its HTML, Markdown, JSON and manifest URLs. Costs no GitHub quota: the figures come from the verified seed catalog merged with skills.sh, and a book's `json` link is where the authoritative, live chapter count lives.",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
            {
              name: "cursor",
              in: "query",
              description:
                "Offset from a previous `nextCursor`. Anything that is not a non-negative integer is rejected with `invalid_cursor` rather than silently restarting at page one.",
              schema: { type: "string", pattern: "^\\d{1,7}$" },
            },
            {
              name: "owner",
              in: "query",
              description: "Restrict to one GitHub owner.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "A page of the catalog.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BookListing" },
                },
              },
            },
            ...NOT_MODIFIED,
            "400": { $ref: "#/components/responses/Error" },
          },
        },
      },
      "/api/v1/schemas/agent-skills-index.json": {
        get: {
          tags: ["discovery"],
          operationId: "getAgentSkillsSchema",
          summary: "JSON Schema for the Agent Skills manifests",
          description:
            "What every manifest's `$schema` points at. The upstream `schemas.agentskills.io` host does not resolve, so we publish the shape we actually emit.",
          responses: {
            "200": {
              description: "JSON Schema 2020-12 document.",
              content: { "application/schema+json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/v1/books/{owner}/{repo}": {
        get: {
          tags: ["books"],
          operationId: "getBook",
          summary: "Book manifest",
          description:
            "Repository metadata, licence resolution, install command, and one entry per chapter with digests and stats. Chapter bodies are not included.",
          parameters: [OWNER_PARAM, REPO_PARAM],
          responses: {
            "200": {
              description: "Book manifest.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Book" } },
              },
            },
            ...NOT_MODIFIED,
            ...ERRORS,
          },
        },
      },
      "/api/v1/books/{owner}/{repo}/skills/{skill}": {
        get: {
          tags: ["books"],
          operationId: "getChapter",
          summary: "One chapter, with its content",
          description:
            "`content.raw` is the verbatim upstream file. It is `null`, with a `licenseNotice`, when no licence could be detected for the skill.",
          parameters: [OWNER_PARAM, REPO_PARAM, SKILL_PARAM],
          responses: {
            "200": {
              description: "Chapter.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Chapter" } },
              },
            },
            ...NOT_MODIFIED,
            ...ERRORS,
          },
        },
      },
      "/api/v1/search": {
        get: {
          tags: ["meta"],
          operationId: "search",
          summary: "Search books and skills",
          description:
            "Searches the indexed book catalog and the skills.sh skill index. Supplying both `owner` and `repo` additionally searches that book's chapter names, descriptions, headings and bodies. The `sources` field reports which indexes actually ran.",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              description: "Free-text query. All terms must match.",
              schema: { type: "string", maxLength: 200 },
            },
            {
              name: "owner",
              in: "query",
              description: "Restrict to one GitHub owner.",
              schema: { type: "string" },
            },
            {
              name: "repo",
              in: "query",
              description:
                "Restrict to one repository. With `owner`, enables chapter-body search.",
              schema: { type: "string" },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
            },
            {
              name: "cursor",
              in: "query",
              description: "Opaque offset from a previous `nextCursor`.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Ranked results.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SearchResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/Error" },
          },
        },
      },
      "/api/v1/health": {
        get: {
          tags: ["meta"],
          operationId: "health",
          summary: "Liveness and upstream rate-limit budget",
          description:
            "Never cached. Returns 503 with `status: \"degraded\"` when GitHub is unreachable or the quota is exhausted.",
          responses: {
            "200": {
              description: "Healthy.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Health" } },
              },
            },
            "503": {
              description: "Degraded — upstream unreachable or quota exhausted.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Health" } },
              },
            },
          },
        },
      },
      "/api/v1/openapi.json": {
        get: {
          tags: ["meta"],
          operationId: "getOpenApi",
          summary: "This document",
          responses: {
            "200": {
              description: "OpenAPI 3.1 description.",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/llms.txt": {
        get: {
          tags: ["meta"],
          operationId: "getLlmsTxt",
          summary: "Site index in the llmstxt.org format",
          responses: {
            "200": {
              description: "Markdown served as text/plain, per the llms.txt convention.",
              content: { "text/plain": { schema: { type: "string" } } },
            },
          },
        },
      },
    },
    components: {
      responses: {
        Error: {
          description: "Error envelope.",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/Error" } },
          },
        },
        TextError: {
          description:
            "A one-line explanation as plain text. The Markdown routes do not switch media type to report a failure.",
          content: { "text/plain": { schema: { type: "string" } } },
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  enum: [
                    "bad_request",
                    "invalid_cursor",
                    "missing_query",
                    "query_too_long",
                    "not_found",
                    "rate_limited",
                    "upstream_error",
                  ],
                },
                message: { type: "string" },
                hint: { type: "string" },
              },
            },
          },
        },
        License: {
          type: "object",
          description:
            "Resolved licence. `redistributable: false` means no licence was detectable and the body is never served.",
          required: ["spdx", "name", "scope", "redistributable"],
          properties: {
            spdx: { type: ["string", "null"], examples: ["MIT", "Apache-2.0"] },
            name: { type: "string" },
            url: { type: ["string", "null"], format: "uri" },
            scope: { type: "string", enum: ["repo", "skill", "none"] },
            redistributable: { type: "boolean" },
          },
        },
        AgentSkillsManifest: {
          type: "object",
          required: ["$schema", "skills"],
          properties: {
            $schema: { type: "string", format: "uri" },
            skills: {
              type: "array",
              items: {
                type: "object",
                required: ["name", "type", "description", "url", "digest"],
                properties: {
                  name: { type: "string", maxLength: 64 },
                  type: { type: "string", const: "skill-md" },
                  description: { type: "string", maxLength: 1024 },
                  url: {
                    type: "string",
                    format: "uri",
                    description: "The Markdown document. `digest` is over these bytes.",
                  },
                  digest: {
                    type: "string",
                    pattern: "^sha256:[0-9a-f]{64}$",
                    description: "sha256 of the bytes served at `url`.",
                  },
                  source: {
                    type: "string",
                    format: "uri",
                    description:
                      "The unheadered upstream file on raw.githubusercontent. Absent for skills this site authors.",
                  },
                  sourceDigest: {
                    type: "string",
                    pattern: "^sha256:[0-9a-f]{64}$",
                    description: "sha256 of the bytes served at `source`.",
                  },
                },
              },
            },
          },
        },
        ChapterSummary: {
          type: "object",
          required: ["position", "name", "slug", "markdown", "license"],
          properties: {
            position: { type: "integer", minimum: 1 },
            name: { type: "string" },
            slug: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            group: { type: ["string", "null"] },
            origin: {
              type: "string",
              enum: ["authored", "credited"],
              description:
                "authored — published from this repository; credited — installed into it, in use here but written elsewhere.",
            },
            path: { type: "string" },
            html: { type: "string", format: "uri" },
            markdown: { type: "string", format: "uri" },
            json: { type: "string", format: "uri" },
            source: { type: "string", format: "uri" },
            gitBlobSha: { type: ["string", "null"] },
            digest: { type: ["string", "null"], pattern: "^sha256:[0-9a-f]{64}$" },
            bytes: { type: ["integer", "null"] },
            wordCount: { type: "integer" },
            readingMinutes: { type: "integer" },
            estimatedTokens: { type: ["integer", "null"] },
            license: { $ref: "#/components/schemas/License" },
            frontmatter: { type: "object", additionalProperties: true },
            allowedTools: { type: "array", items: { type: "string" } },
            compatibility: { type: "array", items: { type: "string" } },
            headingCount: {
              type: "integer",
              description:
                "How many headings the chapter has. The headings themselves are `outline` on the chapter endpoint.",
            },
            resources: {
              type: "object",
              description: "Files bundled next to the SKILL.md, by kind.",
              properties: {
                scripts: { type: "array", items: { type: "string" } },
                references: { type: "array", items: { type: "string" } },
                assets: { type: "array", items: { type: "string" } },
                other: { type: "array", items: { type: "string" } },
              },
            },
            variants: { type: "array", items: { type: "object", additionalProperties: true } },
            issues: {
              type: "array",
              items: { type: "string" },
              description: "Spec violations found in the skill's frontmatter.",
            },
          },
        },
        Book: {
          type: "object",
          required: ["schemaVersion", "id", "owner", "repo", "chapters"],
          properties: {
            schemaVersion: { type: "string", const: "1.0" },
            id: { type: "string", examples: ["anthropics/skills"] },
            owner: { type: "string" },
            repo: { type: "string" },
            title: { type: "string" },
            description: { type: ["string", "null"] },
            issueNumber: { type: "integer", minimum: 1, maximum: 99 },
            provenance: {
              type: "string",
              enum: ["authored", "credited", "mixed"],
              description:
                "authored — the repository publishes these skills; credited — every skill is installed into the repository (its working library), and `install` is omitted; mixed — both, with credited skills in their own part.",
            },
            homepage: { type: "string", format: "uri" },
            markdown: { type: "string", format: "uri" },
            agentSkillsIndex: { type: "string", format: "uri" },
            source: {
              type: "object",
              properties: {
                provider: { type: "string", const: "github" },
                url: { type: "string", format: "uri" },
                defaultBranch: { type: "string" },
                license: { $ref: "#/components/schemas/License" },
                stars: { type: "integer" },
                pushedAt: { type: ["string", "null"], format: "date-time" },
                treeTruncated: {
                  type: "boolean",
                  description: "True when GitHub capped the tree and chapters may be missing.",
                },
              },
            },
            stats: {
              type: "object",
              properties: {
                skillCount: { type: "integer" },
                republishable: { type: "integer" },
                totalWords: { type: "integer" },
                totalReadingMinutes: { type: "integer" },
                layouts: { type: "array", items: { type: "string" } },
              },
            },
            install: {
              type: "object",
              properties: {
                all: {
                  type: "string",
                  description:
                    "The only install form verified in the wild. There is no per-skill argument.",
                  examples: ["npx skills add anthropics/skills"],
                },
              },
            },
            chapters: {
              type: "array",
              items: { $ref: "#/components/schemas/ChapterSummary" },
            },
          },
        },
        /**
         * Deliberately NOT `allOf: [ChapterSummary, …]`. The two are different
         * shapes: a summary inside a book carries flat `html`/`markdown`/`json`
         * URLs, while the chapter endpoint nests them under `links` with
         * different keys (`canonical`, `raw`, `prev`, `next`). Declaring one as
         * an extension of the other made every live response fail validation on
         * a missing required `markdown`.
         */
        Chapter: {
          type: "object",
          required: ["schemaVersion", "slug", "name", "links", "license"],
          properties: {
            schemaVersion: { type: "string", const: "1.0" },
            book: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                url: { type: "string", format: "uri" },
                json: { type: "string", format: "uri" },
                markdown: { type: "string", format: "uri" },
              },
            },
            position: { type: "integer", minimum: 1 },
            chapterCount: { type: "integer" },
            name: { type: "string" },
            slug: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            group: { type: ["string", "null"] },
            origin: {
              type: "string",
              enum: ["authored", "credited"],
              description:
                "authored — published from this repository; credited — installed into it, in use here but written elsewhere. Credited chapters omit `install`.",
            },
            path: { type: "string" },
            links: {
              type: "object",
              required: ["canonical", "markdown", "raw"],
              properties: {
                canonical: { type: "string", format: "uri" },
                markdown: { type: "string", format: "uri" },
                source: { type: "string", format: "uri" },
                raw: { type: "string", format: "uri" },
                openGraphImage: { type: "string", format: "uri" },
                prev: { type: ["string", "null"], format: "uri" },
                next: { type: ["string", "null"], format: "uri" },
              },
            },
            frontmatter: { type: "object", additionalProperties: true },
            allowedTools: { type: "array", items: { type: "string" } },
            compatibility: { type: "array", items: { type: "string" } },
            wordCount: { type: "integer" },
            readingMinutes: { type: "integer" },
            outline: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  level: { type: "integer" },
                  text: { type: "string" },
                  id: { type: "string" },
                },
              },
            },
            resources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  kind: { type: "string" },
                  bytes: { type: ["integer", "null"] },
                  url: { type: "string", format: "uri" },
                  raw: { type: "string", format: "uri" },
                },
              },
            },
            variants: { type: "array", items: { type: "object", additionalProperties: true } },
            issues: { type: "array", items: { type: "string" } },
            license: { $ref: "#/components/schemas/License" },
            licenseNotice: { type: ["string", "null"] },
            content: {
              type: ["object", "null"],
              properties: {
                format: { type: "string", const: "markdown" },
                raw: { type: "string" },
                bytes: { type: "integer" },
                estimatedTokens: { type: "integer" },
                digest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
              },
            },
            install: {
              type: "object",
              properties: { all: { type: "string" } },
            },
            attribution: {
              type: "object",
              properties: {
                notice: { type: "string" },
                upstream: { type: "string", format: "uri" },
                takedown: { type: "string" },
              },
            },
          },
        },
        BookListing: {
          type: "object",
          required: ["schemaVersion", "total", "books"],
          properties: {
            schemaVersion: { type: "string", const: "1.0" },
            total: { type: "integer" },
            limit: { type: "integer" },
            cursor: { type: "integer" },
            nextCursor: { type: ["string", "null"] },
            stats: {
              type: "object",
              properties: {
                source: { type: "string", const: "catalog" },
                note: { type: "string" },
                live: { type: "boolean" },
              },
            },
            books: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "owner", "repo", "html", "markdown", "json", "manifest"],
                properties: {
                  id: { type: "string", examples: ["anthropics/skills"] },
                  owner: { type: "string" },
                  repo: { type: "string" },
                  description: { type: ["string", "null"] },
                  official: { type: "boolean" },
                  skillCount: { type: "integer" },
                  installs: { type: "integer" },
                  stars: { type: "integer" },
                  license: { type: ["string", "null"] },
                  layouts: { type: "array", items: { type: "string" } },
                  html: { type: "string", format: "uri" },
                  markdown: { type: "string", format: "uri" },
                  json: { type: "string", format: "uri" },
                  manifest: { type: "string", format: "uri" },
                  source: { type: "string", format: "uri" },
                  install: { type: "string" },
                },
              },
            },
          },
        },
        SearchResponse: {
          type: "object",
          required: ["query", "total", "results"],
          properties: {
            query: { type: "string" },
            total: { type: "integer" },
            limit: { type: "integer" },
            cursor: { type: ["integer", "null"] },
            nextCursor: { type: ["string", "null"] },
            sources: {
              type: "array",
              items: { type: "string" },
              description: "Which indexes were consulted for this response.",
            },
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["book", "skill"] },
                  book: { type: "string" },
                  skill: { type: ["string", "null"] },
                  title: { type: "string" },
                  description: { type: ["string", "null"] },
                  score: {
                    type: "number",
                    minimum: 0,
                    description:
                      "Relevance. Two incomparable scales: index hits use the shared matcher's unbounded score (observed 10–15 for a strong title match), book-scoped hits use a 0–1 field weight. `origin` says which ruler applies, and results are never interleaved across the two.",
                  },
                  snippet: { type: ["string", "null"] },
                  html: { type: "string", format: "uri" },
                  markdown: { type: "string", format: "uri" },
                  install: { type: "string" },
                  installs: { type: ["integer", "null"] },
                  matchedOn: { type: "string" },
                  json: { type: "string", format: "uri" },
                  origin: {
                    type: "string",
                    enum: ["index", "book"],
                    description:
                      "`index` — the shared catalog + skills.sh corpus. `book` — a live pass over one repository's chapter bodies, which only runs when both `owner` and `repo` are given.",
                  },
                },
              },
            },
          },
        },
        Health: {
          type: "object",
          required: ["status", "upstream"],
          properties: {
            status: { type: "string", enum: ["ok", "degraded"] },
            service: { type: "string" },
            version: { type: "string" },
            time: { type: "string", format: "date-time" },
            upstream: {
              type: "object",
              properties: {
                provider: { type: "string" },
                reachable: { type: "boolean" },
                authenticated: { type: "boolean" },
                limit: { type: "integer" },
                remaining: { type: ["integer", "null"] },
                resetAt: { type: ["string", "null"] },
              },
            },
            budget: {
              type: "object",
              properties: {
                callsPerBook: {
                  type: "object",
                  properties: {
                    typical: { type: "integer" },
                    worstCase: { type: "integer" },
                  },
                },
                booksRemaining: { type: ["integer", "null"] },
                note: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}

export async function GET(): Promise<Response> {
  return new Response(`${JSON.stringify(document(), null, 2)}\n`, {
    headers: {
      "content-type": "application/vnd.oai.openapi+json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "x-robots-tag": "all",
    },
  });
}
