---
id: 5
title: "'Tested' claims rested on pictures and a check older than the last commit they described"
status: actioned
type: open-source
skill: ["superpowers:verification-before-completion"]
proposes_skill: []
target_file: ["CLAUDE.md"]
siblings_checked: "none — no skill-families.md in this workspace; CLAUDE.md's 'Verify before claiming' is the project's rule"
area: "Verify before claiming: the evidence's age against the change it covers"
date: 2026-11-20
session_context: "Auditing #95: the PR text and Hand-off said tested offline for the head, after a later fix commit"
parked_until:
resolved: 2026-11-20
resolution: "Applied on PR #96, waiting on the owner's merge: cargo xtask check ends with 'checked <commit>, nothing uncommitted'; CLAUDE.md asks a run not of the head to name its commit (first review, 2026-11-20)."
reference:
commands_verified: "read (by the auditor): file times of build-after.log (11:58) and the shots (to 12:17) against commit 87729cf (12:24) and head 5394a26 (12:25)"
---

**Issue:** the pull request's "How it was tested" and the Hand-off described the head commit as tested offline, with
headless pictures and a full check. The pictures came from a build of the first commit; a later commit changed the
land step, the aim's hold, the no-camera case, the words' columns and the thirds. The full check did run on the final
tree (just before its commit, and CI passed on the head), but nothing in the record showed which run covered which
commit, and the pictures did not cover the head at all. An auditor caught it by comparing file times.

**Suggested improvement:** when writing "tested", name the commit each run covered (the build's and the check's), or
re-run after the last change; a check of evidence times against the head before a PR's text is written would catch
this mechanically.

**Principle:** evidence covers the code as it was when the evidence was made; a claim about the head needs runs made
on the head, or must say which commit its evidence covers.
