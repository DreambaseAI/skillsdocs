/**
 * `GET /api/v1/schemas/agent-skills-index.json`
 *
 * The `$schema` every agent-skills manifest we serve points at.
 *
 * Mintlify — whose field shape this is — points at
 * `https://schemas.agentskills.io/discovery/0.2.0/schema.json`, and that
 * hostname does not resolve (NXDOMAIN, measured 2026-08; `agentskills.io`
 * itself answers but 404s the schema path). A `$schema` that dereferences to a
 * DNS failure is worse than none, so we publish the shape we actually emit and
 * point at it. The field *values* stay wire-compatible.
 */

import { AGENT_SKILLS_SCHEMA, AGENT_SKILLS_SCHEMA_UPSTREAM } from "@/lib/serialize";
import { SITE_NAME } from "@/lib/site";

const SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: AGENT_SKILLS_SCHEMA,
  title: "Agent Skills discovery manifest",
  description: `The manifest ${SITE_NAME} serves at /{owner}/{repo}/.well-known/agent-skills/index.json and /.well-known/agent-skills/index.json. Field-compatible with ${AGENT_SKILLS_SCHEMA_UPSTREAM}, which does not resolve.`,
  type: "object",
  required: ["$schema", "skills"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string", format: "uri" },
    skills: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "type", "description", "url", "digest"],
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 64 },
          type: { const: "skill-md" },
          description: { type: "string", maxLength: 1024 },
          url: {
            type: "string",
            format: "uri",
            description:
              "The Markdown document this entry describes. `digest` is over these exact bytes.",
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
        dependentRequired: { source: ["sourceDigest"], sourceDigest: ["source"] },
      },
    },
  },
};

export async function GET(): Promise<Response> {
  return new Response(`${JSON.stringify(SCHEMA, null, 2)}\n`, {
    headers: {
      "content-type": "application/schema+json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "x-robots-tag": "all",
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      allow: "GET, HEAD, OPTIONS",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
    },
  });
}
