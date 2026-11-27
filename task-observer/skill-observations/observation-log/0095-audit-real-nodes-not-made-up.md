---
id: 95
title: "Room tests on made-up nodes missed a road that could not be finished; a test over the real baked nodes caught it"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is the workers' brief template"
area: "testing data-driven content against the real world it names"
date: 2026-11-21
session_context: "The quest builders' room tests used made-up nodes; an auditor loading the real baked nodes found one road's foe group never stood (its place's middle off the mesh), so that road could not be finished."
parked_until: "PR #242 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #242, merged 2026-11-27"
reference:
commands_verified: "the auditor's probe over generated/nodes; the rules builder's test baking the first landmass with bake::nodes_of (about 10 s)"
---

**Issue:** Content that names places in a generated world (quest goals naming a layout's areas) passed every test
built on hand-made fixtures, yet one goal could never be met in the world as baked.

**Suggested improvement:** The workers' brief: when data names things a generator makes (places, nodes, spawns), one
test must run that data against the generator's real output, in the normal test run.

**Principle:** Test content against the real world it names, not only against fixtures shaped like it.
