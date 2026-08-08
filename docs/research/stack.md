# GitHub Skills Book — Stack Research

**Date:** 2026-08-08 · **Author:** research agent
**Verified against:** `next@16.3.0` installed at `/Users/kyleledbetter/Sites/githubskills/node_modules/next`, the version-matched docs bundled at `node_modules/next/dist/docs/` (444 files), `nextjs.org/blog/next-16`, `nextjs.org/blog/next-16-3`, the live npm registry, and the actual component source pulled from `https://www.tripwire.sh/r/*.json`.

Everything below marked **[V]** was verified by reading real files/responses. **[I]** = inferred/judgement call.

> **Critical discovery [V]:** Next.js 16.3 ships **version-matched documentation inside `node_modules/next/dist/docs/`**, and `node_modules/next/AGENTS.md` says:
> *"This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `dist/docs/` before writing any code."*
> **Treat `node_modules/next/dist/docs/` as the single source of truth for this repo.** It beats the public website (which can be ahead of our pinned version) and beats any model's training data.

---

## 0. Current project state [V]

| Thing | Value |
|---|---|
| `next` | `16.3.0` (MIT) |
| `react` / `react-dom` | `19.2.8` |
| Bundler | Turbopack (default in 16; no config) |
| `next.config.ts` | **empty** — no `cacheComponents`, no `partialPrefetching` |
| `src/app/` | `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico` only |
| Routes | **`/[owner]/[repo]` does not exist yet** |
| shadcn | style `base-luma`, `rsc: true`, baseColor `stone`, `iconLibrary: hugeicons`, `menuColor: default-translucent` |
| UI primitives | `@base-ui/react@^1.7.0` (**not** Radix) |
| Package manager | pnpm 10.33.0 |
| tsconfig | `target: ES2017`, `strict: true`, includes `.next/types/**/*.ts` **and** `.next/dev/types/**/*.ts` |

`src/app/layout.tsx` already uses `LayoutProps<"/">` — confirming the generated-types system is active.

---

# 1. Next.js 16.3

## 1.1 Async `params` / `searchParams` and the generated `PageProps` / `LayoutProps` types

### The rule [V]

Synchronous access to `params`, `searchParams`, `cookies()`, `headers()`, and `draftMode()` was **removed** in Next 16 (not deprecated — removed). All are Promises / async.

### The generated types [V]

`PageProps<'/route'>` and `LayoutProps<'/route'>` are **globally-available generated types**. They are not exported from `next` — they are emitted into `.next/types/**` and `.next/dev/types/**`, both of which are already in our `tsconfig.json` `include` array. They exist after the first `next dev` / `next build`.

The route string is the **literal app-router path**, including the bracket segments. For us that is `'/[owner]/[repo]'`.

```tsx
// src/app/[owner]/[repo]/page.tsx
export default async function RepoPage(props: PageProps<'/[owner]/[repo]'>) {
  const { owner, repo } = await props.params;
  const { tab } = await props.searchParams; // also a Promise
  return <SkillsBook owner={owner} repo={repo} tab={tab} />;
}
```

To type a helper that only takes params, use `Pick` — this is the exact idiom used in the official bundled docs [V]:

```tsx
async function RepoHeader({ params }: Pick<PageProps<'/[owner]/[repo]'>, 'params'>) {
  const { owner, repo } = await params;
  // ...
}
```

### The pattern that actually matters for us [V]

Under Cache Components (§1.2), **do not `await params` at the top of the page component.** Awaiting params above a Suspense boundary ties the route's prerendered App Shell to one specific URL, which destroys the instant-navigation shell for every other `/[owner]/[repo]`. Pass the *promise* down into a `<Suspense>` boundary and await it inside.

From `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md` [V]:

> "To produce the App Shell, pass the `params` promise into a `<Suspense>` boundary instead of awaiting it at the top of the component, so unknown params can still prerender."

And from `incremental-static-regeneration-cache-components.md` [V]:

> "Keep the read inside the boundary **even for the categories `generateStaticParams` covers**. A statically known param still belongs to one URL, so awaiting it above the Suspense boundary would tie this layout's App Shell to that URL."

**This is the single most important architectural rule for this app.** Our page is `/[owner]/[repo]` — every URL is a dynamic param. If we await params at the top, we get zero shell reuse across millions of repos.

```tsx
// src/app/[owner]/[repo]/page.tsx  ✅ CORRECT SHAPE
import { Suspense } from 'react';
import { BookSkeleton } from '@/components/book-skeleton';

// NOT async — it never awaits anything.
export default function RepoPage(props: PageProps<'/[owner]/[repo]'>) {
  return (
    <article className="mx-auto max-w-prose">
      {/* This whole subtree is the reusable App Shell — no URL data. */}
      <Suspense fallback={<BookSkeleton />}>
        <RepoBook params={props.params} />
      </Suspense>
    </article>
  );
}

async function RepoBook({ params }: Pick<PageProps<'/[owner]/[repo]'>, 'params'>) {
  const { owner, repo } = await params;
  const book = await getSkillsBook(owner, repo); // 'use cache' inside
  return <BookReader book={book} />;
}
```

### Client hooks that suspend [V]

Under `cacheComponents`, these hooks **suspend** when the pathname depends on params not yet known, and **the build fails** if they are not inside a `<Suspense>`:

- `usePathname`, `useParams`, `useSelectedLayoutSegment`, `useSelectedLayoutSegments`
- `useSearchParams` **always** needs a boundary (search params are only known at request time)

This will bite us in a shared header/breadcrumb ("owner / repo" nav). Push the hook read down into the smallest leaf component and wrap that leaf in `<Suspense>`.

### Root params (new in 16.3) [V]

`next/root-params` lets any Server Component read params defined *above* the root layout without prop drilling. Confirmed present locally: `node_modules/next/root-params.js` and `root-params.d.ts` exist [V].

```tsx
import { lang } from 'next/root-params';
const language = await lang();
```

Only useful if we add an `app/[lang]/` segment above the root layout. **Not applicable to `/[owner]/[repo]`** — those are not root params, they're regular route params. Currently Server Components only (route handlers and Server Actions support is "planned"). Note: `unstable_rootParams()` was **removed** in 16.0 and this is its replacement [V].

---

## 1.2 Caching — the decision that shapes everything

### Verified API surface [V]

`node_modules/next/cache.d.ts` exports exactly:

```ts
export { unstable_cache } from 'next/dist/server/web/spec-extension/unstable-cache'
export { revalidatePath, revalidateTag, updateTag, refresh } from 'next/dist/server/web/spec-extension/revalidate'
export { unstable_noStore } from 'next/dist/server/web/spec-extension/unstable-no-store'
export { io } from 'next/dist/server/request/io'
export { cacheTag }           // ← STABLE, no unstable_ prefix
export function cacheLife(...) // ← STABLE, no unstable_ prefix
export const unstable_cacheLife: typeof cacheLife  // legacy aliases retained
export const unstable_cacheTag: typeof cacheTag
```

**`cacheTag` and `cacheLife` are stable names in 16.3.** The `unstable_*` aliases still exist but are legacy. Use the stable names.

### Built-in `cacheLife` profiles — exact values from the local `.d.ts` [V]

| Profile | `stale` (client) | `revalidate` (bg refresh) | `expire` |
|---|---|---|---|
| `seconds` | 30s | 1s | 1 min |
| `minutes` | 5 min | 1 min | 1 hour |
| `hours` | 5 min | 1 hour | 1 day |
| `days` | 5 min | 1 day | 1 week |
| `weeks` | 5 min | 1 week | 30 days |
| `max` | 5 min | 30 days | never |
| `default` | 5 min | 15 min | never |

Custom inline shape: `cacheLife({ stale?: number, revalidate?: number, expire?: number })` (all seconds).

### Is `unstable_cache` still the right call? **No.** [V]

`migrating-to-cache-components.md` line 373:

> `## unstable_cache` — **Replace with `use cache`.** "`unstable_cache` is replaced by the `use cache` directive."

It still exists and still works (it's a "separate layer" that "keeps working" during migration), but it is explicitly the legacy path. **Do not write new `unstable_cache` code.**

### What `cacheComponents: true` changes [V]

From `node_modules/next/dist/docs/.../cacheComponents` + the migration guide:

1. **Everything is dynamic by default.** No implicit caching anywhere. You opt in with `use cache`.
2. **PPR is the default rendering model.** `experimental.ppr` and `export const experimental_ppr` are **removed**. A static App Shell is prerendered and served instantly; dynamic content streams in.
3. **Requires the Node.js runtime.** `runtime = 'edge'` is deprecated and incompatible.
4. **Route segment configs are replaced:**
   - `export const revalidate = 3600` → `cacheLife('hours')` inside a `use cache` scope
   - `export const fetchCache = 'force-cache'` → unnecessary; all fetches inside a `use cache` scope are cached automatically
   - `fetch(url, { cache: 'force-cache', next: { revalidate, tags } })` → wrap the fetch in a `use cache` function; `revalidate`→`cacheLife`, `tags`→`cacheTag`
   - `unstable_noStore` → not needed (dynamic is the default)
5. **Navigation uses React `<Activity>`** — the previous route is hidden (`display: none`) rather than unmounted, so component state survives back/forward navigation. Effects are cleaned up on hide and recreated on show. *(Watch for this with our reader's scroll position and font-picker state — see §1.7.)*

### `use cache` cache keys [V]

The key is derived from: **Build ID** (or `deploymentId`) + **Function ID** (hash of location+signature) + **serialized arguments** + HMR hash (dev only). Variables captured from outer scope are automatically bound as arguments and become part of the key.

**Serialization limits [V]:** arguments may be primitives, plain objects, arrays, `Date`, `Map`, `Set`, TypedArrays, ArrayBuffers, and React elements (pass-through only). **Not allowed:** class instances, functions, symbols, WeakMap/WeakSet, **`URL` instances**. Return values may additionally include JSX.

> Practical trap for us: never pass a `URL` object or an Octokit client instance into a `use cache` function. Pass `owner: string, repo: string`.

### Persistence caveat [V]

> "`use cache` defaults to **in-memory** storage, so its entries are discarded when the serverless instance is destroyed and are scoped to a single deployment. Use `'use cache: remote'` or a cache handler for storage that survives instance teardown. Even with durable storage, expect cached values to recompute after a new deployment."

This matters: GitHub's API rate limit is 5,000 req/hr authenticated. In-memory caching on ephemeral serverless instances will not protect us at scale. **Plan for `'use cache: remote'` or an explicit `cacheHandlers` config in production**, or put a KV/Redis layer under the fetch.

### Recommended config

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true, // required alongside cacheComponents for the ISR shell upgrade
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' },
      { protocol: 'https', hostname: 'github.com' },
      { protocol: 'https', hostname: 'user-images.githubusercontent.com' },
      { protocol: 'https', hostname: 'camo.githubusercontent.com' },
    ],
  },
  cacheLife: {
    // custom profile for GitHub repo metadata
    repo: { stale: 300, revalidate: 3600, expire: 86_400 },
  },
};

