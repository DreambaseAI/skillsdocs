/**
 * Number formatting shared by the charts and their data tables. Owner: WS-7.
 *
 * The axis and the table deliberately disagree: an axis tick has ~4 characters
 * of room and wants `1.2M`, while the table is the accessible representation of
 * the data and must carry the exact figure. Two formatters, one import, so a
 * chart can never accidentally round the number a screen reader gets.
 */

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const exact = new Intl.NumberFormat("en");

/** Axis ticks, legend values, headline figures: `1.2M`. */
export function compactNumber(value: number): string {
  return compact.format(value);
}

/** Data-table cells: `1,234,567`. Never rounded. */
export function exactNumber(value: number): string {
  return exact.format(value);
}

/** Share of a total, for donut captions and tables. */
export function percentOf(value: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (value / total) * 100;
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
}

/** Axis labels have no room for a long repo or part name. */
export function truncateLabel(label: string, max = 12): string {
  if (label.length <= max) return label;

  /*
   * An `owner/repo` label carries its meaning on the right. Clipping from the
   * end turned both `vercel-labs/skills` and `vercel-labs/agent-skills` into
   * the identical string `vercel-l…` — two different bars, one label, and a
   * duplicate React key. Shorten the owner and keep the repo whole.
   */
  const slash = label.indexOf("/");
  if (slash > 0) {
    const repo = label.slice(slash + 1);
    // Only worth it if the repo alone still leaves room for some of the owner.
    if (repo.length <= max - 3) {
      const room = max - repo.length - 2; // "…" + "/"
      return `${label.slice(0, room)}…/${repo}`;
    }
    return repo.length > max ? `${repo.slice(0, max - 1)}…` : repo;
  }

  return `${label.slice(0, max - 1)}…`;
}

/**
 * Shorten a whole set of labels to `max`, guaranteeing they stay distinct.
 *
 * Truncating each label independently cannot do this, and the failure is not
 * cosmetic: an axis where `firebase/agent-skills` and `vercel-labs/agent-skills`
 * both read `agent-skill…` is a chart that lies, and React reports it as a
 * duplicate key. Uniqueness is a property of the set, so it has to be decided
 * where the set is known.
 *
 * Colliding entries fall back to an owner-prefixed form — `fir/agent-s…`,
 * `ver/agent-s…` — which keeps the distinguishing part of both segments.
 */
export function shortenLabels(labels: string[], max = 12): string[] {
  const first = labels.map((label) => truncateLabel(label, max));

  const counts = new Map<string, number>();
  for (const short of first) counts.set(short, (counts.get(short) ?? 0) + 1);

  const resolved = first.map((short, i) => {
    if ((counts.get(short) ?? 0) === 1) return short;

    const full = labels[i];
    const slash = full.indexOf("/");
    if (slash <= 0) return short;

    const prefix = full.slice(0, Math.max(1, Math.min(3, max - 4)));
    const room = max - prefix.length - 1; // the separator
    const repo = full.slice(slash + 1);
    return `${prefix}/${repo.length > room ? `${repo.slice(0, room - 1)}…` : repo}`;
  });

  // Anything still colliding is genuinely indistinguishable at this width;
  // number it rather than render two bars with one name.
  const seen = new Map<string, number>();
  return resolved.map((short) => {
    const n = (seen.get(short) ?? 0) + 1;
    seen.set(short, n);
    if (n === 1) return short;
    const tag = `·${n}`;
    return `${short.slice(0, Math.max(1, max - tag.length))}${tag}`;
  });
}
