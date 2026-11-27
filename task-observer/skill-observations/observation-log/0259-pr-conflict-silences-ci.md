---
id: 259
title: "A pull request with a merge conflict runs no CI, and six pushes went unchecked for three hours unnoticed"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked — 0227 (polling CI) and 0248 (masked steps) are about reading CI; this is about CI never starting"
area: "waiting on CI"
date: 2026-11-25
session_context: "PR #208 went 'dirty' when main took #201 (both rewrote the hand-off's merged entries). GitHub then made no pull_request run for 243fe9f9 through bf4d8e44; I was watching the freesound workflow (push-triggered) and only noticed when listing ci.yml runs showed the last at 13:15. mcp pull_request_read get showed mergeable_state: dirty. Merged main (1f425f61), regenerated the schema (npm run schema: crates/protocol/src/generated is ignored and stale after a merge), CI run 1098 started at once."
parked_until: "PR #244 merge"
resolved:
resolution:
reference: "https://github.com/Lattymoy/no-shores-source/pull/208"
commands_verified: "mcp__github__pull_request_read get (mergeable_state); npm run -s schema before cargo check after a merge"
---

**Issue:** After a push, the absence of a CI run looks like a run not yet finished. A PR that cannot merge gets no
pull_request run at all, so nothing says it is unchecked.

**Proposed:** Toolkit.md's CI section: after each push to a PR, confirm a ci.yml run exists for the new head; if none,
read the PR's mergeable_state and merge main first. After merging main, run `npm run -s schema` before `cargo check`
and `npm run types` (the generated protocol code is ignored and goes stale). Protection in play: none yet; needs the
owner's agreement as a rule.

**Instance (2026-11-26, #225, the bible's review):** #218 merged while #225 waited; its subscription event's first check found no check runs at all. `git merge-tree --write-tree HEAD origin/main` showed conflicts in `Hand-off.md` and `Open Questions.md`, and git's clean merge of `Decisions.md` silently put #218's new owner decisions under #225's new "Claude's calls" heading (both sides appended just above "## Replaced"). Caught only by a script checking each listed note's type against its section.