export default nextConfig;
```

### Our data layer

```ts
// src/lib/github.ts
import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';

export type RepoMeta = {
  owner: string; repo: string; description: string | null;
  stars: number; defaultBranch: string; ownerAvatar: string;
  license: string | null; topics: string[];
};

/** Cached repo metadata. Args are primitives → clean cache key. */
export async function getRepoMeta(owner: string, repo: string): Promise<RepoMeta> {
  'use cache';
  cacheLife('repo');                       // custom profile from next.config.ts
  cacheTag(`repo:${owner}/${repo}`);       // for on-demand invalidation

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: ghHeaders(),
  });
  if (res.status === 404) return notFoundSentinel(owner, repo);
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${owner}/${repo}`);
  const j = await res.json();

  return {
    owner, repo,
    description: j.description,
    stars: j.stargazers_count,
    defaultBranch: j.default_branch,
    ownerAvatar: j.owner.avatar_url,
    license: j.license?.spdx_id ?? null,
    topics: j.topics ?? [],
  };
}

/** The full skills tree — expensive, cache hard. */
export async function getSkillsBook(owner: string, repo: string) {
  'use cache';
  cacheLife('hours');
  cacheTag(`repo:${owner}/${repo}`);
  cacheTag('skills-book');

  const meta = await getRepoMeta(owner, repo);
  const tree = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${meta.defaultBranch}?recursive=1`,
    { headers: ghHeaders() },
  ).then((r) => r.json());

  const skillFiles = (tree.tree ?? []).filter(
    (n: { path: string; type: string }) =>
      n.type === 'blob' && /(^|\/)SKILL\.md$/i.test(n.path),
  );
  // ... fetch + renderMarkdown each (see §2)
  return { meta, skills: /* ... */ [] };
}

function ghHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  };
}
```

> **Note on `cookies()`/`headers()` inside `use cache` [V]:** not allowed. "Read them outside cached scopes and pass values as arguments." Our `GITHUB_TOKEN` comes from `process.env`, which is fine (build/runtime env, not request data).

### On-demand revalidation [V]

`revalidateTag()` **changed signature in Next 16** — the single-argument form is deprecated:

```ts
// src/app/api/revalidate/route.ts
import { revalidateTag } from 'next/cache';
import { after } from 'next/server';

export async function POST(request: Request) {
  const secret = request.headers.get('x-webhook-secret');
  if (secret !== process.env.REVALIDATE_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { owner, repo } = await request.json();

  // ✅ Next 16: second arg is a cacheLife profile → enables stale-while-revalidate
  revalidateTag(`repo:${owner}/${repo}`, 'max');

  return Response.json({ revalidated: true, now: Date.now() });
}
```

Three APIs, three jobs:

| API | Where | Semantics |
|---|---|---|
| `revalidateTag(tag, profile)` | anywhere | SWR — serve stale, refresh in background. **Profile arg now required**; `'max'` recommended. |
| `updateTag(tag)` | **Server Actions only** | Read-your-writes — expire *and* immediately re-read in the same request. |
| `refresh()` | **Server Actions only** | Refresh **uncached** data only; does not touch the cache. |

For a "refresh this repo now" button in the reader UI, use `updateTag` in a Server Action so the user sees their refresh land immediately.

---

## 1.3 `generateStaticParams` + ISR for `/[owner]/[repo]`

### Two behaviour changes under `cacheComponents` [V]

**(a) `generateStaticParams` must return at least one param.** Returning `[]` now **errors** (`empty-generate-static-params`). Next needs at least one param to prerender the route and validate that it produces a non-empty App Shell.

**(b) `dynamicParams: true` (the default) no longer blocks the first visit.** Previously an unlisted param blocked the response while rendering. Now Next serves the App Shell instantly, then upgrades it in the background once the params are known. Every later visitor gets the fully-cached page. `dynamicParams: false` is unchanged (unlisted → 404).

This is *exactly* the model we want: we cannot enumerate every GitHub repo, but we want instant first paint for all of them.

```tsx
// src/app/[owner]/[repo]/page.tsx
import { Suspense } from 'react';

// Prerender a curated set of showcase repos; everything else gets the
// App Shell on first visit, then upgrades in the background.
// MUST be non-empty under cacheComponents.
export async function generateStaticParams() {
  return [
    { owner: 'anthropics', repo: 'skills' },
    { owner: 'obra',       repo: 'superpowers' },
  ];
}

export default function RepoPage(props: PageProps<'/[owner]/[repo]'>) {
  return (
    <Suspense fallback={<BookSkeleton />}>
      <RepoBook params={props.params} />
    </Suspense>
  );
}

async function RepoBook({ params }: Pick<PageProps<'/[owner]/[repo]'>, 'params'>) {
  const { owner, repo } = await params;
  const book = await getSkillsBook(owner, repo);
  if (!book) notFound();
  return <BookReader book={book} />;
}
```

> **Design consequence [I]:** `BookSkeleton` is not a throwaway spinner — it is the **App Shell that every uncached repo in the world renders first**. It is the most-viewed component in the product. Invest in it: chrome, nav, book-spine, plausible-looking skeleton text blocks. It should look like the book is already there, just not yet inked.

---

## 1.4 Metadata API

### `generateMetadata` under Cache Components [V]

`generateMetadata` follows the same rules as components. If it reads runtime data (`cookies()`, `headers()`, `params`, `searchParams`) or fetches uncached data while the page is otherwise prerenderable, **Next raises an error** so the choice is explicit. Since our metadata depends on external-but-not-runtime data, add `'use cache'`:

```tsx
// src/app/[owner]/[repo]/page.tsx
import type { Metadata } from 'next';

export async function generateMetadata(
  props: PageProps<'/[owner]/[repo]'>,
): Promise<Metadata> {
  'use cache';
  const { owner, repo } = await props.params;
  const meta = await getRepoMeta(owner, repo);

  const title = `${owner}/${repo} — Skills Book`;
  const description =
    meta.description ?? `A reading experience for the skills in ${owner}/${repo}.`;

  return {
    title,
    description,
    alternates: { canonical: `/${owner}/${repo}` },
    openGraph: {
      title, description,
      url: `/${owner}/${repo}`,
      siteName: 'GitHub Skills Book',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}
```

> Note `'use cache'` sits **inside** `generateMetadata`, and `await props.params` is fine here — `generateMetadata` cannot be wrapped in Suspense, so the shell rules don't apply the same way. The params become part of the cache key.

Set the metadata base once in the root layout so relative OG URLs resolve:

```tsx
// src/app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'GitHub Skills Book',
    template: '%s · GitHub Skills Book',
  },
  description: 'Turn any GitHub repo of agent skills into a beautiful reading experience.',
};
```

### `opengraph-image.tsx` with `ImageResponse` [V]

`next/og` is present locally (`node_modules/next/og.js`, `og.d.ts`) [V]. **Breaking change in 16 [V]:** metadata image routes now receive **async `params`**, and `id` from `generateImageMetadata` is a `Promise<string>`.

```tsx
// src/app/[owner]/[repo]/opengraph-image.tsx
import { ImageResponse } from 'next/og';
import { getRepoMeta } from '@/lib/github';

export const alt = 'GitHub Skills Book';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>; // ← async in Next 16
}) {
  const { owner, repo } = await params;
  const meta = await getRepoMeta(owner, repo);

  // Fonts must be fetched as ArrayBuffer — next/font objects do NOT work here.
  const inter = await fetch(
    new URL('../../../../public/fonts/Inter-SemiBold.ttf', import.meta.url),
  ).then((r) => r.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%', width: '100%', display: 'flex',
          flexDirection: 'column', justifyContent: 'space-between',
          background: '#0c0a09', color: '#fafaf9', padding: 72,
          fontFamily: 'Inter',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={meta.ownerAvatar}
            width={72} height={72}
            style={{ borderRadius: 12 }}
            alt=""
          />
          <div style={{ fontSize: 32, opacity: 0.65 }}>{owner}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 84, lineHeight: 1.05 }}>{repo}</div>
          <div style={{ fontSize: 32, opacity: 0.7, maxWidth: 900 }}>
            {(meta.description ?? '').slice(0, 140)}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, opacity: 0.5 }}>
          ★ {meta.stars.toLocaleString()} · Skills Book
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Inter', data: inter, style: 'normal', weight: 600 }],
    },
  );
}
```

**`ImageResponse` gotchas [I]:** it uses Satori, which supports only a flexbox subset of CSS. Every element with more than one child needs an explicit `display: 'flex'`. No CSS Grid. No external stylesheets. No `next/font` objects — fonts must be raw `ArrayBuffer`s. Ship the `.ttf`/`.otf` in `public/fonts/`.

### `sitemap.ts`, `robots.ts`, `manifest.ts` [V]

```ts
// src/app/sitemap.ts
import type { MetadataRoute } from 'next';
import { getFeaturedRepos } from '@/lib/featured';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const repos = await getFeaturedRepos();
  return [
    { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    ...repos.map((r) => ({
      url: `${base}/${r.owner}/${r.repo}`,
      lastModified: r.pushedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
```

```ts
// src/app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/'] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
```

```ts
// src/app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GitHub Skills Book',
    short_name: 'Skills Book',
    description: 'Read any GitHub repo of agent skills as a book.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c0a09',
    theme_color: '#0c0a09',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
```

> **Sitemap + `cacheComponents` caveat [I]:** `sitemap.ts` runs at build time when statically generated. If `getFeaturedRepos()` hits the network, wrap it in `'use cache'` with `cacheLife('days')` to avoid hammering the API on every rebuild.

---

## 1.5 Route handlers, streaming, Suspense, and the file conventions

### `loading.tsx` is being superseded [V]

Next 16.3's headline change is **Partial Prefetching**: Next can now extract a reusable loading shell from *any* route's UI via inline `<Suspense>` boundaries, not just from `loading.tsx`. From the release notes [V]:

> "Prior to 16.3, prefetching in Next.js was limiting: you could either define a reusable loading shell with `loading.tsx`, or opt-in to aggressive full-page prefetching with `<Link prefetch={true}>`."

**Recommendation [I]:** prefer **inline `<Suspense>` boundaries co-located with the components that fetch**, over a monolithic `loading.tsx`. It gives finer-grained shells and is the direction the framework is heading. Keep a `loading.tsx` only as a coarse fallback if useful.

### `error.tsx` → prefer `catchError` (new in 16.3) [V]

The classic `error.tsx` boundary has two documented problems that 16.3 fixes: it interfered with `notFound()`/`redirect()`, and it could only reset client state — there was no way to retry a failed Server Component.

```tsx
// src/app/[owner]/[repo]/error-boundary.tsx
'use client';
import { catchError, type ErrorInfo } from 'next/error';

function BookError(props: { title: string }, { error, retry }: ErrorInfo) {
  return (
    <div className="mx-auto max-w-prose py-24 text-center">
      <h2 className="text-2xl font-medium">{props.title}</h2>
      <p className="mt-2 text-muted-foreground">{error.message}</p>
      <button
        onClick={() => retry()}
        className="mt-6 rounded-md border px-4 py-2"
      >
        Try again
      </button>
    </div>
  );
}

export default catchError(BookError);
```

`retry()` refetches the boundary's children **including re-rendering Server Components** — exactly right for a transient GitHub API failure. Verified: `node_modules/next/error.js` and `error.react-server.js` exist locally [V].

### `not-found.tsx`

```tsx
// src/app/[owner]/[repo]/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-prose py-24 text-center">
      <h2 className="text-2xl font-medium">No skills book here</h2>
      <p className="mt-2 text-muted-foreground">
        We couldn&apos;t find that repository, or it has no <code>SKILL.md</code> files.
      </p>
      <Link href="/" className="mt-6 inline-block underline">
        Browse featured books
      </Link>
    </div>
  );
}
```

### Route handlers

```ts
// src/app/[owner]/[repo]/raw/route.ts
export async function GET(
  request: Request,
  ctx: RouteContext<'/[owner]/[repo]/raw'>,
) {
  const { owner, repo } = await ctx.params; // async
  const book = await getSkillsBook(owner, repo);
  return Response.json(book, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
```

> `RouteContext<'/route'>` is the route-handler analogue of `PageProps`/`LayoutProps`, generated into `.next/types` [I — inferred from the same generated-types system; verify after first `next dev`].

### Parallel routes gotcha [V]

**All parallel route slots now require explicit `default.js` files; builds fail without them.** If we add an `@modal` slot for a skill preview, we must ship `default.tsx` returning `null`.

---

## 1.6 `next/font` with 10+ user-selectable reader fonts

This is the most nuanced question in the brief, and the naive answer is wrong.

### What the docs actually say [V]

From `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`:

- Line 186: **"`preload` … The default is `true`."**
- Lines 1046–1050: **"When a font function is called on a page of your site, it is not globally available and preloaded on all routes. Rather, the font is only preloaded on the related routes based on the type of file where it is used… If it's the root layout, it is preloaded on all routes."**
- Line 468: "create a utility function that exports a font, imports it, and applies its `className` where needed. **This ensures the font is preloaded only when it's rendered.**"
- Line 148: "Fonts specified via `subsets` will have a `link preload` tag injected into the head when `preload` is true."

### The trap [I]

If we declare 10+ fonts in `src/app/layout.tsx` (or in any module the root layout imports and *renders*), Next injects **10+ `<link rel="preload">` tags into `<head>` on every single page**. That is 10+ render-blocking-ish font downloads (~15–40 KB each for a Latin variable subset) = **200–400 KB of fonts the user never sees**, competing for bandwidth with the actual content. It would destroy LCP.

Equally, `preload: false` alone is not enough if we still apply all 10 `.variable` classNames to `<html>` — the `@font-face` rules ship in CSS and browsers fetch fonts lazily on first *use*, so unused ones stay unfetched. The real cost of the naive approach is the **preload tags**, not the `@font-face` declarations.

### Recommended strategy: self-hosted variable fonts + `preload:false` + CSS-variable swap

**Three rules:**

1. **Variable fonts only.** One file per family covers the entire weight axis. A static family needs 4–8 files; ten static families is 40–80 files. Non-negotiable for a 10+ font picker.
2. **Exactly one preloaded font** — the default reader face — declared in the root layout with `preload: true`.
3. **Every other reader font**: `preload: false`, `display: 'swap'`, exposed as a CSS variable. The browser fetches it lazily the first time the user actually selects it.

```ts
// src/lib/fonts.ts
import {
  Inter, Newsreader, Source_Serif_4, Literata, Lora, Fraunces,
  IBM_Plex_Serif, Bitter, Spectral, Work_Sans, JetBrains_Mono,
} from 'next/font/google';

/** The one font we pay full preload cost for — the default reading face. */
export const defaultReader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-reader-default',
  preload: true, // the ONLY preload:true reader font
});

/** UI chrome font — also preloaded, used on every page. */
export const ui = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ui',
  preload: true,
});

/** Monospace for code blocks — preloaded, appears in nearly every skill. */
export const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  preload: true,
});

