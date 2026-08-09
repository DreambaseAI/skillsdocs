---
name: Reading tables
description: Read a data table the way a statistician does, so the number that matters is the one you notice first.
license: MIT
compatibility: any
---

# Reading tables

Most tables are read wrong: top-left to bottom-right, like prose. Read the
margins first, then the cells.

## Read the margins first

Totals and averages tell you the scale. Without the scale, an individual cell
has no meaning — a difference of four is enormous in one column and noise in the
next.

| Region        | Requests | Errors | Error rate |
| ------------- | -------: | -----: | ---------: |
| North America |   48,120 |    212 |      0.44% |
| Europe        |   31,455 |    198 |      0.63% |
| Asia-Pacific  |   22,904 |    486 |      2.12% |
| South America |    4,318 |     19 |      0.44% |
| **Total**     |  106,797 |    915 |      0.86% |

Asia-Pacific carries a fifth of the traffic and more than half the errors. That
is the sentence the table is trying to say, and no cell says it on its own.

## Beware the ratio with a small denominator

South America matches the best error rate in the table, on a twentieth of the
traffic. Nineteen errors either way would move it further than any real change
in reliability could. Rates computed on small denominators belong with their
denominators, always.

## Sorting is an argument

The order of the rows is an editorial choice, and it decides what the reader
notices. Sorting by error rate makes reliability the story. Sorting by requests
makes scale the story. Neither is neutral, so pick deliberately and say which
you picked.

## A checklist

1. Read the row and column totals.
2. Find the largest denominator and the smallest.
3. Check whether any rate is computed on fewer than a hundred observations.
4. Only then read individual cells.
