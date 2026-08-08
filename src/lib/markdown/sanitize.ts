/**
 * Sanitization schema for untrusted third-party markdown.
 *
 * This is the GitHub-flavoured default schema **narrowed**, never widened.
 *
 * The temptation is always to add `style` and `className` to the `"*"`
 * allowance so that Shiki's token colours survive. That is backwards: Shiki
 * runs *after* sanitize, so its markup is ours and is never scrubbed, while a
 * global `style` allowance hands arbitrary third-party markdown a
 * clickjacking/overlay primitive. At sanitize time the only attributes in the
 * tree are the ones `remark-rehype` and `remark-gfm` generated — raw HTML has
 * already been dropped by `remarkRehype` (`allowDangerousHtml` stays false) —
 * so nothing legitimate needs an allowance we do not already inherit.
 *
 * What the inherited default already covers, verified by reading the shipped
 * schema at runtime:
 *   - `code`: `className` matching /^language-./  (Shiki's language hint)
 *   - `li`:   `className="task-list-item"`, `ul`/`ol`: `contains-task-list`
 *   - `input`: `type="checkbox"` + `disabled`, `checked` via the `"*"` list
 *   - `section[data-footnotes]`, `a[data-footnote-ref|data-footnote-backref]`
 *   - `width`/`height`/`id`/`title`/`lang`/`align` via the `"*"` list
 */

import { defaultSchema } from "rehype-sanitize";

export const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    // Narrower than the default, which also permits irc, ircs and xmpp.
    // Nothing in a skills document has ever needed them, and every extra
    // scheme is another handler an OS might launch.
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
} satisfies typeof defaultSchema;