/**
 * Opt-in reader faces. preload:false → no <link rel=preload>; the @font-face
 * rule ships in CSS and the browser fetches the file only when a rendered
 * element actually resolves to it (i.e. when the user picks it).
 */
const opt = { subsets: ['latin'] as const, display: 'swap' as const, preload: false };

export const sourceSerif  = Source_Serif_4({ ...opt, variable: '--font-source-serif' });
export const literata     = Literata({      ...opt, variable: '--font-literata' });
export const lora         = Lora({          ...opt, variable: '--font-lora' });
export const fraunces     = Fraunces({      ...opt, variable: '--font-fraunces' });
export const plexSerif    = IBM_Plex_Serif({ ...opt, weight: ['400','500','600'], variable: '--font-plex-serif' });
export const bitter       = Bitter({        ...opt, variable: '--font-bitter' });
export const spectral     = Spectral({      ...opt, weight: ['400','500','600'], variable: '--font-spectral' });
export const workSans     = Work_Sans({     ...opt, variable: '--font-work-sans' });

/** Everything that must be on <html> for the CSS variables to exist. */
export const allFontVars = [
  defaultReader, ui, mono,
  sourceSerif, literata, lora, fraunces, plexSerif, bitter, spectral, workSans,
].map((f) => f.variable).join(' ');

/** The picker's public catalogue. `token` is the CSS var name. */
export const READER_FONTS = [
  { id: 'newsreader',   label: 'Newsreader',    token: 'var(--font-reader-default)', kind: 'serif' },
  { id: 'source-serif', label: 'Source Serif',  token: 'var(--font-source-serif)',   kind: 'serif' },
  { id: 'literata',     label: 'Literata',      token: 'var(--font-literata)',       kind: 'serif' },
  { id: 'lora',         label: 'Lora',          token: 'var(--font-lora)',           kind: 'serif' },
  { id: 'fraunces',     label: 'Fraunces',      token: 'var(--font-fraunces)',       kind: 'serif' },
  { id: 'plex-serif',   label: 'IBM Plex Serif',token: 'var(--font-plex-serif)',     kind: 'serif' },
  { id: 'bitter',       label: 'Bitter',        token: 'var(--font-bitter)',         kind: 'slab'  },
  { id: 'spectral',     label: 'Spectral',      token: 'var(--font-spectral)',       kind: 'serif' },
  { id: 'inter',        label: 'Inter',         token: 'var(--font-ui)',             kind: 'sans'  },
  { id: 'work-sans',    label: 'Work Sans',     token: 'var(--font-work-sans)',      kind: 'sans'  },
  { id: 'mono',         label: 'JetBrains Mono',token: 'var(--font-mono)',           kind: 'mono'  },
] as const;

export type ReaderFontId = (typeof READER_FONTS)[number]['id'];
```

```tsx
// src/app/layout.tsx
import { allFontVars } from '@/lib/fonts';
import './globals.css';

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${allFontVars} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-ui)]">
        {children}
      </body>
    </html>
  );
}
```

Then the reader surface reads one variable, which the picker rewrites:

```css
/* src/app/globals.css */
@theme inline {
  --font-reader: var(--font-reader-default);
}

.reader-prose {
  font-family: var(--reader-face, var(--font-reader-default));
  font-size: var(--reader-size, 1.125rem);
  line-height: var(--reader-leading, 1.75);
  max-width: var(--reader-measure, 68ch);
}
```

```tsx
// src/components/reader/font-picker.tsx
'use client';
import { useEffect, useState } from 'react';
import { READER_FONTS, type ReaderFontId } from '@/lib/fonts';

const KEY = 'skillsbook:font';

export function FontPicker() {
  const [id, setId] = useState<ReaderFontId>('newsreader');

  useEffect(() => {
    const saved = localStorage.getItem(KEY) as ReaderFontId | null;
    if (saved) setId(saved);
  }, []);

  useEffect(() => {
    const font = READER_FONTS.find((f) => f.id === id);
    if (!font) return;
    // One property write swaps the face; the browser fetches the file
    // on demand the first time this face is actually used.
    document.documentElement.style.setProperty('--reader-face', font.token);
    localStorage.setItem(KEY, id);
  }, [id]);

  return (
    <fieldset>
      <legend className="sr-only">Reading font</legend>
      {READER_FONTS.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={id === f.id}
          onClick={() => setId(f.id)}
          style={{ fontFamily: f.token }} /* previews render in their own face */
        >
          {f.label}
        </button>
      ))}
    </fieldset>
  );
}
```

> **Nice property [I]:** rendering each picker item *in its own typeface* means opening the picker is what triggers the lazy fetch — by the time the user clicks, the font is usually already there. That is the right moment to pay the cost.

### Avoiding the FOUC on reload [I]

Because the choice lives in `localStorage`, the first paint uses the default face and then swaps. Fix it the same way theme switchers do — a tiny blocking inline script in the root layout, before paint:

```tsx
<head>
  <script
    dangerouslySetInnerHTML={{
      __html: `try{var f=localStorage.getItem('skillsbook:font');var m={newsreader:'--font-reader-default','source-serif':'--font-source-serif',literata:'--font-literata',lora:'--font-lora',fraunces:'--font-fraunces','plex-serif':'--font-plex-serif',bitter:'--font-bitter',spectral:'--font-spectral',inter:'--font-ui','work-sans':'--font-work-sans',mono:'--font-mono'};if(f&&m[f])document.documentElement.style.setProperty('--reader-face','var('+m[f]+')')}catch(e){}`,
    }}
  />
