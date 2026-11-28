---
id: 203
title: "Geometry tests measured boxes against an idealised shape (smooth rounds, a pyramid as a cone, tilts by sin) instead of what the page actually draws, so real misfits of up to 37 m passed; five independent read-only audits found them"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.local.md"]
siblings_checked: "none: no skill owns test-oracle design; the habit belongs in the project's working notes and any review checklist"
area: "choosing what a test measures against (its oracle)"
date: 2026-11-24
session_context: "No Shores, PR #186 deep audit. hug_tests.rs measured every round as a smooth circle while solidMesh.ts draws an n-gon and a dome in 2-8 rings (boxes stood 0.5-1.6 m off the drawn mesh); tilt_reach used sin|angle|, which falls to 0 at pi, so mill sails rolled 3.54/5.11 rad were boxed 34-37 m off and wholly left out; no test used an angle past 1.39 rad; the halving cap returned whole boxes while the budget reported a fit; the prop-parts tests read their tolerances from the code under test."
parked_until: "PR #244 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #244, merged 2026-11-27"
reference:
commands_verified: "run: cargo test -p city --lib (after switching distance_to to the drawn polygon/ring model) -> every_shape test failed at 0.50 m off for a 16-sided dome; a_shape_tilted_past_a_right_angle test failed with 12 m left out before the chord fix; node --test propParts.test.ts top-to-mesh test failed at 0.665 m with the old 0.5 m columns"
---

**Issue:** The tests that guarded a geometric promise ("no box stands more than 0.45 m off what is drawn") built their
own model of "what is drawn" from the same idealisation the code used (smooth rounds, small angles), so they agreed
with the code by construction. They also sampled only the input ranges the author had in mind (leans under 1.4 rad),
and some read their tolerance constants from the module under test, so a changed constant changed the test with it.
Fresh read-only auditors, given the code and not the author's conclusions, found each gap within one pass.

**Suggested improvement:** For any test of a "keeps within X of what the user sees" promise: (1) build the oracle from
the artefact the user sees (the rendered mesh, the drawn polygon), not the author's model of it; (2) sweep the full
input domain the data can hold (angles past pi, ellipses, the widest and tallest real instances), and grep the real
data for its extremes first; (3) never import the tolerance under test from the module under test; (4) after a
multi-day feature, run independent read-only audits by dimension before calling it complete.

**Principle:** A test whose oracle shares the implementation's assumptions can only confirm them; measure against
the thing the user experiences, over the inputs the data actually contains.
