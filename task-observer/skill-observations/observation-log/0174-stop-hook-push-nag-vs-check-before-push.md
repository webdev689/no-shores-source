---
id: 174
title: "The harness's Stop hook asks to push unpushed commits every turn while CLAUDE.md's 25-minute check must pass first"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the hook is the cloud harness's, not a kit skill; checked tools/claude-toolkit/hooks for a push hook (none) and .claude/settings.json (no Stop hook of the repo's)"
area: "pushing a branch after a long check"
date: 2026-11-24
session_context: "Whole-codebase audit: 15 commits waited for `cargo xtask check` (about 25 minutes) before the first push, as CLAUDE.md's Musts say. The harness's Stop hook ('There are N unpushed commit(s) ... Please push') fired at the end of every turn meanwhile, and each background-monitor event made a new turn, so it fired about a dozen times; each answer was a line saying the push waits on the check."
parked_until:
resolved:
resolution:
reference:
commands_verified: "none"
---

**Issue:** Two instructions pull against each other at every turn's end: the project says no push before the full
check passes, and the harness's Stop hook asks for a push whenever commits sit local. A monitor streaming the check's
steps turns each step into a turn, and each turn ends in the hook's request again.

**Suggested improvement:** In Toolkit.md (or CLAUDE.md's Commands), say: commit as each fix is done but start the full
check before the last commits' turn ends, watch it with one background command that exits on its end (not a
per-step monitor), and answer the hook once with "push waits on `cargo xtask check`", staying silent until it ends.

**Principle:** When a harness nag and a project gate disagree on timing, cut the number of turn ends during the wait
(one completion notice, not a stream), so the conflict is answered once rather than once per event.
