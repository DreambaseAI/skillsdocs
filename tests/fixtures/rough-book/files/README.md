# Rough Book

The opposite of `clean-book`: a skills repository carrying the accessibility
defects real repositories actually ship. It exists so the suite can prove two
things at once.

1. Our rehype pipeline repairs a broken heading outline before rendering, so
   the page passes `heading-order` even though the source does not.
2. Defects that belong to the source author — a missing `alt`, link text that
   says "click here" — are **reported** in the per-issue accessibility report
   and do **not** fail the build.

## Licence

MIT.
