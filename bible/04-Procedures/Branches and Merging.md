---
type: procedure
---
# Branches and Merging

- **`main` always passes** `cargo xtask check`. Nothing merges red.
- **One branch, one change.** Name it for the change (`sea/wave-height`, `vault/port-notes`). A Claude session works
  on the branch its session names.
- **Days, not weeks.** A branch that cannot merge within a few days is too big: split it, or merge what is done
  behind a switch that is off.
- **Merge `main` into the branch** to catch up. Never rewrite a branch once pushed: its pull request and other
  sessions read it.
- **Merge in one step, trailers included:** `git merge --no-ff -m "<message>" -m "<trailers>" <branch>`, each `-m`
  a paragraph, the trailers one to a line. Never amend after a merge: one that fast-forwarded made no commit, so the
  amend rewrites the branch's own last commit. The commit-msg hook refuses a Claude session's merge without its trailer,
  so a session catches up with `git fetch` and that merge of `origin/main`, not `git pull`; a merge it stopped is still
  open, finished with `git commit -F - <<'EOF'` and the trailers.
- **Merge a pull request with a merge commit** once the owner says yes ([[Ask Before Deploying]]), so `main` reads as
  one merge per change, and delete the branch ([[Only the Garrison's Own Kills Share Its Clear, and a Failed Trip Goes Back to the Beach]]).
- **No integration branches.** Two changes that depend on each other go in order, the first merged before the second.
- **No branches of generated output.** Renders and bakes live outside git ([[Generated Files Stay Out of Git]]).