</head>
```

Next has a dedicated guide for this: `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md` [V].

### Verdict on fontsource [I]

**Not needed, and a downgrade.** `next/font/google` already: self-hosts the files (zero requests to Google, a genuine privacy win), auto-subsets, generates a size-adjusted local fallback (`adjustFontFallback: true`) that near-eliminates CLS, and hashes filenames for immutable caching. Fontsource gives us npm-versioned files but forfeits the automatic fallback-metric generation, which is the single biggest CLS lever for a *reading* app. Stay on `next/font/google`; reach for `next/font/local` only for a licensed display face we ship ourselves.

### Summary table

| Approach | Verdict |
|---|---|
| All 10+ fonts in root layout, default `preload:true` | ❌ 10+ preload tags on every page; 200–400 KB wasted; kills LCP |
| Load on demand by injecting `@font-face` at runtime | ❌ Reimplements what `next/font` does, loses fallback metrics, FOUT |
| Fontsource + manual `@font-face` | ⚠️ Works, but loses auto fallback-metric generation → worse CLS |
| **Variable fonts, 3 preloaded, rest `preload:false` + CSS-var swap** | ✅ **Recommended** |

---

## 1.7 Next 16 gotchas we must respect

Every row below is verified from the Next 16 release notes and/or the bundled docs [V].

| Gotcha | Impact on us |
|---|---|
| **`middleware.ts` → `proxy.ts`** | `middleware.ts` is deprecated (still works for Edge). If we add rate limiting or auth, create `proxy.ts` exporting `proxy`, running on **Node.js runtime**. |
| **`next lint` removed** | `next build` no longer lints. Our `package.json` already correctly uses `"lint": "eslint"`. ✅ |
| **`revalidateTag(tag)` single-arg deprecated** | Always pass a profile: `revalidateTag(tag, 'max')`. |
| **`images.qualities` default `[75]`** | `quality` is coerced to the nearest allowed value. Add other values to `images.qualities` if we need them. |
| **`images.minimumCacheTTL` 60s → 4h** | Good for us — GitHub avatars rarely change. |
| **`images.domains` deprecated** | Use `remotePatterns` (see config above). |
| **`images.maximumRedirects` default 3** | `camo.githubusercontent.com` proxies can redirect; watch for broken README images. |
| **`next/image` local `src` with query strings** | Now needs `images.localPatterns`. |
| **No automatic `scroll-behavior: smooth`** | Add `data-scroll-behavior="smooth"` to `<html>` to opt back in — **we want this** for TOC anchor jumps. |
| **Parallel routes need explicit `default.js`** | Builds fail without them. |
| **`serverRuntimeConfig`/`publicRuntimeConfig` removed** | Use `.env`. |
| **Node 20.9+, TypeScript 5.1+** | Our tsconfig targets ES2017 — fine, but consider bumping to ES2022. |
| **`<Activity>` navigation under `cacheComponents`** | Previous routes are **hidden, not unmounted**. Reader scroll position, open dropdowns, and the font picker keep state across back/forward. Mostly a feature, but test dialogs/popovers — see `preserving-ui-state.md` [V]. |
| **TypeScript 7 support** | `pnpm add -D typescript@^7` for ~10× faster `next build` type checking. Opt-in, low risk. [V] |
| **`import.meta.glob`** | Turbopack now supports Vite-style glob imports — handy for bundling local demo/fixture skill markdown with HMR. [V] |

### Turbopack build

Turbopack is the default; **no config needed**. 16.3 enables disk caching for `next build` **by default** (up to 5.5× faster repeat builds) and memory eviction for `next dev` (up to 90% less RAM) [V]. Escape hatch if a plugin breaks: `next build --webpack`.

For CI, persist the Turbopack cache directory between runs — see `node_modules/next/dist/docs/01-app/02-guides/ci-build-caching.md` [V].

---

# 2. Markdown pipeline

## 2.1 Threat model

We render `SKILL.md` from **arbitrary, untrusted third-party repositories**. Assume every file is hostile:

- `<script>`, `<iframe>`, `<object>`, event handlers (`onerror=`, `onload=`)
- `javascript:` / `data:text/html` URIs in links and images
- `<style>` blocks and inline `style` used for clickjacking or overlay phishing
- `id`/`name` DOM clobbering
- SVG with embedded scripts
- Enormous files / pathological nesting → CPU DoS

## 2.2 Comparison of the options

| Library | License | Verdict |
|---|---|---|
| **`react-markdown@10.1.0`** | MIT | Safe by default (no `dangerouslySetInnerHTML`, no raw HTML unless you add `rehype-raw`). But it's a *renderer*, not a *pipeline* — awkward to also extract TOC, frontmatter, and reading time in one pass. **Good fallback; not our pick.** |
| **`next-mdx-remote@6.0.0`** | ⚠️ **MPL-2.0** | **Rejected on two grounds.** (1) Licence: brief requires MIT/Apache; MPL-2.0 is weak-copyleft. (2) **Security: MDX compiles markdown into executable JavaScript.** Running MDX from untrusted repos is arbitrary code execution on our server. Categorically disqualified. |
| **`@mdx-js/mdx@3.1.1`** | MIT | Same fatal security issue — MDX is code. Fine for *our own* content, never for third-party. |
| **`marked@18.0.9`** | MIT | Fast, but emits an HTML **string** → forces `dangerouslySetInnerHTML`, no AST for TOC/link-rewriting, and sanitization becomes a separate bolt-on. Wrong shape. |
| **`@markdoc/markdoc@0.5.9`** | MIT | Excellent sandboxing model, but it's a *different* authoring language with its own tag syntax. `SKILL.md` files are plain CommonMark/GFM. Wrong tool. |
| **`streamdown@2.5.0`** | Apache-2.0 | Built for streaming **LLM output** token-by-token. Our markdown is complete when we render it. Solves a problem we don't have. |
| **`unified` + remark/rehype (bespoke)** | MIT | ✅ **Recommended.** Full AST control in one pass: frontmatter, sanitize, slug, highlight, link-rewrite, TOC, reading time. Runs server-side in an RSC with **zero client JS**. |

## 2.3 Recommended packages — exact versions and licences

All verified live against the npm registry on 2026-08-08 [V].

```bash
pnpm add unified@11.0.5 \
         remark-parse@11.0.0 \
         remark-gfm@4.0.1 \
         remark-rehype@11.1.2 \
         rehype-sanitize@6.0.0 \
         rehype-slug@6.0.0 \
         rehype-autolink-headings@7.1.0 \
         rehype-external-links@3.0.0 \
         @shikijs/rehype@4.4.2 \
         shiki@4.4.2 \
         hast-util-to-jsx-runtime@2.3.6 \
         hast-util-to-string@3.0.1 \
         hast-util-heading-rank@3.0.0 \
         unist-util-visit@5.1.0 \
         github-slugger@2.0.0 \
         gray-matter@4.0.3 \
         reading-time@1.5.0

pnpm add -D @types/hast@3.0.5 @types/mdast@4.0.4
```

| Package | Version | Licence | Role |
|---|---|---|---|
| `unified` | 11.0.5 | MIT | pipeline engine |
| `remark-parse` | 11.0.0 | MIT | md → mdast |
| `remark-gfm` | 4.0.1 | MIT | **tables**, strikethrough, task lists, autolinks, footnotes |
| `remark-rehype` | 11.1.2 | MIT | mdast → hast |
| `rehype-sanitize` | 6.0.0 | MIT | XSS scrubbing (wraps `hast-util-sanitize@5.0.2`, MIT) |
| `rehype-slug` | 6.0.0 | MIT | heading `id`s |
| `rehype-autolink-headings` | 7.1.0 | MIT | anchor links on headings |
| `rehype-external-links` | 3.0.0 | MIT | `target="_blank" rel="noopener noreferrer"` |
| `@shikijs/rehype` | 4.4.2 | MIT | Shiki as a rehype plugin |
| `shiki` | 4.4.2 | MIT | syntax highlighting (requires Node ≥ 20) |
| `hast-util-to-jsx-runtime` | 2.3.6 | MIT | hast → React elements (no `dangerouslySetInnerHTML`) |
| `hast-util-to-string` | 3.0.1 | MIT | heading text for TOC |
| `hast-util-heading-rank` | 3.0.0 | MIT | heading level detection |
| `unist-util-visit` | 5.1.0 | MIT | AST traversal |
| `github-slugger` | 2.0.0 | **ISC** | GitHub-identical slugs (ISC is MIT-equivalent, permissive) |
| `gray-matter` | 4.0.3 | MIT | YAML frontmatter extraction |
| `reading-time` | 1.5.0 | MIT | reading-time estimate |

**Every package is MIT or ISC. No copyleft.** `next-mdx-remote` (MPL-2.0) is the only rejected-on-licence candidate.

## 2.4 Two security decisions that matter more than the package list

### Decision 1: never enable `rehype-raw`

`remark-rehype` **drops raw HTML by default**. Do not pass `allowDangerousHtml: true` and do not add `rehype-raw`. Raw HTML in a third-party `SKILL.md` is dropped entirely.

This costs us a little fidelity (some READMEs use `<details>`, `<img align="right">`, `<picture>`). The safe way to buy that back is to **explicitly allow-list specific elements later via the sanitize schema**, not by turning raw HTML back on wholesale. Ship strict first.

### Decision 2: sanitize BEFORE highlighting — order is load-bearing

Verified from the real `hast-util-sanitize` default schema [V] (`https://raw.githubusercontent.com/syntax-tree/hast-util-sanitize/main/lib/schema.js`):

