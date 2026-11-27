---
type: decision
date: 2026-11-27
status: in force
---
# Main Deploys What Its Pull Request Passed, and the Check Runs in Three Parts

> "I'm getting so tired of merge/deploying taking over an hour to complete"

Told that a merge took about 1 h 40 to deploy, the pull request's whole check (47 minutes) and then the same check
again on `main`, though the merged code was what had passed, and asked which speed-ups to build, the owner chose all
three:

- "Skip main's re-check", the option that read: "When the merged tree is identical to the PR head's that passed, main
  deploys straight away. Saves ~47 min per merge; deploy starts in minutes. Same code that was checked, so no checking
  is lost."
- "Faster Rust tests", the option that read: "Rust tests are 27 of the 47 min: cargo runs ~40 test binaries one after
  another. Run them all at once (cargo-nextest). Estimated 10+ min saved; not measured yet."
- "Split check into parallel jobs", the option that read: "Run Rust tests and TypeScript tests (12 min) on separate
  runners at the same time. Estimated check ~30 min instead of 47; uses more runner minutes."

## What it settles

- On a push to `main`, when `main` before the merge is in the pull request's head, so the merge is that head's code,
  and the head's check passed in its pull request, `main` deploys without running the check again. Any other push to
  `main` is checked whole, as before. This replaces the last point of [[CI Is the Check Before a Merge]].
- CI runs the check in three parts at once, each on a runner of its own: the rest (format, lints, types, shaders, the
  builds and the repo checks), the Rust tests, and the page's tests. The check passes when all three do ([[Checks]]).
- CI runs the Rust tests with cargo-nextest, its release pinned and checked against its hash; `cargo xtask check` runs
  them with it wherever it is installed, and with `cargo test` elsewhere.
- `main` still always passes the check ([[Short Branches, Green Main]]): what it deploys is code that passed it.
