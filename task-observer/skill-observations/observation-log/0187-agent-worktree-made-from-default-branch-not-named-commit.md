---
id: 187
title: "An Agent isolation worktree starts from the default branch, not the controller's branch; a brief naming a base commit must say how to get onto it"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: worker briefs and worktree setup (0030, 0098, 0125, 0146 cover shared target dirs and generated links; none covers the worktree's base). checked: this one is about the base commit alone."
area: "no-shores-source, delegated workers"
date: "2026-11-24"
session_context: "First Breach audit (#182): the rules worker, started with isolation worktree and told its base was bf490784, found its worktree at main's 19b248ba."
commands_verified: "Worker's report: worktree branch at 19b248ba; git reset --hard on its clean tree was refused by the permission guard; it made claude/breach-rules-fixes from bf490784 instead, and its commits cherry-picked cleanly onto the controller's branch."
---

- The worker's brief said "your own git worktree (made from commit bf490784)", which was the controller's
  assumption, not what the harness does: the worktree came from the default branch. Had the worker not checked, every
  test result would have been against main, not the Breach branch.
- The worker's fix (a new branch from the named commit, inside the worktree) worked and cherry-picked cleanly. A brief
  can say so up front: "first `git switch -c <name> <base>`; your worktree starts on main".
- The same worker found the permission guard refused `python3 -I - <<EOF` and `cat >> file <<EOF` inside its
  worktree, while `git commit -F - <<EOF` passed; it wrote helper scripts in the scratchpad instead. Worth a line in
  the worker brief's template.
