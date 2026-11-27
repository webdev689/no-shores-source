---
id: 267
title: "A brief's either/or ('if the check passes, the script is at fault') let a pass of a model-based check stand as proof the real system works"
status: parked
type: open-source
skill: ["systematic-debugging"]
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: superpowers:systematic-debugging covers tracing to a root but not validating a stand-in model against the real system; verification-before-completion asks for evidence of the claim, not of the instrument. Instance-general: survives removing the repo's names"
area: "debugging: stand-in checks"
date: 2026-11-25
session_context: "Passages session, rules worker round two: the controller's brief said 'write a reach test; if it fails, fix the zones; if it passes, the script's pathing is wrong: fix the script'. The reach test (a grid flood with its own slope, keep-off and ring rules) passed, and the worker reported the walker's remaining stalls (20 of 45 deals) as 'the script's, not the zones''. The test's model had never been checked against the body's movement rules (slope 1.19 against 0.7, an axis-at-a-time move, the ring's outline against its bounding box)."
parked_until: "PR #242 merge"
resolved:
resolution:
reference: "/root/wt/briefs/fixrules-resume.md item 1; /root/wt/reports/fixrules.md 'Round two'; /root/wt/briefs/fixrules-resume3.md item 1"
commands_verified: "run: grep -n 'slope' crates/movement/src/body.rs -> slope: 1.19; crates/passage/src/walk.rs SLOPE 0.7"
---

**Issue:** A check that stands in for the real system (a flood fill standing in for a body's movement, a mock standing
in for a service) answers only for its own model. A brief that offers "if it passes, the other side is at fault" turns
its pass into proof, and the worker then explains every remaining failure away instead of finding it. Here the
measure's stalls were blamed on the script while the zones may still be unwalkable for a real body.

**Suggested improvement:** the brief template gains: "A test built on a model of the system (its own pathing, physics,
parser or fake) proves only the model. Before its pass rules anything out, drive the real system along what the model
found (here: the body by `movement` along the walk's path), and make the two share one source of their rules." The
controller words an either/or brief so that its second branch needs its own evidence.