- `tagNames` has **no `span` styling allowance** and the global `'*'` attribute list contains **no `style` and no `className`**
- the only `className` allowances are narrow: `code: [['className', /^language-./]]`, `li: task-list-item`, `ol`/`ul`: `contains-task-list`, `section`: `footnotes`
- `protocols: { href: ['http','https','irc','ircs','mailto','xmpp'], src: ['http','https'], cite: [...], longDesc: [...] }`
- `clobber: ['ariaDescribedBy','ariaLabelledBy','id','name']` with `clobberPrefix: 'user-content-'`
- `strip: ['script']`

**Shiki emits `<span style="color:#...">` on every token.** If you sanitize *after* Shiki, the default schema strips every colour and you get monochrome code. The common "fix" people reach for — loosening the schema to allow `style` on `span` — reopens a real XSS/clickjacking surface on *user* content.

**Correct order:** `sanitize` → `rehype-slug` → `shiki`. Sanitize scrubs the untrusted content; Shiki then decorates code text (which is plain text, inherently safe) with markup **we** generate and therefore trust.

> ⚠️ Also note `clobberPrefix: 'user-content-'`: sanitize rewrites `id` attributes, so **`rehype-slug` must run after `rehype-sanitize`**, or every heading anchor ends up prefixed with `user-content-` and our TOC links break.

## 2.5 Shiki: the RSC bundle-size question is a non-issue

**Verified [V]:** `shiki@4.4.2` deps are `@shikijs/core`, `@shikijs/langs`, `@shikijs/types`, `@shikijs/themes`, `@shikijs/vscode-textmate`, `@shikijs/engine-oniguruma`, `@shikijs/engine-javascript`. `engines: { node: '>=20' }`.

Shiki's reputation for being "huge" (multi-MB of grammars and themes) is a **client-bundle** concern. We highlight **inside an RSC at cache-fill time**, so Shiki never enters the client bundle. The client receives only the resulting HTML/React tree. **Client cost: 0 KB.**

What *does* matter server-side is cold-start and memory. Mitigate with a **module-level singleton highlighter** loading only the languages we care about, plus lazy loading for the long tail.

### `shiki` vs `rehype-pretty-code`

| | Verdict |
|---|---|
| `rehype-pretty-code@0.14.5` (MIT) | Adds line numbers, line highlighting (`{1,3-5}`), word highlighting, title/caption parsing. Genuinely nice **but** it is a wrapper whose meta-string syntax is an authoring convention — third-party `SKILL.md` files won't use it, so we'd get ~none of the benefit while adding a dependency and a version-coupling risk against Shiki 4. |
| **`@shikijs/rehype@4.4.2`** (MIT) | ✅ **Recommended.** First-party, version-locked to `shiki@4.4.2`, minimal surface, exactly what we need. |

### Dual light/dark themes [V]

Verified from `shiki.style/guide/dual-themes`. Use the `themes: { light, dark }` option; Shiki emits the light colour as `color` and the dark colour as a `--shiki-dark` CSS variable, then CSS picks. `cssVariablePrefix` defaults to `--shiki-`.

Because we render dark mode via a class on `<html>` (shadcn convention) **and** should respect `prefers-color-scheme`, include both rules:

```css
/* src/app/globals.css */
.shiki, .shiki span {
  color: var(--shiki-light);
  background-color: var(--shiki-light-bg);
}

@media (prefers-color-scheme: dark) {
  .shiki, .shiki span {
    color: var(--shiki-dark) !important;
    background-color: var(--shiki-dark-bg) !important;
  }
}

html.dark .shiki, html.dark .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
}

/* light class must win back over the media query */
html.light .shiki, html.light .shiki span {
  color: var(--shiki-light) !important;
  background-color: var(--shiki-light-bg) !important;
}
```

Setting `defaultColor: false` (as below) makes Shiki emit **both** `--shiki-light` and `--shiki-dark` variables rather than baking one theme into `color`, which is what makes the four-way rule above work cleanly.

## 2.6 `renderMarkdown()` — full implementation

```ts
// src/lib/markdown/rewrite-urls.ts
import { visit } from 'unist-util-visit';
import type { Root, Element } from 'hast';

export type RepoRef = { owner: string; repo: string; ref: string; dir: string };

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/** Resolve a repo-relative path against the file's directory. */
function resolveRepoPath(dir: string, rel: string): string {
  const stack = dir ? dir.split('/').filter(Boolean) : [];
  for (const part of rel.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

/**
 * Rewrites relative <img src> to raw.githubusercontent.com and relative
 * <a href> to the GitHub blob view. Leaves absolute URLs and pure #anchors
 * untouched. Runs AFTER sanitize, so any surviving URL already passed the
 * protocol allow-list.
 */
export function rehypeGithubUrls({ owner, repo, ref, dir }: RepoRef) {
  const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}`;
  const blob = `https://github.com/${owner}/${repo}/blob/${ref}`;

  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'img') {
        const src = node.properties?.src;
        if (typeof src === 'string' && !ABSOLUTE.test(src) && !src.startsWith('#')) {
          const clean = src.replace(/^\.?\//, '');
          node.properties.src = `${raw}/${resolveRepoPath(dir, clean)}`;
          node.properties.loading ??= 'lazy';
          node.properties.decoding ??= 'async';
        }
      }

      if (node.tagName === 'a') {
        const href = node.properties?.href;
        if (typeof href === 'string' && !ABSOLUTE.test(href) && !href.startsWith('#')) {
          const [path, hash] = href.replace(/^\.?\//, '').split('#');
          // Point sibling SKILL.md files at our own reader, everything else at GitHub.
          const target = /(^|\/)SKILL\.md$/i.test(path)
            ? `/${owner}/${repo}?skill=${encodeURIComponent(resolveRepoPath(dir, path))}`
            : `${blob}/${resolveRepoPath(dir, path)}`;
          node.properties.href = hash ? `${target}#${hash}` : target;
        }
      }
    });
  };
}
```

```ts
// src/lib/markdown/toc.ts
import { visit } from 'unist-util-visit';
import { headingRank } from 'hast-util-heading-rank';
import { toString } from 'hast-util-to-string';
import type { Root, Element } from 'hast';

export type TocEntry = { id: string; text: string; depth: number };

/** Collects a flat TOC. Must run AFTER rehype-slug so ids exist. */
export function rehypeCollectToc(sink: TocEntry[]) {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      const depth = headingRank(node);
      if (!depth || depth > 3) return;              // h1–h3 only
      const id = node.properties?.id;
      if (typeof id !== 'string') return;
      const text = toString(node).replace(/\s*#\s*$/, '').trim();
      if (text) sink.push({ id, text, depth });
    });
  };
}
```

```ts
// src/lib/markdown/highlighter.ts
import 'server-only';
import { createHighlighter, type Highlighter } from 'shiki';

/** Languages we preload. Everything else loads lazily on first sight. */
const LANGS = [
  'bash','shell','json','yaml','markdown','typescript','javascript','tsx','jsx',
  'python','go','rust','sql','diff','html','css','toml','xml','dockerfile',
];

const THEMES = { light: 'github-light', dark: 'github-dark-default' } as const;

let singleton: Promise<Highlighter> | undefined;

/**
 * Module-level singleton. Shiki's docs are explicit that the highlighter
 * "should be a long-lived singleton" and must not be created in hot paths.
 */
export function getHighlighter(): Promise<Highlighter> {
  singleton ??= createHighlighter({
    themes: Object.values(THEMES),
    langs: LANGS,
  });
  return singleton;
}

export { THEMES };
```

```tsx
// src/lib/markdown/render.tsx
import 'server-only';
import type { ReactElement } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeShiki from '@shikijs/rehype';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';

import matter from 'gray-matter';
import readingTime from 'reading-time';

import { rehypeGithubUrls, type RepoRef } from './rewrite-urls';
import { rehypeCollectToc, type TocEntry } from './toc';
import { getHighlighter, THEMES } from './highlighter';

/**
 * Sanitize schema: GitHub-style default, tightened and then narrowly widened.
 * The default already omits `style` and `className` globally — we keep it that
 * way and only add what the reader genuinely needs.
 */
const schema: typeof defaultSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    // GFM footnotes + a few structural elements we render ourselves
  ].filter((t) => t !== 'input'), // drop interactive checkboxes entirely
  attributes: {
    ...defaultSchema.attributes,
    // allow only the language hint on code — Shiki reads it downstream
    code: [['className', /^language-./]],
    // allow width/height so images don't jump, but nothing else new
    img: [...(defaultSchema.attributes?.img ?? []), 'width', 'height'],
  },
  protocols: {
    ...defaultSchema.protocols,
    // narrower than default: drop irc/ircs/xmpp, keep the web + mail
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};

export type SkillFrontmatter = {
  name?: string;
  description?: string;
  version?: string;
  license?: string;
  'allowed-tools'?: string[];
  [k: string]: unknown;
};

export type RenderedMarkdown = {
  content: ReactElement;
  frontmatter: SkillFrontmatter;
  toc: TocEntry[];
  readingTime: { text: string; minutes: number; words: number };
  title: string | null;
};

/**
 * Renders untrusted third-party markdown to React elements inside an RSC.
 *
 * Pipeline order is deliberate and security-critical:
 *   parse → gfm → rehype (raw HTML DROPPED) → SANITIZE → slug → autolink
 *   → toc → github urls → external links → shiki
 *
 * Sanitize runs BEFORE shiki because the default schema strips the inline
 * `style` attributes Shiki emits; and BEFORE slug because sanitize rewrites
 * `id` with the `user-content-` clobber prefix.
 */
