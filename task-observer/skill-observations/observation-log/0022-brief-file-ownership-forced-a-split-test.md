---
id: 22
title: "A worker brief's one-line file ownership forced a test into a file of its own"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is the project's worker brief template, not a skill"
area: "worker briefs"
date: 2026-11-20
session_context: "Overlook factions round, final audit's fix pass: fix3-rules was told to touch only one ware in npcWares.ts, which another worker owned, so its test went into a new shapeWares.test.ts"
parked_until: "PR #242 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #242, merged 2026-11-27"
reference: "/root/wt/reports/fix3-rules.md OBSERVATIONS"
commands_verified: "none"
---

**Issue:** When two parallel workers share a file, the brief gave one of them a line-level carve-out; the worker kept
to it by splitting its test into a new file rather than the module's own test file, which leaves one module's tests in
two places.

**Suggested improvement:** the template says that a carve-out covers the module's own test file too, and that the
controller merges overlapping edits; or the controller gives a shared file to one worker whole.
