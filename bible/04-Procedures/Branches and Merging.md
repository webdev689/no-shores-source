---
type: procedure
---
# Branches and Merging

- **`main` always passes** `cargo xtask check`. Nothing merges red.
- **One branch, one change.** Name it for the change (`sea/wave-height`, `vault/port-notes`). A Claude session works
  on the branch its session names.
- **Days, not weeks.** A branch that cannot merge within a few days is too big: split it, or merge what is done
  behind a switch that is off.
- **Rebase onto `main`** to catch up; do not merge `main` into the branch. Merge commits on a branch are noise.
- **Squash-merge** a pull request once the owner says yes ([[Ask Before Deploying]]), so `main` reads as one commit
  per change, and delete the branch.
- **No integration branches.** Two changes that depend on each other go in order, the first merged before the second.
- **No branches of generated output.** Renders and bakes live outside git ([[Generated Files Stay Out of Git]]).
