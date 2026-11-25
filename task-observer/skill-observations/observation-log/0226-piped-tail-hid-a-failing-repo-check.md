---
id: 226
title: "A worker's cargo xtask repo piped through tail hid its failure and let a commit through"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "CLAUDE.local.md"]
siblings_checked: "family: commands run through tail or grep for brevity. checked: no entry covers a pipe swallowing a check's exit status."
area: "no-shores-source, regions worker"
date: 2026-11-25
session_context: "The regions worker ran `cargo xtask repo | tail` before committing; the pipe's status was tail's, so a failing repo check passed unnoticed and the commit went in, fixed later by an amend. The same worker had to revert its whole first cut when the owner changed the plan mid-item, and found that planning extra gate areas reshuffles every later layout step, so it added crossings after planning. CLAUDE.local.md itself advises piping long commands through tail."
parked_until:
resolved:
resolution:
reference:
commands_verified: "git log /root/wt/cut (6fe5d6a6 amended after the hidden failure)"
---
Proposed: the template says a check that gates a commit runs with `set -o pipefail` (or its status read before
any pipe), and the pre-commit hook runs `cargo xtask repo` itself so a commit cannot pass a failing one.
