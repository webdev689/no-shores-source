---
id: 254
title: "Auditing a branch that merged main: its own change is HEAD^2..HEAD, and path loops need a real parser"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "0248 (a read-only audit needs a pinned commit): same section; that one is about the tree moving, this about the range and the tools"
area: "Audits (read-only audit agents)"
date: 2026-11-25
session_context: "The desktop app's five-lane audit at a pinned worktree (16d6063a, a merge of origin/main): the notes lane reported these in its OBSERVATIONS line."
parked_until: "PR #244 merge"
resolved:
resolution:
reference:
commands_verified: "reported by the audit agent: '672294ee..HEAD includes the merged main's ship work; HEAD^2..HEAD is the branch's own change'; 'a Bash link-check loop split file paths with spaces and hung; a Python script worked'; 'auto mode refused a read-only git merge-base HEAD origin/main; git show --stat HEAD as Irreversible Local Destruction'"
---

Three things for the Toolkit's Audits section, each from an audit worker this session:
1. A branch that merged main carries main's work in base..HEAD; brief the auditor with the branch's own range
   (for a merge commit at the head, HEAD^2..HEAD, or the diff against the merge base).
2. The bible's file names hold spaces, so a shell loop over them splits; a link check belongs in Python (or
   'find -print0' and 'read -d ""').
3. The auto-mode classifier refused a read-only 'git merge-base' with 'git show --stat' as destructive; brief
   workers to run such reads one command a call.
