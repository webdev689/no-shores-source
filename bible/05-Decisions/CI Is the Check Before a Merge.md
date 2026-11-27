---
type: decision
date: 2026-11-24
status: in force
---
# CI Is the Check Before a Merge

The owner wrote "Things keep getting canceled. Cargo check takes way too long". Told that each change ran the whole
`cargo xtask check` three times (before the push, in the pull request's CI, and on `main` before the deploy), about 35
minutes each, the owner chose "Let CI be the check", the option that read: "Before a push, run only the quick repo
check plus the tests of what changed (a few minutes). The PR's CI runs the full check, and I merge when it is green.
This saves about 35 minutes per round and ends the restarts. The rule in CLAUDE.md becomes 'cargo xtask check passes
in CI on the PR's head'."

## What it settles

- Done means `cargo xtask check` passes in CI on the pull request's head, and a merge waits for it to be green.
- Before a push, `cargo xtask repo` and the tests of what changed run; the whole check need not run first
  ([[Making a Change]], [[Testing]]).
- `main` still runs the whole check before it deploys ([[The Rooms Deploy When Their Code Changes]]). Replaced by
  [[Main Deploys What Its Pull Request Passed, and the Check Runs in Three Parts]]: `main` deploys code its pull request's check passed without checking it again.
