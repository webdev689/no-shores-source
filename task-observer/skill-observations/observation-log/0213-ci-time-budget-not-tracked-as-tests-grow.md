---
id: 213
title: "CI's check ran past its 45-minute limit twice with every test passing: no one tracks what a feature's tests add to the job"
parked_until: "PR #242 merge"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md", ".github/workflows/ci.yml"]
siblings_checked: "family: CI and test cost (0103 covers timing-sensitive tests run alone, not the job's total). checked: this is the job budget, no other entry covers it."
area: "no-shores-source, CI"
date: "2026-11-24"
session_context: "First Breach (#182), second audit: the check job at e092aa84 was cancelled at 45 min in the client build, twice (one re-run), after 4,129 TS and every Rust test passed. The previous head passed in 33 min."
commands_verified: "gh api .../jobs/<id>/logs step timings: Rust tests 18 -> 26 min, TS tests 8.5 -> 12 min, room lib 177 s -> 328 s (924 -> 955 tests); every Breach test 3.5 s+ alone on one core (79 tests, 187 s of 561 s) as each opens a run that bakes a navmesh. Owner chose: raise to 60 and slim the heaviest tests."
---

- Workers add tests freely, each "cheap" locally on many cores (the room lib's wall time did not grow on this
  machine), while CI's runner has fewer cores and was 1.4 times slower that day. Nothing measures a feature's added
  CI time until the job times out, and a timeout looks like a flake ("every test passed").
- A shared setup cost was the real driver: 79 tests each opening a Breach run and baking its navmesh again.
- Proposed: worker briefs say to keep each new test under about 1 s on one core and to report their slowest; the
  Toolkit gets a one-line recipe to time a test binary's tests alone (`$BIN --list`, then `--exact <name>
  --test-threads 1`), and the controller compares the CI job's step times before and after a large branch.
