---
id: 6
title: "A pick-up session started on the wrong repository and searched it for the branch"
status: declined
type: internal
skill: []
proposes_skill: []
target_file: [CLAUDE.md]
siblings_checked: "none"
area: "session start: picking up another session's branch"
date: 2026-11-19
session_context: "Set up tooling and pick up branch ccr-0f4acf2e-wd3195 (overlook-source#63)"
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: out of the repo's reach (a session started in another repository never reads this one); handed to the owner on 2026-11-20"
reference: "Handed to the owner 2026-11-20: no file in overlook-source reaches a session that starts in another repository; proposed a line for the owner's claude.ai preferences (review record, reviews/2026-11-20-overlook/REVIEW.md)."
commands_verified: "run: git ls-remote origin | grep 0f4acf2e on overlook-source printed refs/heads/ccr-0f4acf2e-wd3195"
---

**Issue:** The session was opened with dfo-online-source attached, not overlook-source. The prompt named only a branch
(ccr-0f4acf2e-wd3195). The session set up dfo-online-source's tooling and searched its refs, PRs and commits before
the owner said the work was in overlook-source. The branch was found at once with list_repos and add_repo.

**Suggested improvement:** When a named branch is missing from the attached repository, list the account's other
repositories (list_repos) and check each with git ls-remote before searching sessions or asking.

**Principle:** A named artifact that is missing where you looked may be in a sibling repository; check every
repository you can reach before concluding it does not exist.
