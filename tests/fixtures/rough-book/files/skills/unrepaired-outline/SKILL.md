---
name: Unrepaired outline
description: A skill whose author skipped heading levels and opened with a duplicate H1, used to prove the rehype outline repair actually runs.
---

# Unrepaired outline

This document is deliberately malformed. Its heading levels jump from one to
three, then to five, then back up, and it opens with an H1 that duplicates the
frontmatter name. None of that is our fault, and all of it has to be repaired
before the page is rendered, because we cannot fix it upstream.

### Jumped straight to level three

The source of this heading is `###`, with no `##` above it. After the +1 shift
the repair should clamp it so the rendered outline never gains a gap.

##### And now level five

Two levels skipped in one step. A screen-reader user navigating by heading
would be told this section is nested three deep inside a section that does not
exist.

## Back up to level two

Repairs must not reorder anything or invent structure. Going back up a level is
always legal and must be left alone.

###### Level six, which cannot shift any further

A source `######` would become `h7` after the shift. There is no `h7`, so it
clamps, and the clamp must not create a skip either.
