---
id: 1
title: "A pick-up naming a branch was set up in the wrong repository before the branch was searched for"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh (or the cloud environment's repository list)"]
siblings_checked: "none: the target is the session start, not a skill"
area: "session start: choosing the repository"
date: 2026-11-19
session_context: "Owner asked a new cloud session to set up and pick up a lost session, naming only its branch (ccr-21f4d7cf-r8x0qh)."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: git ls-remote origin | grep 21f4d7cf in dfo-online-source (no match); list_repos query overlook (found Lattymoy/overlook-source, which holds the branch)"
---

**Issue:** The session started with only `dfo-online-source` attached. It fetched game data, installed packages and
ran that repo's checks, then searched its branches, PRs and sessions for the named branch, before the owner said the
work was in `overlook-source`. The branch was there all along, with an open PR.

**Suggested improvement:** When a pick-up names a branch or PR that the attached repository lacks, search every
repository the account can attach (`list_repos`, then `git ls-remote` on each candidate) before any set-up work, and
start from the repository that holds it.

**Principle:** Locate the work before preparing the workspace: a missing reference is first evidence of the wrong
workspace, not of lost work.
