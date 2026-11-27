---
id: 294
title: "A pull request that conflicts with main gets no CI run at all, and main moved three times while the passages PR waited on CI"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/Branches and Merging.md"]
siblings_checked: "checked: ci.yml runs on pull_request; GitHub builds no merge ref for a conflicting PR, so the run never starts and get_check_runs returns none"
area: "waiting on CI for a long-lived PR while main moves"
date: 2026-11-26
session_context: "Passages sessions (#218, twice): after each push, get_check_runs returned no runs; git merge-tree HEAD origin/main showed conflicts with main's #217, #220 and the held map's lettering, each merged in turn. #220 also changed loot rates, so the band's test needed a retune after the merge, not only a text resolution."
parked_until: "PR #240 merge"
resolved:
resolution:
reference: "merges 32c4fd5a, 9cee20e6, ebeba3fd on ccr-1c146825-lrjepv"
commands_verified: "git fetch origin main && git merge-tree --write-tree HEAD origin/main: run, printed conflicts each time get_check_runs showed none"
---

**Issue:** No check runs after a push read as CI being slow; it was a conflict with main, which stops the pull_request run from being created at all. Each merge of main also brought rule changes (drop rates) that moved measured numbers the branch's tests pin.

**Suggested improvement:** After every push to a PR and before waiting on CI, run git fetch origin main && git merge-tree --write-tree HEAD origin/main; on a conflict, merge first. After merging a main that changed rules the branch measures (rates, pay), rerun the measurement tests, not only the conflicted files' tests.

**Principle:** Silence from CI is not progress: confirm the run exists before waiting on it.

**Another instance (2026-11-26, the #218 audit session):** after merging main and pushing, no CI run started and the PR read `dirty`: main had moved again (#222, a hand-off rewrite) between the fetch and the push, so the new head conflicted in `bible/Hand-off.md`. Fetching main again right before each push, and checking `git merge-base --is-ancestor origin/main HEAD`, caught it on the next push.
