/**
 * Link and image resolution, and the two repairs sanitising leaves behind.
 *
 * Everything here runs *after* `rehype-sanitize`, so every URL still in the
 * tree has already passed the protocol allow-list. That ordering is why these
 * plugins can rewrite `href` without re-validating a scheme.
 */

import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";

export interface LinkContext {
  owner: string;
  repo: string;
  ref: string;
  /** Directory the document lives in, for resolving relative paths. */
  baseDir: string;
  /** Maps an in-repo path to an internal route, when we publish that page. */
  resolveInternal?: (repoPath: string) => string | null;
}

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function joinPath(baseDir: string, rel: string): string {
  const stack = baseDir ? baseDir.split("/").filter(Boolean) : [];
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

function rawUrlFor(ctx: LinkContext, repoPath: string): string {
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${ctx.owner}/${ctx.repo}/${ctx.ref}/${encoded}`;
}

function blobUrlFor(ctx: LinkContext, repoPath: string): string {
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.ref}/${encoded}`;
}

/**
 * Rewrite relative links and images so they resolve against the source repo
 * rather than against our own origin, and mark external links so the renderer
 * can give them `rel`, a new-tab target, and a visible affordance.
 */
export function rehypeResolveLinks(ctx: LinkContext) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "img") {
        const src = node.properties?.src;
        if (typeof src !== "string" || src === "") return;
        node.properties.loading = "lazy";
        node.properties.decoding = "async";
        if (ABSOLUTE.test(src)) return;
        node.properties.src = rawUrlFor(ctx, joinPath(ctx.baseDir, src));
        return;
      }

      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string" || href === "") return;

      if (href.startsWith("#")) return; // in-page anchor

      if (ABSOLUTE.test(href)) {
        node.properties.dataExternal = "true";
        return;
      }

      // Relative: prefer an internal route when we publish that document.
      const [pathPart, hash] = href.split("#");
      const repoPath = joinPath(ctx.baseDir, pathPart);
      const internal = ctx.resolveInternal?.(repoPath);
      if (internal) {
        node.properties.href = hash ? `${internal}#${hash}` : internal;
        node.properties.dataInternal = "true";
      } else {
        node.properties.href = blobUrlFor(ctx, repoPath);
        node.properties.dataExternal = "true";
        node.properties.dataRepoFile = repoPath;
      }
    });
  };
}

/**
 * Repair in-page anchors that sanitising broke.
 *
 * `hast-util-sanitize` defends against DOM clobbering by prefixing every `id`
 * with `user-content-`. It does not rewrite the `href="#…"` that pointed at
 * that id, so GFM footnote links land nowhere. Rather than disable clobber
 * protection — the fix everyone reaches for — re-point the hrefs.
 */
export function rehypeFixClobberedAnchors(prefix = "user-content-") {
  return (tree: Root) => {
    const ids = new Set<string>();
    visit(tree, "element", (node: Element) => {
      const id = node.properties?.id;
      if (typeof id === "string") ids.add(id);
    });
    if (ids.size === 0) return;

    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string" || !href.startsWith("#")) return;
      const target = href.slice(1);
      if (ids.has(target)) return;
      if (ids.has(prefix + target)) node.properties.href = `#${prefix}${target}`;
    });
  };
}
