---
id: 225
title: "Agent-tool worktrees start from main, not the working branch, and a fixer sub-agent has no Agent tool for the reviewer its rules require"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: run-worker.sh workers get a worktree from the branch named in their task; only the Agent tool's isolation worktree starts from main. The worker template's reviewer step assumes an Agent tool."
area: "parallel fixers in Agent-tool worktrees"
date: 2026-11-24
session_context: "PR #194 audit fixes: six general-purpose agents with isolation worktree. Every one found its worktree at main 6251cad3, without server/bot, and had to reset to the working branch's head before starting; two were refused the reset by the auto-mode classifier and branched instead. None had the Agent tool, so the brief's 'spawn one reviewer' step became a code-review skill run or a self-review. Their worktrees also lacked node_modules and generated/, linked by hand."
parked_until:
resolved:
resolution:
reference:
commands_verified: "read: each fixer's report (WORKTREE, BRANCH, base notes); git worktree list showed each branch at its own commit on dac43e74"
---

**Issue:** The Agent tool's isolation worktree is cut from main, not from the branch the controller is on, so a fixer
for a feature branch starts without the code it must fix. Each fixer spent its first steps resetting (and some were
refused). The shared rules also told each fixer to spawn a reviewer agent, which a sub-agent cannot do.

**Suggested improvement:** In the Toolkit's Workers section and the brief template, say: for Agent-tool fixers, give
the base commit and have their first command be `git reset --hard <base>` on the clean worktree (or use run-worker.sh,
which takes the branch); link node_modules and generated/; and replace "spawn a reviewer" with "run the code-review
skill on your diff" for sub-agents, keeping one independent reviewer agent run by the controller after the merge.

**Principle:** A delegated worker's starting point and tools must be stated, not assumed: a brief that names a step its
worker cannot take gets that step silently replaced.
