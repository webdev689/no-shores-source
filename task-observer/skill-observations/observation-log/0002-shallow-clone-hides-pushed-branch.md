---
id: 2
title: "A shallow single-branch clone tracks only main, so a pushed branch reads as unpushed"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh"]
siblings_checked: "none: the target is the kit's install script, not a skill"
area: "session set-up: the clone's fetch refspec"
date: 2026-11-19
session_context: "Recording the owner's waters decisions in overlook-source on a branch stacked on the ships PR."
parked_until:
resolved: 2026-11-20
resolution: "install-all.sh tracks the checked-out branch; Toolkit.md says to track a new branch before its first push (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "run: git ls-remote origin refs/heads/claude/waters-from-islands (same sha as HEAD); git rev-parse @{u} (failed: not stored as a remote-tracking branch); after adding a refspec per branch and fetching, @{u}..HEAD counted 0"
---

**Issue:** The repo was cloned with `git clone --depth 1`, which fetches one branch. `install-all.sh` adds only
`refs/heads/main` to `remote.origin.fetch`. Pushing a new branch with `-u` then stored no remote-tracking ref, so the
Stop hook reported 18 unpushed commits and no remote branch for a branch GitHub held at the same commit.

**Suggested improvement:** In `install-all.sh`, beside the line that adds main's refspec, also add one for the branch
checked out in `REPO_DIR` when it is not main. And say in `Toolkit.md` to add a refspec for each new branch before its
first push: `git config --add remote.origin.fetch "+refs/heads/<b>:refs/remotes/origin/<b>"`.

**Principle:** A narrowed clone narrows every later check of what is pushed: widen the tracked refs to every branch the
session works on, or the check reads its own blind spot as unpushed work.
