import Link from "next/link";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Doc01Icon,
  File01Icon,
  FileScriptIcon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";

import { plural } from "@/components/book/format";
import {
  classifyAll,
  formatBytes,
  resourcePath,
  type ClassifiedResource,
} from "@/lib/resources";
import type { SkillResource } from "@/lib/skills";
import { cn } from "@/lib/utils";

/**
 * The bundled files of one skill, as a tree.
 *
 * ## Why this is a nested list and not `role="tree"`
 *
 * The brief allowed either. This is a list, deliberately, and the reasoning is
 * worth writing down because "it's a tree, use the tree role" is the obvious
 * answer and it is wrong here.
 *
 * `role="tree"` describes a **selection widget** — a control where arrow keys
 * move a roving `tabindex` between `treeitem`s and the widget owns the
 * keyboard. That is the right shape for a file picker in an IDE. What this is,
 * is a **table of contents**: every leaf is a link to a page, and activating
 * one navigates. Three consequences follow.
 *
 * 1. **The tree role costs the reader their own keys.** In a tree, Up/Down/
 *    Left/Right are the widget's, so a screen-reader user has to leave browse
 *    mode to move through it and cannot use their reading cursor, heading
 *    navigation or `Tab`-to-next-link inside it. For a list of 82 links —
 *    `anthropics/skills/canvas-design` ships exactly that many — the native
 *    list is strictly faster to work with.
 * 2. **A link inside a `treeitem` is a known AT trap.** `treeitem` takes its
 *    accessible name from its contents, and the interactive child then has to
 *    be hidden from the widget or it becomes an unreachable second control.
 *    Getting that right buys nothing that `<a>` did not already give away
 *    free, including "visited".
 * 3. **A list counts itself.** "List, 12 items" and "link, 3 of 12" are
 *    spoken by every screen reader with no work from us, and are exactly the
 *    orientation a reader arriving in an appendix wants.
 *
 * So: `<nav>` → nested `<ul>`, directories as native `<details>`, files as
 * `<a>` with `aria-current="page"` on the open one. Two further things fall
 * out of that choice, both of which the ARIA pattern would have cost us:
 *
 * - **It ships no JavaScript.** This is a server component; `<details>` does
 *   its own disclosure. A roving-tabindex tree cannot be.
 * - **Find-in-page works.** Browsers open a closed `<details>` when a search
 *   hits inside it. A collapsed `aria-expanded="false"` subtree with
 *   `hidden` children does not.
 */

export interface FileTreeNode {
  /** Directory name — the last segment. `""` for the root. */
  name: string;
  /** Path relative to the skill, with no trailing slash. `""` at the root. */
  path: string;
  children: FileTreeNode[];
  files: ClassifiedResource[];
  /** Files at or beneath this node, for the count in the summary. */
  total: number;
}

/**
 * Collation that puts `step-2.md` before `step-10.md`.
 *
 * Plain `localeCompare` sorts those the other way round, and a numbered
 * sequence listed out of sequence reads as a bug in the source repository
 * rather than as a bug here.
 */
const collate = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Fold a flat resource list into directories.
 *
 * Exported for the tests and for any caller that wants the shape without the
 * markup — the rail's counts, for instance.
 */
export function buildFileTree(resources: SkillResource[]): FileTreeNode {
  const root: FileTreeNode = { name: "", path: "", children: [], files: [], total: 0 };

  for (const resource of classifyAll(resources)) {
    const segments = resource.relPath.split("/");
    // The leaf is the file itself; only the directories above it make nodes.
    segments.pop();

    let node = root;
    let walked = "";
    for (const segment of segments) {
      walked = walked ? `${walked}/${segment}` : segment;
      let next = node.children.find((child) => child.name === segment);
      if (!next) {
        next = { name: segment, path: walked, children: [], files: [], total: 0 };
        node.children.push(next);
      }
      node = next;
    }
    node.files.push(resource);
  }

  return sortTree(root);
}

function sortTree(node: FileTreeNode): FileTreeNode {
  node.children.sort((a, b) => collate.compare(a.name, b.name));
  node.files.sort((a, b) => collate.compare(a.relPath, b.relPath));
  node.children.forEach(sortTree);
  node.total =
    node.files.length + node.children.reduce((sum, child) => sum + child.total, 0);
  return node;
}

/** Is `dir` an ancestor of — or equal to — the directory `path` sits in? */
function contains(dir: string, path: string | undefined): boolean {
  if (!path) return false;
  if (dir === "") return true;
  return path === dir || path.startsWith(`${dir}/`);
}

const FILE_ICONS: Record<ClassifiedResource["render"], IconSvgElement> = {
  prose: Doc01Icon,
  code: FileScriptIcon,
  binary: File01Icon,
};