export async function renderMarkdown(
  source: string,
  repo: RepoRef,
): Promise<RenderedMarkdown> {
  // 1. Frontmatter out-of-band, so YAML never reaches the markdown parser.
  const { data, content: body } = matter(source);

  const toc: TocEntry[] = [];
  const highlighter = await getHighlighter();

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)                                   // tables, task lists, footnotes
    .use(remarkRehype, { allowDangerousHtml: false }) // ← raw HTML dropped. Do not change.
    .use(rehypeSanitize, schema)                      // ← must precede slug + shiki
    .use(rehypeSlug)                                  // heading ids (GitHub-compatible)
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      properties: { className: 'heading-anchor', ariaHidden: true, tabIndex: -1 },
    })
    .use(rehypeCollectToc, toc)
    .use(rehypeGithubUrls, repo)                      // relative → raw.githubusercontent
    .use(rehypeExternalLinks, {
      target: '_blank',
      rel: ['noopener', 'noreferrer'],
      protocols: ['http', 'https'],
    })
    .use(rehypeShiki, {
      highlighter,                                    // reuse the singleton
      themes: THEMES,
      defaultColor: false,                            // emit --shiki-light AND --shiki-dark
      fallbackLanguage: 'text',                       // unknown ```lang must not throw
    })
    .run(
      unified().use(remarkParse).use(remarkGfm).parse(body) as never,
    );

  const content = toJsxRuntime(file as never, {
    Fragment, jsx, jsxs,
    components: {
      // Our own components for the book aesthetic.
      pre: (p) => <figure className="code-block" {...p} />,
      table: (p) => (
        <div className="overflow-x-auto">
          <table {...p} />
        </div>
      ),
    },
  });

  const stats = readingTime(body);

  return {
    content,
    frontmatter: data as SkillFrontmatter,
    toc,
    readingTime: { text: stats.text, minutes: stats.minutes, words: stats.words },
    title: toc.find((t) => t.depth === 1)?.text ?? (data.name as string) ?? null,
  };
}
```

> **Caching note [I]:** wrap the *fetch + render* in a `'use cache'` function, but return **serializable data**, not the React element, if you want the entry to survive to a remote cache handler. `use cache` return values *may* include JSX [V], so returning `content` works for the in-memory case; for `'use cache: remote'`, cache the `hast` JSON and call `toJsxRuntime` outside the cached scope.

> **DoS guard [I]:** cap input size before parsing — `if (source.length > 512_000) throw new Error('SKILL.md too large')`. A 10 MB pathologically-nested markdown file will pin a CPU core.

---

# 3. dither-kit

Registry: `https://www.tripwire.sh/r/registry.json`. **All findings below come from reading the actual `content` fields of the item JSONs**, not from documentation [V].

## 3.1 What actually exists [V]

| Item | Title | npm deps | registryDeps | files |
|---|---|---|---|---|
| `core` | Dither Kit — Core | `motion`, `d3-scale`, `d3-shape`, `clsx`, `tailwind-merge` (+dev `@types/d3-scale`, `@types/d3-shape`) | — | **20** |
| `area-chart` | Dither Area & Line Chart | — | `core` | 4 |
| `bar-chart` | Dither Bar Chart | — | `core` | 3 |
| `pie-chart` | Dither Pie / Donut Chart | — | `core` | 3 |
| `radar-chart` | Dither Radar Chart | — | `core` | 4 |
| `avatar` | Dither Avatar | `clsx`, `tailwind-merge` | — | 4 |
| `button` | Dither Button | `clsx`, `tailwind-merge` | — | 4 |
| `gradient` | Dither Gradient | `clsx`, `tailwind-merge` | — | 4 |
| `dither-kit` | Everything | — | all 7 above | 1 (`index.ts`) |

Author: **`ripgrim`**, version `0.1.0`, `$schema: https://ui.shadcn.com/schema/registry-item.json`.

All files install to **`components/dither-kit/`** → resolves to `src/components/dither-kit/` in our project via the `@/components` alias + `@/* → ./src/*` tsconfig path.

**`sparkline` is not a separate registry item** — it ships inside `area-chart` as `components/dither-kit/sparkline.tsx` [V].

### Peer deps, verified versions [V]

| Package | Version | Licence |
|---|---|---|
| `motion` | 13.0.0 | MIT |
| `d3-scale` | 4.0.2 | **ISC** |
| `d3-shape` | 3.2.0 | **ISC** |
| `@types/d3-scale` | 4.0.9 | MIT |
| `@types/d3-shape` | 3.1.8 | MIT |

All permissive. `clsx` and `tailwind-merge` we already have. ✅

### Licence [V/I]

**[V]** The registry item JSONs contain **no `license` field**, and the component source carries no licence headers. **[I]** The homepage mentions "MIT" but I could not verify an authoritative `LICENSE` file for the registry. Because shadcn-registry components are **copied into our repo as source** (not linked as a dependency), we own the resulting files — but **get written confirmation of the licence from the author before shipping commercially.** This is an open item, not a resolved one.

## 3.2 Client-only? Yes, almost entirely [V]

31 of 39 files carry `"use client"`. The 8 that don't are pure logic modules: `dither-paint.ts`, `index.ts`, `lib.ts`, `palette.ts`, `pixel.ts`, `polar.ts`, `scales.ts`, `use-chart-dimensions.ts`.

**Every chart root is a Client Component.** They measure the DOM (`useChartDimensions`), paint to `<canvas>` in an effect, and use `motion/react`. Charts must be leaf islands inside our RSC tree, imported by a client boundary — they will not render on the server, and they render **nothing** until measured (`ctx.ready` gates on `width > 0`).

> **Consequence [I]:** charts always cause a layout shift on first paint unless we give the wrapper an explicit height. Always wrap: `<div className="h-56 w-full">`.

## 3.3 The colour API — **the single biggest finding** [V]

From `components/dither-kit/chart-context.tsx`:

```ts
export type ChartConfig = Record<string, { label?: string; color: DitherColor }>
```

And from `components/dither-kit/palette.ts`:

```ts
export type DitherColor =
  | "green" | "blue" | "purple" | "pink" | "orange" | "red" | "grey"

export type Seed = { fill: Rgb; line: Rgb; star: Rgb }

export const PALETTE: Record<DitherColor, Seed> = {
  green:  { fill: [40, 210, 110],  line: [150, 255, 180], star: [200, 255, 220] },
  blue:   { fill: [53, 143, 243],  line: [150, 200, 255], star: [205, 228, 255] },
  purple: { fill: [150, 110, 255], line: [200, 175, 255], star: [225, 210, 255] },
  pink:   { fill: [240, 90, 190],  line: [255, 170, 220], star: [255, 205, 235] },
  orange: { fill: [255, 150, 50],  line: [255, 195, 130], star: [255, 220, 175] },
  red:    { fill: [240, 70, 70],   line: [255, 150, 140], star: [255, 195, 185] },
  grey:   { fill: [92, 92, 100],   line: [140, 140, 150], star: [165, 165, 175] },
}
```

**Colours are a closed union of 7 hard-coded names. Not hex. Not CSS variables. Not `oklch()`. Not theme tokens.**

Resolution is `seedOfColor(config[key]?.color ?? "grey")` [V] — a plain object lookup, with silent fallback to grey for anything unrecognised.

### Why this is a real problem for us

The charts paint **per-pixel to a `<canvas>` via `ctx.fillStyle = rgba(...)`** [V]. Canvas cannot read CSS custom properties. So this is not a lazy API — it's an architectural consequence of the dithering technique. Our `stone`-based, brandable theme cannot flow into these charts through the existing API.

### The patch [I]

`palette.ts` is a **12-line file that we own after install**. Extend it to accept explicit RGB triples alongside the named seeds, then feed it from theme tokens resolved in JS (via `getComputedStyle`) or from static brand constants:

```ts
// src/components/dither-kit/palette.ts — after install, extend it
export type DitherColor =
  | "green" | "blue" | "purple" | "pink" | "orange" | "red" | "grey"
  | "brand" | "brandAlt" | "ink";

export const PALETTE: Record<DitherColor, Seed> = {
  /* ...existing seven, unchanged... */
  brand:    { fill: [217, 119,  6], line: [252, 211, 77], star: [254, 240, 199] },
  brandAlt: { fill: [120, 113, 108], line: [214, 211, 209], star: [245, 245, 244] },
  ink:      { fill: [ 41,  37, 36], line: [ 87,  83,  78], star: [168, 162, 158] },
};
```

For genuinely dynamic per-repo branding, widen the type to `DitherColor | Seed` and make `seedOf` pass a `Seed` through unchanged. That is a ~5-line change in `palette.ts` + `chart-context.tsx`/`polar-context.tsx`.

> ⚠️ The seed colours are **tuned for dark backgrounds** — saturated fills at RGB values like `[40,210,110]` with additive `plus-lighter` bloom. On a light `stone` background they will look garish and may fail WCAG contrast. Budget time for a light-mode palette.

## 3.4 Real prop APIs

### `CartesianChartProps<TData>` — `AreaChart`, `LineChart`, `BarChart` [V]

Verbatim from `cartesian-root.tsx`:

```ts
export type CartesianChartProps<TData extends Row> = {
  data: TData[];                                  // required
  config: ChartConfig;                            // required
  children: ReactNode;                            // required — children-as-config
  stackType?: StackType;                          // default "default"
  margins?: Partial<Margins>;                     // default {top:10,right:12,bottom:22,left:36}
  className?: string;
  animate?: boolean;                              // default true
  animationDuration?: number;                     // default 900 (ms)
  replayToken?: number;                           // default 0 — bump to replay entrance
  interactive?: boolean;                          // default true; false = no scrub/tooltip
  markerIndex?: number | null;                    // default null — controlled crosshair
  hovered?: boolean;                              // default false — parent-driven hover lift
  bloom?: BloomInput;                             // default "off"
  bloomOnHover?: boolean;                         // default false
  onHoverChange?: (index: number | null) => void;
  defaultSelectedDataKey?: string | null;         // default null
  onSelectionChange?: (key: string | null) => void;
};
```

`ChartType = "area" | "bar" | "line" | "pie" | "radar"`. `Margins = { top; right; bottom; left }`.

### `PieChartProps<TData>` [V]

```ts
export type PieChartProps<TData extends Row> = {
  data: TData[];
  config: ChartConfig;
  children: ReactNode;
  dataKey: string;        // value field
  nameKey: string;        // slice-name field — its VALUE is the config key
  innerRadius?: number;   // 0–1 ratio → donut
  margins?: Partial<Margins>;  // default {top:22,right:14,bottom:14,left:14}
  className?: string;
  animate?: boolean; animationDuration?: number; replayToken?: number;
  bloom?: BloomInput; bloomOnHover?: boolean;
  defaultSelectedDataKey?: string | null;
  onSelectionChange?: (key: string | null) => void;
};
```

