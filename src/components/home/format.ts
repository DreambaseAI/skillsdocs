/**
 * Number formatting shared by the server-rendered cards and the client-side
 * shelf.
 *
 * Its own module so a client component can import it without pulling
 * `book-card.tsx` — and through it `next/image`, the design library and the
 * colour maths — into the browser bundle.
 */

/**
 * Compact install counts, hand-rolled rather than `Intl.NumberFormat`.
 *
 * The compact notation ICU produces varies between Node builds and browser
 * ICU data ("2.7M" vs "2,7 Mio."), and these strings are rendered on the
 * server and hydrated on the client. A fixed format cannot drift.
 */
export function compact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) {
    const k = value / 1_000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
  }
  const m = value / 1_000_000;
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)}M`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
