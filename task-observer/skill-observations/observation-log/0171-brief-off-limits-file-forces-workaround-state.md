---
id: 171
title: "A worker brief that put a file off-limits to avoid a clash forced its state into a side map, and a test helper stood players on roofs"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the brief template is the toolkit's only one"
area: "scoping parallel workers' files, and walking tests on covered ground"
date: 2026-11-23
session_context: "Patrol audit 'Fix everything': the controller kept crates/room/src/quests.rs for itself and listed it off-limits to worker cavefoes; the worker needed a 'since when' on garrison posts that quests.rs builds as Post literals, so it kept the field in a Room map keyed by a group's first foe instead of on Post. It also found the room's put_player stands a body on the highest roof, so a test walking covered run beats had to drive real inputs; and a new Room field's name clashed with an existing 'quiet'."
parked_until: "PR #242 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #242, merged 2026-11-27"
reference:
commands_verified: "none"
---

**Issue:** To keep two builders off one file, the controller marked a file off-limits. The worker's change needed one
more field on a struct that file constructs literally, so it parked the state elsewhere (a Room map keyed by the
group's first foe), which works but is the shape the codebase would not choose. Separately, a test helper that stands
a player places them on the highest surface at a point, so covered ground (a run beat under a roof) is never stood on.

**Suggested improvement:** In the brief template's "files you must NOT edit" line, let a worker make the minimal
mechanical change a struct literal in such a file needs (a new field's default), named in its report, rather than
working round it; and say in Toolkit.md's Browser QA/testing notes that put_player stands on the highest roof.

**Principle:** A no-edit rule meant to prevent merge clashes should allow the one-line mechanical follow-on a change
forces in that file; forbidding it trades a trivial conflict for a lasting design wart.

2026-11-24, worker layouts: `client/src/rules/nodeWindow.test.ts` was off-limits, yet it pins the same rects and
`NODE_RUN_HASH` as the `agree_node.rs` the worker had to re-pin; the controller updated it after the merge from the
values in the worker's report. A pin's two halves (Rust and TypeScript) belong to the same worker.
