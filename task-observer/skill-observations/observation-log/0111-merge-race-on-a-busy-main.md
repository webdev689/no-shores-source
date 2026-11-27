---
id: 111
title: "On a busy main, waiting for a PR's own CI before merging is a race that is never won; and a network-fetching test blocked a deploy"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", ".github/workflows/ci.yml"]
siblings_checked: "checked: concerns the project's merge procedure and CI, not a skill"
area: "merging under the owner's yes while main moves; CI tests that fetch from R2"
date: 2026-11-22
session_context: "Overlook #131 (houses' roads): after the owner's 'merge and deploy', main merged five other PRs while #131 waited; main was merged into the branch three times (each a 12 to 25 minute full check plus a 25 minute CI run). The merge's own main run then failed on shipTags.test.ts fetching hull meshes from R2 (HTTP 500); #134's run deployed the roads."
parked_until: "PR #240 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #240, merged 2026-11-27"
reference:
commands_verified: "cargo xtask check on 9ea1a315 (== the merged tree); main's ci run 44966606091 green with rooms and pages deployed"
---

**Issue 1:** Each catch-up (merge main, full check, push, wait for the PR's CI) took about 40 minutes, and main moved
within each window, twice. What ended it: merge main, run `cargo xtask check` locally on the exact tree to be merged,
push, and merge at once with `expectedHeadSha`, since main's own CI gates the page and rooms deploys.

**Improvement:** Write that procedure down in the project's merge notes, for when the owner has said yes and main is
busy: the local full check on the merge tree is the gate, and main's run is the deploy's gate.

**Issue 2:** `client/src/ships/shipTags.test.ts` fetches published meshes from R2 on every CI run (the runner's temp
folder starts empty), so a brief R2 500 failed main's check and skipped both deploys.

**Improvement:** Cache the fetched meshes in CI (keyed on `content/ships/ships.json`); a workflow change, so the owner's
agreement first. Never skip the test.