export interface FileTreeProps {
  resources: SkillResource[];
  owner: string;
  repo: string;
  /** Skill slug — the third path segment the links are built on. */
  slug: string;
  /** `relPath` of the file open right now, if one is. Gets `aria-current`. */
  currentPath?: string;
  /**
   * `appendix` opens every directory: the reader came here to see the list.
   * `rail` opens only what it has to, because the rail is a margin, not a page.
   */
  density?: "appendix" | "rail";
  /** Accessible name for the surrounding `nav`. */
  label?: string;
  className?: string;
}

/**
 * Directories a rail opens without being asked.
 *
 * Below this the whole tree fits in a margin and collapsing it only hides
 * things; above it, `supabase-postgres-best-practices` (35 references) or
 * `canvas-design` (82 resources) would fill the rail and push the chapter
 * navigation off the screen.
 */
const RAIL_OPEN_BELOW = 20;

export function FileTree({
  resources,
  owner,
  repo,
  slug,
  currentPath,
  density = "appendix",
  label = "Bundled files",
  className,
}: FileTreeProps) {
  const root = buildFileTree(resources);
  if (root.total === 0) return null;

  const openAll = density === "appendix" || root.total < RAIL_OPEN_BELOW;

  return (
    <nav
      aria-label={label}
      data-density={density}
      className={cn("file-tree text-[0.8125rem] leading-snug", className)}
    >
      <Branch
        node={root}
        depth={0}
        owner={owner}
        repo={repo}
        slug={slug}
        currentPath={currentPath}
        openAll={openAll}
      />
    </nav>
  );
}

interface BranchProps {
  node: FileTreeNode;
  depth: number;
  owner: string;
  repo: string;
  slug: string;
  currentPath?: string;
  openAll: boolean;
}

function Branch({ node, depth, owner, repo, slug, currentPath, openAll }: BranchProps) {
  return (
    <ul
      className={cn(
        "flex list-none flex-col gap-px",
        // The indent is a rule the eye can follow, not just whitespace: at
        // three levels deep a tree indented with margin alone stops reading as
        // nesting and starts reading as a ragged left edge.
        depth > 0 && "border-rule/70 ms-[0.6rem] border-s ps-2",
      )}
    >
      {node.children.map((child) => (
        <li key={child.path}>
          <details
            className="group"
            // `open` is a *default* here, not a controlled value: React does
            // not re-render this, so the reader's own toggling wins from the
            // first click onwards.
            open={openAll || contains(child.path, currentPath)}
          >
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center gap-1.5 rounded-sm px-1 py-1",
                "text-ink-strong hover:bg-paper-raised focus-visible:outline-ring",
                "focus-visible:outline-2 focus-visible:outline-offset-1",
                "[&::-webkit-details-marker]:hidden",
              )}
            >
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="text-ink-muted size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
                strokeWidth={2}
                aria-hidden="true"
              />
              <HugeiconsIcon
                icon={Folder01Icon}
                className="text-ink-muted size-3.5 shrink-0"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span className="truncate font-medium">{child.name}</span>
              <span className="text-ink-muted ms-auto shrink-0 text-[0.6875rem] tabular-nums">
                {child.total}
                <span className="sr-only"> {plural(child.total, "file")}</span>
              </span>
            </summary>

            <Branch
              node={child}
              depth={depth + 1}
              owner={owner}
              repo={repo}
              slug={slug}
              currentPath={currentPath}
              openAll={openAll}
            />
          </details>
        </li>
      ))}

      {node.files.map((file) => {
        const name = file.relPath.slice(file.relPath.lastIndexOf("/") + 1);
        const current = file.relPath === currentPath;
        return (
          <li key={file.relPath}>
            <Link
              href={resourcePath(owner, repo, slug, file.relPath)}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-sm px-1 py-1",
                "hover:bg-paper-raised focus-visible:outline-ring",
                "focus-visible:outline-2 focus-visible:outline-offset-1",
                current
                  ? "text-issue-accent bg-paper-raised font-medium"
                  : "text-ink hover:text-ink-strong",
              )}
            >
              <HugeiconsIcon
                icon={FILE_ICONS[file.render]}
                className={cn(
                  "size-3.5 shrink-0",
                  current ? "text-issue-accent" : "text-ink-muted",
                )}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span className="truncate">{name}</span>
              {/*
               * The type and size are context, not content, so they are
               * `aria-hidden`: a screen reader working down a list of 82 links
               * does not want "YAML, 4 KB" after every one of them, and the
               * link's own text is already the filename it needs. A reader who
               * wants the detail has it on the file's own page.
               */}
              <span
                aria-hidden="true"
                className="text-ink-muted ms-auto shrink-0 text-[0.6875rem] tabular-nums"
              >
                {file.render === "binary" ? file.label : formatBytes(file.size)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
