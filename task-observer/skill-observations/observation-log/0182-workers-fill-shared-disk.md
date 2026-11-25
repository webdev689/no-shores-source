---
id: 182
title: "Parallel workers' build folders filled the shared disk mid-run (7 to 20 GB a worktree; seen twice), and a brief changing shared words left out the server test that pins them"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: every worktree of the session (sites, room, delve, page, modules, three fix workers) kept its own target/ of 2 to 7 GB; the main checkout's was 19 GB"
area: "headless workers: disk headroom and cross-scope checks"
date: 2026-11-24
session_context: "Guild outposts session: two of three parallel fix workers reported in their OBSERVATIONS that the shared volume reached 0 MB mid-run, which lost command output until each deleted its own incremental cache. The controller then found the disk at 100% (561 MB free) and freed 26 GB by deleting the target/ folders of five already-merged worktrees. The fix-page worker also changed bannerLaw.ts's words, which server/accounts/guildFace.test.ts pins, a file its brief forbade it to touch."
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/fix-rules.log and fix-page.log (OBSERVATIONS lines)"
commands_verified: "run: df -h / -> 100% (561M free); after rm -rf of five merged worktrees' target/ -> 62% (27G free)"
---

**Issue:** Each worktree builds its own `target/` (Rust debug, wasm and incremental caches, 2 to 7 GB), so several
workers at once plus finished worktrees left in place fill the disk, and a full disk silently drops every command's
output. Separately, a brief that lets a worker change words in a shared client file (here bannerLaw.ts's refusal) but
forbids the server folder leaves a pinned test failing that the worker cannot fix.

**Suggested improvement:** run-worker.sh checks `df` before starting and refuses under some 15 GB free, sets
`CARGO_TARGET_DIR` per worker to one folder it removes on finish (or shares the main checkout's with
`CARGO_INCREMENTAL=0`), and stop-worker.sh deletes a merged worktree's `target/`. The common brief adds: "when you
change words or numbers in a file other folders import, grep the whole repo's tests for the old text and name in
your report any you may not edit."

**Second instance (2026-11-25, passages session):** after the merge worker exited, the disk stood at 100% (482 MB
free): its worktree's `target/` alone was 20 GB (a merge rebuilds every crate both sides touched) and the finished
finish worker's 8.2 GB. Removing both freed 28 GB. Nothing removed them on exit, so the controller found it only by
chance before starting `cargo xtask check`. Second occurrence with no fix actioned: the improvement must be the
structural one above (run-worker.sh deletes the worktree's `target/` when the worker exits 0 after writing its
report, and refuses to start under 15 GB free), not a sentence in a brief.

