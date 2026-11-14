---
type: rule
---
# Short Branches, Green Main

`main` always passes `cargo xtask check`. Work happens on short branches, each a small change merged within a few
days. Unfinished work merges switched off, not parked on a branch. No integration branches, no branches that hold
generated output.

**Why.** DFO Online reached 1,319 branches, its newest work sat 1,793 commits ahead of `main`, and 5,264 of its
commits are merges. A branch that lives long spends its time catching up.

**Checked by.** CI on every pull request, and review. The procedure: [[Branches and Merging]].
