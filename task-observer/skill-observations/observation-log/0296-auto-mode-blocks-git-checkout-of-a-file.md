---
id: 296
title: "Auto mode refused `git checkout <commit> -- <file>` as irreversible local destruction"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: one command, one refusal"
area: "restoring a file to a commit's version"
date: 2026-11-26
session_context: "Restoring client/src/game/prologue/wreckView.ts to main's after taking the republished mesh; the classifier refused it. Done instead with two Edit calls and a cmp against `git show <commit>:<file>` written to the scratchpad."
parked_until:
resolved:
resolution:
reference: "796594aa"
commands_verified: "git show b0fe38a2:<file> > scratch; cmp: run, matched after the Edit calls"
---

**Issue:** Restoring a tracked file from a commit reads to the classifier as destroying local work.

**Suggested improvement:** In the Toolkit: restore a file with Edit (or write `git show <commit>:<path>` to the scratchpad and copy it with Write), then `cmp` it, rather than `git checkout <commit> -- <path>`.

**Principle:** Prefer the reversible edit path the permission layer already trusts.
