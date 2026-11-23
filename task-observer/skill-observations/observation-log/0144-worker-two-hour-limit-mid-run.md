---
id: 144
title: "Feature workers hit the 2 h background limit mid-run, one with 200 files uncommitted"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "the tithe, ruins and travel workers"
area: "long feature workers"
date: 2026-11-23
session_context: "Overlook #155: the tithe worker (a rename across ~200 files plus a new clash system) reached the 2 h limit with four commits and 62 files uncommitted after an inbox nudge; the ruins worker hit it mid-pictures. Both were resumed with a 'commit what you have, then continue' brief and finished."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: git -C ~/wt/tithe status showed 202 changed files and no commit an hour in"
---

**Issue:** A feature too big for one 2 h run loses its state unless committed; the brief's "commit as you go" was not
enough without a nudge.

**Suggested improvement:** The common brief asks for a commit at each named step and run-worker.sh warns at 90 minutes
through the inbox; the controller splits a feature that renames across the tree from one that builds a system.

**Principle:** A worker's progress is what it committed.
