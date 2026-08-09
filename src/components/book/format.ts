/**
 * Editorial formatters.
 *
 * Numbers on a magazine page are set, not printed. Everything here exists so
 * that a count, a date, or a byte size reads as typography rather than as a
 * database field — and so that the same value is written the same way in the
 * masthead, the rails, and the colophon.
 */

/** Roman numerals for part numbers. Parts are a handful; chapters are not. */
const ROMAN: Array<[number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function roman(n: number): string {
  if (!Number.isFinite(n) || n < 1 || n > 3999) return String(n);
  let rest = Math.floor(n);
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

/** Zero-padded chapter folio: 1 → "01", 12 → "12", 120 → "120". */
export function folio(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Compact counts. `Intl.NumberFormat` with `notation: "compact"` writes
 * "1.2K" — uppercase K reads as a unit prefix that does not exist. Lowercase
 * k and a thin space are what a style guide asks for.
 */
export function compactCount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** "12 minutes", "1 hour 20 minutes" — never "80 min". */
export function readingTime(minutes: number): string {
  if (minutes < 60) return `${minutes} ${plural(minutes, "minute")}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const head = `${hours} ${plural(hours, "hour")}`;
  return rest === 0 ? head : `${head} ${rest} ${plural(rest, "minute")}`;
}

/** Short form for a rail or a table row. */
export function shortReadingTime(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 6) / 10} hr`;
}

/**
 * Dates are rendered on the server and must not depend on the request's
 * locale, or the prerendered HTML disagrees with the client's hydration.
 * `en-GB` day-month-year with a spelled month is unambiguous everywhere.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function editorialDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : DATE_FORMAT.format(date);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Trim a description to a dek without cutting mid-word. */
export function dek(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

/**
 * The licence as a reader needs it: a name, or the honest absence of one.
 *
 * Attribution is a hard product rule — a repo with no detectable licence says
 * so in plain words rather than showing a blank cell that reads as "free".
 */
export function licenceLabel(
  license: { name: string; spdxId: string | null } | null,
): string {
  if (!license) return "All rights reserved — view on GitHub";
  if (license.spdxId && license.spdxId !== "NOASSERTION") return license.spdxId;
  return license.name;
}
