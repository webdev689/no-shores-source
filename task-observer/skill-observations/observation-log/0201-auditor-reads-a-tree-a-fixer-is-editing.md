---
id: 201
title: "An audit agent run in the same checkout while the lead edits fixes reads a moving tree, and must fall back to git show HEAD"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked — applies to any read-only worker run beside edits in one checkout; no skill owns worker briefs here"
area: "parallel audit and fix in one checkout"
date: 2026-11-24
session_context: "Revives branch (#184): the lead fixed code findings while a background agent audited the bible notes against the code. The agent saw footRevive.ts, checkpoints.rs, left.rs and lib.rs change under it and switched to git show HEAD:<file> to keep its claims about one commit."
parked_until:
resolved:
resolution:
reference: "the agent's OBSERVATIONS line in its report"
commands_verified: none
---

**Issue:** An auditor reading files while another hand edits them can report a claim against code that a minute later is
different, or miss a fix. This one noticed and read `git show HEAD:<file>`. A worker that did not notice would mix two
commits in one report.

**Suggested improvement:** In the Toolkit's worker guidance: run a read-only auditor in its own worktree
(`isolation: "worktree"`), or say in its brief which commit it audits and to read files with `git show <commit>:<path>`.

**Principle:** A read-only worker needs a fixed snapshot to read when anything else may be editing the tree.
