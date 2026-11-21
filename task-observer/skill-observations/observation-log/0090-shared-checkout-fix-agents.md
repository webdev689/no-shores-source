---
id: 90
title: "Fix agents sharing one checkout work when each owns its files and none writes to git"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none"
area: "fanning out: several fix agents in one checkout"
date: 2026-11-21
session_context: "After five audits, three fix agents (ui, repo, screens) fixed findings at once in the branch's own checkout, then the controller committed each agent's work."
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/fix-common.md"
commands_verified: "three agents ran together for about 35 minutes; no file was edited by two agents, and the whole TS suite passed after each commit (2658 tests)"
---

**Issue:** Worktrees cost a full install and build each. Agents that share one checkout clash unless each owns
disjoint files and makes no git writes.

**Suggested improvement:** The brief template gets a shared-checkout mode with these rules:
- a file list per agent;
- the controller's notes and thread files are named as the controller's;
- no `git add`, `commit`, `stash`, `checkout`, `restore`, `reset` or `clean`;
- wording wanted in a controller's note goes in the report;
- each fix is proven red, then green.

**Principle:** Split the work by file ownership, and let one hand commit.
