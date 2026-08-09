---
name: Shipping safely
description: Release changes to a running system without waking anyone up, using guards you can verify before the deploy rather than after it.
license: MIT
compatibility: any
allowed-tools: Bash, Read, Edit
---

# Shipping safely

A safe deploy is one whose failure mode you chose in advance. This skill is the
short version of that: what to check, what to automate, and what to leave to a
human.

## Before the deploy

Run the gates locally first. A gate that only ever runs in CI is a gate you have
never actually read the output of.

```bash
pnpm tsc --noEmit
pnpm vitest run
pnpm build
```

## The rollback has to be boring

If rolling back requires a decision, it will not happen at three in the morning.
Make it a single command with no arguments.

```bash
#!/usr/bin/env bash
set -euo pipefail
# Roll back to the previous known-good release. No flags, on purpose:
# every flag is a decision, and decisions are what fail under stress.
previous="$(cat .releases/previous)"
deploy --release "$previous" --wait
```

### Verifying the rollback

A rollback that has never been exercised is a hypothesis. Exercise it on a
Tuesday morning, with everyone awake, at least once a quarter.

## What to automate and what not to

Automate anything whose correct answer is always the same. Leave to a human
anything whose correct answer depends on context the automation cannot see —
which, in practice, means the decision to ship at all.

## Further reading

The [Google SRE book](https://sre.google/books/) covers error budgets in far
more depth than this page can, and is free to read online.