> **Critical subtlety [V]:** for pie charts, `config` is keyed by the **value of the `nameKey` field**, not by a series name. If `nameKey="category"` and a row is `{ category: "Writing", count: 12 }`, then `config` must contain a `"Writing"` entry. Confirmed at `polar-context.tsx:195`: `seedOfColor(config[key]?.color ?? "grey")` where `key` is the slice name.

### `RadarChartProps<TData>` [V]

Same as pie minus `dataKey`/`innerRadius`; has `nameKey` (axis-label field). `RadarChart` internally passes `dataKey=""` and a `<RadarFrame />` back-decoration.

### Series parts [V]

```ts
// <Area>, <Line> — from area.tsx
export type SeriesProps = {
  dataKey: string;
  variant?: AreaVariant;         // "gradient" | "dotted" | "hatched" | "solid"  (default "gradient")
  strokeVariant?: StrokeVariant; // "solid" | "dashed"                            (default "solid")
  isClickable?: boolean;         // default false — adds transparent hit polygon
  children?: ReactNode;          // <Dot>, <ActiveDot>
};

// <Bar> — from bar.tsx: identical shape
// <Pie> — from pie.tsx:  { variant?: AreaVariant }  ← no dataKey; slices come from data
// <Radar> — from radar.tsx: { dataKey: string; variant?: AreaVariant }
```

> `<Pie>` and `<Radar>` **render `null`** — they exist purely to register a fill variant into context via `useEffect`. Same for the registration half of `<Area>`/`<Bar>`.

> Dev-mode guard [V]: `<Area>`/`<Bar>`/`<Radar>` `console.warn` if `dataKey` is missing from `config`. `useChartPart()` **throws** with a precise message if a part is used under the wrong root (e.g. `<Bar>` inside `<AreaChart>`).

### Chrome parts [V]

```ts
Grid        { horizontal?: boolean; vertical?: boolean; strokeDasharray?: string }        // chartLayer="back"
XAxis       { dataKey?: string; tickFormatter?: (v: unknown, i: number) => string;
              tickMargin?: number; maxTicks?: number }
YAxis       { tickFormatter?: (v: number) => string; tickCount?: number; tickMargin?: number }
ReferenceLine
Dot         { variant?: "border" | "colored-border" | "filled"; r?: number }
ActiveDot   { variant?: DotVariant; r?: number }
Legend      { isClickable?: boolean; align?: "left" | "center" | "right" }                 // chartLayer="dom"
BlockLegend { values?: Record<string, number>; valueFormatter?: (v: number) => string;
              align?: "start" | "center" | "end"; className?: string }
Tooltip     { labelKey?: string; valueFormatter?: (v: number, name: string) => string;
              variant?: "default" | "frosted-glass" }                                      // chartLayer="dom"
```

**The `chartLayer` static** [V] is how the children-as-config pattern routes composition. `layerOf()` reads `node.type.chartLayer`, defaulting to `"svg"`:

- `"back"` → SVG behind the canvas (`Grid`, `RadarFrame`) — rendered `aria-hidden role="presentation"`
- `"svg"` → SVG in front (axes, dots, series hit areas) — `role="img" aria-label="Chart"`
- `"dom"` → plain DOM overlay on top (`Legend`, `Tooltip`)

> `Legend` is an **absolutely-positioned overlay** pinned to the top of the plot. Its own source comment warns it "is best for ≤2–3 entries" and to use the in-flow `<BlockLegend>` for more [V]. For our "skills per category" donut with 6–8 categories, **use `BlockLegend`.**

### `bloom` [V]

```ts
type BloomLevel  = "off" | "low" | "high" | "aura";
type BloomBlend  = "plus-lighter" | "screen" | "lighten";
type BloomConfig = { blur: number; brightness: number; opacity: number;
                     saturate?: number; blend?: BloomBlend };
type BloomInput  = BloomLevel | BloomConfig;

const PRESET = {
  low:  { blur: 3,  brightness: 1.35, opacity: 0.7,  saturate: 1.4 },
  high: { blur: 5,  brightness: 1.5,  opacity: 0.78, saturate: 1.5 },
  aura: { blur: 15, brightness: 2.9,  opacity: 0.1,  saturate: 3   },
};
```

Implemented as a second canvas layered over the crisp one, with `filter: blur() brightness() saturate()` and `mix-blend-mode: plus-lighter` [V]. **`plus-lighter` is an additive blend — it only looks right on dark backgrounds.** On light `stone` it will wash out to white.

## 3.5 Accessibility gaps we must patch [V]

I audited every file. Findings:

| # | Gap | Evidence | Severity |
|---|---|---|---|
| 1 | **Every chart's accessible name is the literal string `"Chart"`** | `cartesian-root.tsx:177-178` and `polar-root.tsx:160-161`: `<svg role="img" aria-label="Chart">`. Hard-coded; **no prop to override.** | 🔴 WCAG 1.1.1 fail. A screen-reader user hears "Chart, image" — 3 times on a page with 3 charts. |
| 2 | **No data-table fallback** | No `<table>`, `<figcaption>`, or visually-hidden summary anywhere in the 39 files. | 🔴 Chart data is entirely unavailable to AT. |
| 3 | **Tooltip is pointer-only** | `cartesian-root.tsx` wires `onPointerEnter`/`onPointerMove`/`onPointerLeave` only. No `onFocus`, no `tabIndex`, no keyboard handlers. | 🔴 WCAG 2.1.1 fail — values unreachable by keyboard. |
| 4 | **`motion/react` animations ignore reduced motion** | `prefersReducedMotion()` is called in the 4 canvas painters (`cartesian-canvas.tsx:62`, `bar-canvas.tsx:79`, `pie-canvas.tsx:57`, `radar-canvas.tsx:53`) — but `tooltip.tsx` is the only `motion/react` consumer and has **no `MotionConfig`** and no reduced-motion check. | 🟡 Partial. The *canvas* respects it; the *tooltip* doesn't. |
| 5 | **`prefersReducedMotion()` is not reactive** | `dither-paint.ts:177` reads `matchMedia(...).matches` once per paint; no `addEventListener('change')`. | 🟡 Changing the OS setting mid-session doesn't take effect. |
| 6 | **Canvas element lacks `aria-hidden`** | `cartesian-canvas.tsx` renders `<canvas>` with no ARIA. | 🟢 Low — a `<canvas>` with no fallback content is already ignored by AT. Add it for hygiene. |
| 7 | **Non-clickable legend entries are `disabled` buttons** | `legend.tsx`: `disabled={!isClickable}`. | 🟢 Low — removes them from tab order, which is arguably correct, but a `<ul>` would be more semantic. |
| 8 | **Series/bar click targets are bare SVG with `onClick`** | `area.tsx`, `bar.tsx` — both carry `biome-ignore lint/a11y/noStaticElementInteractions` with the justification "the Legend offers the same toggle accessibly." | 🟢 Acceptable — genuine progressive enhancement, provided we enable `<Legend isClickable>`. |
| 9 | **Fixed palette may fail contrast on light backgrounds** | §3.3. | 🟡 Needs a light-mode palette. |

### The patch: an accessible wrapper

Rather than fork every root, wrap once. This fixes #1, #2, and #6 in one place:

```tsx
// src/components/charts/accessible-chart.tsx
'use client';
import { useId, type ReactNode } from 'react';

export type ChartDatum = { label: string; value: number };

/**
 * Wraps a dither-kit chart with a real accessible name, a description, and a
 * visually-hidden data table. dither-kit hard-codes aria-label="Chart" on its
 * inner <svg role="img">, so we neutralise that subtree with aria-hidden and
 * expose our own semantics on the figure.
 */
export function AccessibleChart({
  title, description, data, valueLabel = 'Value', children, className,
}: {
  title: string;
  description?: string;
  data: ChartDatum[];
  valueLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const descId = useId();

  return (
    <figure
      role="group"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={className}
    >
      <figcaption id={titleId} className="text-sm font-medium">
        {title}
      </figcaption>
      {description && (
        <p id={descId} className="text-xs text-muted-foreground">{description}</p>
      )}

      {/* Hide dither-kit's generic aria-label="Chart" from AT entirely. */}
      <div aria-hidden="true">{children}</div>

      {/* The real accessible content. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr><th scope="col">Name</th><th scope="col">{valueLabel}</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.value.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
```

And fix #4 globally by wrapping the app's client tree once:

```tsx
// src/components/providers/motion-provider.tsx
'use client';
import { MotionConfig } from 'motion/react';
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
```

## 3.6 Real usage code

### (a) Install-count bar chart

```tsx
// src/components/charts/installs-bar.tsx
'use client';

import {
  BarChart, Bar, Grid, XAxis, YAxis, Tooltip, BlockLegend,
  type ChartConfig,
} from '@/components/dither-kit';
import { AccessibleChart } from './accessible-chart';

const data = [
  { month: 'Mar', installs: 1_240 },
  { month: 'Apr', installs: 2_180 },
  { month: 'May', installs: 3_020 },
  { month: 'Jun', installs: 4_710 },
  { month: 'Jul', installs: 6_390 },
  { month: 'Aug', installs: 8_845 },
];

const config = {
  installs: { label: 'Installs', color: 'green' },
} satisfies ChartConfig;

export function InstallsBar() {
  return (
    <AccessibleChart
      title="Skill installs over time"
      description="Monthly install count for this repository, March through August 2026."
      valueLabel="Installs"
      data={data.map((d) => ({ label: d.month, value: d.installs }))}
    >
      {/* Explicit height is REQUIRED — the chart measures its container
          and renders nothing until width > 0. */}
      <div className="h-56 w-full">
        <BarChart
          data={data}
          config={config}
          bloom="low"
          bloomOnHover
          animationDuration={700}
        >
          <Grid horizontal vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="month" tickMargin={8} />
          <YAxis
            tickCount={4}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
          />
          <Bar dataKey="installs" variant="gradient" />
          <Tooltip
            labelKey="month"
            valueFormatter={(v) => `${v.toLocaleString()} installs`}
            variant="frosted-glass"
          />
        </BarChart>
      </div>
      <BlockLegend align="start" valueFormatter={(v) => v.toLocaleString()} />
    </AccessibleChart>
  );
}
```

### (b) Skills-per-category donut

