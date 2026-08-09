/**
 * Hermetic GitHub for the accessibility suite.
 *
 * Loaded into the Next server process with `NODE_OPTIONS=--require`, so it runs
 * before a single line of application code and patches `globalThis.fetch` at
 * the only place every data path goes through. Nothing in `src/` knows this
 * exists — the app makes exactly the requests it makes in production.
 *
 * Why this instead of stubbing modules: the whole point of the suite is to
 * audit the rendered page, and the rendered page is produced by the real
 * `getBook()` running the real markdown pipeline over real bytes. Mocking a
 * layer above `fetch` would let a bug in that pipeline pass. Mocking below it
 * would need a network.
 *
 * Only the fixture repository is served. Every other GitHub URL gets a 404 so
 * an accidental live dependency fails loudly and deterministically instead of
 * flaking against a rate limit.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const OWNER = "a11y-fixture";
/** Directory name === repository name. Both live under tests/fixtures/. */
const REPOS = ["clean-book", "rough-book"];

const rootOf = (repo) => path.join(__dirname, repo);
const filesOf = (repo) => path.join(rootOf(repo), "files");

/** 1x1 transparent PNG — stands in for the owner avatar. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function walk(dir, prefix, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push({ path: rel, mode: "040000", type: "tree", sha: sha1(`tree:${rel}`) });
      walk(path.join(dir, entry.name), rel, out);
    } else {
      const body = fs.readFileSync(path.join(dir, entry.name));
      out.push({
        path: rel,
        mode: "100644",
        type: "blob",
        size: body.byteLength,
        sha: sha1(body),
      });
    }
  }
  return out;
}

function sha1(input) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

const treeCache = new Map();
function tree(repo) {
  if (!treeCache.has(repo)) {
    treeCache.set(repo, {
      tree: walk(filesOf(repo), "", []),
      truncated: false,
      sha: sha1(`root:${repo}`),
    });
  }
  return treeCache.get(repo);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "4999",
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      "x-ratelimit-used": "1",
    },
  });
}

function notFound(message) {
  return json({ message: message || "Not Found" }, 404);
}

/** Returns a Response for URLs this fixture owns, or `null` to pass through. */
function handle(url) {
  const u = new URL(url);

  if (u.hostname === "avatars.githubusercontent.com") {
    return new Response(PNG_1X1, {
      status: 200,
      headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000" },
    });
  }

  if (u.hostname === "api.github.com") {
    const p = u.pathname;

    if (p === "/rate_limit") {
      const reset = Math.floor(Date.now() / 1000) + 3600;
      return json({
        resources: { core: { limit: 5000, remaining: 4999, reset, used: 1 } },
        rate: { limit: 5000, remaining: 4999, reset, used: 1 },
      });
    }
    if (p === `/users/${OWNER}` || p === `/orgs/${OWNER}`) {
      return json(
        JSON.parse(fs.readFileSync(path.join(rootOf(REPOS[0]), "owner.json"), "utf8")),
      );
    }
    for (const repo of REPOS) {
      if (p === `/repos/${OWNER}/${repo}`) {
        return json(JSON.parse(fs.readFileSync(path.join(rootOf(repo), "repo.json"), "utf8")));
      }
      if (p.startsWith(`/repos/${OWNER}/${repo}/git/trees/`)) {
        return json(tree(repo));
      }
    }
    return notFound(`fixture: unmapped GitHub API path ${p}`);
  }

  if (u.hostname === "raw.githubusercontent.com") {
    // /{owner}/{repo}/{ref}/{...path}
    const segments = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (segments[0] !== OWNER || !REPOS.includes(segments[1])) {
      return new Response("Not Found", { status: 404 });
    }
    const FILES = filesOf(segments[1]);
    const rel = segments.slice(3).join("/");
    const file = path.join(FILES, rel);
    if (!file.startsWith(FILES) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return new Response("404: Not Found", { status: 404 });
    }
    return new Response(fs.readFileSync(file), {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // skills.sh is deliberately unreachable: the committed snapshot fallback is
  // part of what the suite audits, and a live scrape would make it flaky.
  if (u.hostname.endsWith("skills.sh")) {
    return new Response("fixture: skills.sh is offline", { status: 503 });
  }

  return null;
}

const realFetch = globalThis.fetch;

globalThis.fetch = function fixtureFetch(input, init) {
  let url;
  try {
    url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
  } catch {
    url = undefined;
  }
  if (typeof url === "string" && /^https?:/i.test(url)) {
    try {
      const response = handle(url);
      if (response) return Promise.resolve(response);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return realFetch(input, init);
};

globalThis.__A11Y_FIXTURE__ = { owner: OWNER, repos: REPOS };
