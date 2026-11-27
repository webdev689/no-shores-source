---
id: 208
title: "Feature workers' tests pass while the feature never runs on the real path; an independent per-area review found it"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "brief-common-template.md (asks for failing tests first and a ponytail review of the diff; nothing asks a test to drive the real call path end to end)"
area: "feature workers' tests and the review before a pull request"
date: 2026-11-24
session_context: "Playtest notes built by four workers, each with unit tests that failed first and a review of its own diff, then three PRs green in CI. The owner asked for an audit; eight read-only reviewers by area found: the Lattice's blow details tested by feeding frame numbers straight to the drawing, while the real path (the rules' windup ending in idle) never reached the strike or landing; a patrol node's return counted in room ticks, which stop while a room is empty; far woods painted by the terrain still taking the sky's glare after the leaf fix; other riders' boost thought unsent when the body carried it; notes and older decisions left saying the old behaviour. The invisible public event's likely cause (512 module fetches burst at a rate-limited host with no retry) was found by reading the server-and-network path the offline runs never exercised."
parked_until: "PR #242 merge"
resolved:
resolution:
reference:
commands_verified: "curl -sI on the 42 event module meshes (all 200, last-modified 2026-11-21)"
---

**Issue:** A worker's tests prove the unit it wrote, not that the feature reaches the player: a function fed the
inputs the worker imagined passes, while the state machine upstream never produces those inputs. Self-review of a
diff shares the worker's blind spot, and CI is green on code that never runs.

**Suggested improvement:** In the worker brief: for each behaviour the owner asked for, one test drives the real
call path from the rules' or the room's own output to what is drawn or sent (not a helper fed hand-made inputs).
In the controller's procedure: before a feature PR leaves draft, one independent read-only reviewer per area,
briefed with the owner's words and told to trace callers and the state that feeds the change.

**Principle:** A test that skips the path the data really takes proves the helper, not the feature; review by
someone who did not write the code, tracing upstream state, is what finds it.