```tsx
// src/components/charts/category-donut.tsx
'use client';

import { PieChart, Pie, BlockLegend, Tooltip, type ChartConfig }
  from '@/components/dither-kit';
import { AccessibleChart } from './accessible-chart';

const data = [
  { category: 'Writing',     count: 12 },
  { category: 'Research',    count: 9  },
  { category: 'Engineering', count: 17 },
  { category: 'Data',        count: 6  },
  { category: 'Ops',         count: 4  },
];

// NOTE: for pie charts the config is keyed by the VALUE of `nameKey`,
// not by a series name. Verified in polar-context.tsx:195.
const config = {
  Writing:     { label: 'Writing',     color: 'purple' },
  Research:    { label: 'Research',    color: 'blue'   },
  Engineering: { label: 'Engineering', color: 'green'  },
  Data:        { label: 'Data',        color: 'orange' },
  Ops:         { label: 'Ops',         color: 'pink'   },
} satisfies ChartConfig;

export function CategoryDonut() {
  return (
    <AccessibleChart
      title="Skills by category"
      description="Distribution of the 48 skills in this repository across five categories."
      valueLabel="Skills"
      data={data.map((d) => ({ label: d.category, value: d.count }))}
    >
      <div className="h-64 w-full">
        <PieChart
          data={data}
          config={config}
          dataKey="count"
          nameKey="category"
          innerRadius={0.62}       // 0–1 ratio → donut
          bloom="low"
          animationDuration={900}
          defaultSelectedDataKey={null}
        >
          <Pie variant="gradient" />
          <Tooltip valueFormatter={(v, name) => `${name}: ${v} skills`} />
        </PieChart>
      </div>
      {/* BlockLegend, not Legend — 5 entries would overlap the plot. */}
      <BlockLegend
        align="center"
        values={Object.fromEntries(data.map((d) => [d.category, d.count]))}
        valueFormatter={(v) => `${v}`}
      />
    </AccessibleChart>
  );
}
```

### (c) Sparkline

```tsx
// src/components/charts/skill-sparkline.tsx
'use client';

import { Sparkline } from '@/components/dither-kit';

/**
 * Sparkline is a thin wrapper over AreaChart specialised for a plain number[]:
 * interactive={false}, zero margins, animate defaults to FALSE (calm spark).
 * It memoizes `rows` and `config` internally so it works without React Compiler.
 */
export function SkillSparkline({
  trend, label, hovered = false,
}: {
  trend: number[];
  label: string;
  hovered?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={`${label}: 30-day trend, ${trend.at(0)} to ${trend.at(-1)}`}
      className="inline-block h-8 w-24 align-middle"
    >
      <Sparkline
        data={trend}
        color="blue"
        variant="gradient"
        hovered={hovered}       // lift the fill when the parent row is hovered
        bloom="low"
        bloomOnHover
        animate={false}
      />
    </span>
  );
}
```

Usage in a list row, driving `hovered` from the row:

```tsx
function SkillRow({ skill }: { skill: Skill }) {
  const [hovered, setHovered] = useState(false);
  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center justify-between gap-4 py-3"
    >
      <span>{skill.name}</span>
      <SkillSparkline trend={skill.trend30d} label={skill.name} hovered={hovered} />
    </li>
  );
}
```

---

# 4. Install commands and conflicts

## 4.1 Recommended commands

Install only what we use. `core` comes in automatically via `registryDependencies`.

```bash
# Charts we actually need (bar + donut + sparkline).
# area-chart is required — Sparkline ships inside it.
npx shadcn@latest add https://www.tripwire.sh/r/bar-chart.json
npx shadcn@latest add https://www.tripwire.sh/r/pie-chart.json
npx shadcn@latest add https://www.tripwire.sh/r/area-chart.json
```

Optional extras (evaluate before adding — see conflicts):

```bash
npx shadcn@latest add https://www.tripwire.sh/r/avatar.json     # generative repo/owner avatars
npx shadcn@latest add https://www.tripwire.sh/r/gradient.json   # decorative section washes
```

**Do not run** `npx shadcn@latest add https://www.tripwire.sh/r/dither-kit.json` — it pulls all seven items including `radar-chart` and `button`, which we don't want (see §4.2).

Then install the peer deps (the CLI should offer, but pin explicitly):

```bash
pnpm add motion@13.0.0 d3-scale@4.0.2 d3-shape@3.2.0
pnpm add -D @types/d3-scale@4.0.9 @types/d3-shape@3.1.8
```

> The registry's own `registryDependencies` reference `https://tripwire.sh/r/*.json` (no `www`), while the registry index is served from `https://www.tripwire.sh/`. Both resolve [V]. If the CLI trips on a redirect, add the registry to `components.json` instead:
> ```json
> "registries": { "@dither": "https://www.tripwire.sh/r/{name}.json" }
> ```
> then `npx shadcn@latest add @dither/bar-chart`.

## 4.2 Conflicts with base-luma / Base UI

| # | Conflict | Severity | Resolution |
|---|---|---|---|
| 1 | **`DitherButton` vs shadcn `Button`** | 🟡 | No *file* collision (`components/dither-kit/button.tsx` vs `components/ui/button.tsx`), and the export is named `DitherButton` [V], so no import clash either. But it's a second, visually unrelated button system next to base-luma. **Skip the `button` item.** |
| 2 | **`DitherAvatar` vs shadcn `Avatar`** | 🟢 | Export is `DitherAvatar` [V]; different file. Safe. Genuinely nice for owner identicons where GitHub has no avatar. |
| 3 | **Duplicate `cn()`** | 🟢 | dither-kit ships its own `components/dither-kit/lib.ts` with an identical `clsx`+`twMerge` implementation, deliberately: *"local copy so the chart pack is self-contained and portable as a registry"* [V]. Harmless duplication. Optionally re-point it at `@/lib/utils` after install. |
| 4 | **No Radix / no Base UI dependency** | ✅ | Verified across all 39 files: dither-kit imports only `react`, `motion/react`, `d3-scale`, `d3-shape`, `clsx`, `tailwind-merge`. **Zero primitive conflict with `@base-ui/react`.** This was the main risk and it does not exist. |
| 5 | **`motion@13` is a new ~35 KB gzip client dep** | 🟡 | Only `tooltip.tsx` imports `motion/react` [V]. If we render charts without `<Tooltip>`, tree-shaking should drop most of it. Verify with a bundle analysis; consider replacing the tooltip with a CSS transition to shed the dep entirely. |
| 6 | **Fixed 7-colour palette vs stone/brand theming** | 🔴 | §3.3. **Requires patching `palette.ts`.** Highest-priority follow-up. |
| 7 | **`mix-blend-mode: plus-lighter` bloom on light backgrounds** | 🟡 | Additive blending assumes a dark ground. Use `bloom="off"` in light mode, or swap `blend: 'screen'`, or gate on the theme. |
| 8 | **Tailwind v4 tokens** | 🟢 | Components use `bg-popover`, `text-muted-foreground`, `border` [V] — all standard shadcn tokens present in our `globals.css`. Should just work. |
| 9 | **`src/` directory mapping** | 🟢 | Registry targets are `components/dither-kit/*`; our `components.json` alias `@/components` + tsconfig `@/* → ./src/*` resolves to `src/components/dither-kit/`. Verify after the first install. |
| 10 | **`radar-chart`** | 🟢 | Not needed for our three chart use cases. Skip it; saves 4 files. |
| 11 | **Charts are client-only and unmeasured-until-mounted** | 🟡 | Always wrap in a fixed-height container to prevent CLS, and keep them as leaf islands so the surrounding page stays an RSC. |

---

# 5. Firm recommendations

1. **Read `node_modules/next/dist/docs/` before writing any Next.js code.** It is version-matched to 16.3.0 and explicitly warns that training data is stale.
2. **Enable `cacheComponents: true` + `partialPrefetching: true` now**, before writing routes. Retrofitting the params-in-Suspense pattern later is a rewrite.
3. **Never `await params` at the top of `/[owner]/[repo]/page.tsx`.** Pass the promise into `<Suspense>`. This is what makes an unknown repo load instantly.
4. **Invest in `BookSkeleton`.** It is the App Shell every uncached repo renders first — the most-viewed component in the product.
5. **Use `use cache` + `cacheTag` + `cacheLife`, never `unstable_cache`.** Plan for `'use cache: remote'` or a cache handler in production — in-memory caching will not protect the GitHub rate limit.
6. **`revalidateTag` always takes two arguments now.** `revalidateTag(tag, 'max')`.
7. **Markdown: bespoke `unified` pipeline. Reject `next-mdx-remote`** — MPL-2.0 *and* it executes untrusted markdown as JavaScript.
8. **Never enable `rehype-raw`. Sanitize before Shiki, and before `rehype-slug`.** Order is load-bearing; getting it wrong either strips all syntax colour or breaks every TOC anchor.
9. **Shiki's bundle size is irrelevant in RSC** — 0 KB reaches the client. Use a module-level singleton highlighter.
10. **Fonts: variable-only, exactly three preloaded, the rest `preload:false` + a CSS-variable swap.** Ten `preload:true` fonts in the root layout would add 200–400 KB of blocking font fetches to every page.
11. **dither-kit's `color` is a closed 7-name union that cannot read CSS variables.** Patch `palette.ts` on day one or the charts will never match the brand.
12. **Wrap every chart in `AccessibleChart`.** dither-kit hard-codes `aria-label="Chart"` with no override and ships no table fallback and no keyboard access — three WCAG failures out of the box.
13. **Add `<MotionConfig reducedMotion="user">`** — the canvas painters respect reduced motion but the tooltip does not.
14. **Confirm dither-kit's licence in writing before shipping commercially.** No `license` field in the registry JSON and no headers in the source.

---

## Appendix: open items to verify

- [ ] `RouteContext<'/route'>` generated type name — confirm after first `next dev` writes `.next/types` **[I]**
- [ ] dither-kit licence — no authoritative `LICENSE` located **[V that it's missing]**
- [ ] Whether `motion` fully tree-shakes when `<Tooltip>` is unused — needs a real bundle analysis
- [ ] Light-mode dither palette + `plus-lighter` alternative — needs design work
- [ ] Confirm `src/components/dither-kit/` is the resolved install path after the first `shadcn add`
