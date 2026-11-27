---
id: 105
title: "A cloud clone's local main is stale, so an audit brief that says main...branch hands the auditor 1,350 files"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "Toolkit.md's Audits section names the brief's scope but not how to name a diff range; brief-common-template.md not read for this"
area: "audits, git ranges"
date: 2026-11-22
session_context: "Auditing PR #143: the brief said `git diff main...ccr-e806aa9f-fngvgz`. Local main and origin/main were at #98 (4da959f5) while the branch started at #136 (011da6bf), so the range showed 1,350 files; a correction (`011da6bf..branch`) was sent mid-run. Main had also moved on to f8d220cc with seven conflicting files, found only by fetching."
parked_until: "PR #244 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #244, merged 2026-11-27"
reference:
commands_verified: "run: git log -1 main and origin/main both 4da959f5 before `git fetch origin main`; after it f8d220cc; `git merge-tree --write-tree --name-only HEAD origin/main` listed the seven conflicts without touching the tree"
---

**Issue:** A cloud session's clone does not keep `main` current, so `main...branch` in an audit brief is wrong without
anyone noticing, and a pull request can sit unmergeable against the real main while every check passes on the branch.

**Suggested improvement:** Toolkit.md's Audits section: before writing a brief, `git fetch origin main`, name the
range as `<merge-base>..<branch>`, and run `git merge-tree --write-tree --name-only HEAD origin/main` so conflicts
with main are a finding of their own.

**Principle:** Name a diff by commits, not by a branch ref the session never fetched.
