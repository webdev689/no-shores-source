---
id: 151
title: "Work held for the owner sat on a local worktree branch (wt/fblade) never pushed, so it was lost with the container and the bible still points at it"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md", "CLAUDE.md"]
siblings_checked: "checked: run-worker.sh is the only worker launcher and its worktrees are all wt/<name>; the same loss applies to any wt/ branch a worker or the main session leaves unpushed, not only fblade; same family as 0069 (a picture harness kept only in a session scratchpad, lost at pickup): both are session-only state a pickup finds gone"
area: "keeping held or unmerged work alive across ephemeral cloud containers"
date: 2026-11-23
session_context: "Pickup of claude/bible-dungeon-matchmaking-5421wl: bible/Hand-off.md, Open Questions and the decision 'Faction Blades Wear Their Faction's Colour on Hilt and Trim' all say the faction blades are 'built on the branch wt/fblade', held by the owner. git ls-remote origin (290 refs) has no wt/fblade and no branch matching blade or trim; the earlier session's container is gone. The owner has since made the call that unblocks it (the Veiled's faint cold violet), and the work must be redone. The same pickup found the branch's last two decision commits pushed but with no pull request and no hand-off rewrite: the earlier session ended before its end-of-session steps."
parked_until: "PR #242 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #242, merged 2026-11-27"
reference:
commands_verified: "run: git ls-remote origin | grep -iE 'blade|faction|trim' -> only claude/enemies-factions-ai-fiapxf and claude/game-experience-factions-94un6s; no wt/fblade"
---

**Issue:** A worker built the faction blades on a worktree branch, `wt/fblade`, and the owner held it. The branch was never pushed. Hand-off, Open Questions and the decision note all name it as where the work lives. In a cloud session the container is reclaimed when the session ends, so the branch went with it. The next session found the bible pointing at a branch that does not exist on the remote, just as the owner's call made it buildable. Nothing in the end-of-session steps (claude-mem save, headroom learn, hand-off rewrite, toolkit-data save) checks for local branches missing from the remote.

**Suggested improvement:** Add an end-of-session check to `tools/claude-toolkit` and CLAUDE.md's "At the end" step: list every local branch (`wt/*` included) whose head is not on `origin`, then push each one under a durable name (for example `held/<name>`) or say plainly that it will be lost. The worker brief template should also have workers push their branch when they finish, so a brief that ends "held by the owner" leaves a remote branch. A note that names a branch as the home of held work should name a remote branch.

**Principle:** In an ephemeral workspace, work that stays only on a local branch is lost when the workspace goes, and a durable record that points at that branch becomes a dangling reference. Before the session ends, push anything held, or record that it was dropped.

**Related:** 0069 is the same failure shape for a scratchpad harness. The fix here covers branches; 0069's covers harness files.
