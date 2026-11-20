---
id: 17
title: "The controller removed finished worktrees whose scratch folders running workers' briefs still named"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "0013 (remove merged worktrees) is the rule this sharpens: it said when to remove, not what else reads the folder"
area: "fanning out: cleaning up after merges"
date: 2026-11-20
session_context: "Sea audit and fix rounds: four read-only audit worktrees removed while three fix workers' briefs pointed at their scratch."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: grep -rl for the removed scratch paths in the running worktrees found none; the briefs (brief-fix-fight.md, brief-dfo-aim.md, brief-fix-look.md) named them"
---

**Issue:** Following 0013's rule (remove a worktree once its work is merged), the controller removed four audit
worktrees with `git worktree remove --force`, which deletes their untracked `scratch/` folders. Three running workers'
briefs still named those folders as their starting material (staging scripts, throwaway tests). The check for
references came after the removal, not before.

**Suggested improvement:** Before removing a worktree, grep every running worker's brief and inbox under
`~/wt/reports/` for its path; keep it while any names it. Better as a barrier: a `remove-worktree.sh` in the kit that
refuses while a brief of a running worker (a live pid file) names the path. Briefs should also tell a worker to copy
what it needs from another worktree into its own at the start.

**Principle:** A shared folder outlives the job that made it while anything still names it; check readers before
deleting, not owners alone.
