---
id: 180
title: "The common brief names `$WORKER_INBOX` as if it were set, but it is only a path in the task text; files sitting at 593-599 lines turn any edit into a size violation"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "checked: both the outpost-sites and outpost-room workers met files at the line limit (garrison.rs 599, room-wasm/lib.rs 593); gearWindow.ts sits at 600 for the page worker"
area: "headless workers: the common brief's inbox and the line limits"
date: 2026-11-23
session_context: "Guild outposts session: the outpost-room worker's OBSERVATIONS said `$WORKER_INBOX` is a path in the task text, not a set environment variable; that a size fix once pushed garrison.rs to 601 lines after cargo fmt wrapped an edit, caught only by `cargo xtask repo`; and that room-wasm/lib.rs at 593 lines forces new doors into new files."
parked_until: "PR #242 merge"
resolved:
resolution:
reference: "/root/wt/reports/outpost-room.log (OBSERVATIONS line)"
commands_verified: "run: python3 tools/claude-toolkit/workers/audit.py /root/wt/outpost-room -> MISSING (defect): none; FIRST3 ok"
---

**Issue:** The brief tells a worker to re-read `$WORKER_INBOX`, which reads as a shell variable, but run-worker.sh only
writes the path into the task text, so `cat $WORKER_INBOX` reads nothing. Separately, several hot files sit within a
few lines of the 600-line limit, so a worker's one-line change (or cargo fmt's wrapping of it) breaks the rule, and
only `cargo xtask repo` says so, late.

**Suggested improvement:** run-worker.sh exports `WORKER_INBOX` into the worker's environment (or the brief says "the
inbox path in your task"). The common brief adds: "before editing a file over 580 lines, plan to move a part out whole;
run `cargo xtask repo` after `cargo fmt`, not before." A short list of files at the limit could live in Toolkit.md.
