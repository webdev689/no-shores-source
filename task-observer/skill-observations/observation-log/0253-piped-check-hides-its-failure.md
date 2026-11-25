---
id: 253
title: "A check piped through tail hid its failure, and the && chain committed unformatted files"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "every 'X --check | tail -1 && git commit' chain this session; only the one prettier check went through, its commit amended before any push"
area: "Checks before a commit (prettier, eslint, cargo xtask repo)"
date: 2026-11-25
session_context: "The desktop app session, lane 1's commit: 'npx prettier --check desktop/src/*.ts | tail -1 && git add ... && git commit' printed [warn] for two files and committed them anyway."
parked_until:
resolved:
resolution:
reference:
commands_verified: "npx prettier --check desktop/src/*.ts | tail -1 -> exit 0 though prettier found two files; amended after 'npx prettier --write' (tested offline)"
---

A pipe's exit code is its last command's, so a check piped through tail or grep to shorten its output always
passes an && chain. Proposal for the owner: the Toolkit's commands section says to run a check whose result gates
a commit without a pipe, or under 'set -o pipefail'.
