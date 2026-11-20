---
id: 0029
title: "A bible timing stayed quoted after the code under it changed, and an ignored measurement test's bound never ran"
status: open
type: internal
skill: []
proposes_skill: []
target_file: [bible/03-Code/Testing.md]
siblings_checked: "checked — applies to every measured number in the bible and every #[ignore]d measurement test"
area: "measured numbers in documentation"
date: 2026-11-20
session_context: "Filling the room-open timing after merging main into overlook-source#63 (Navmesh.md, Server.md, Movement.md; crates/room/tests/near_blocks.rs)"
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: near_blocks' bake measurement at the pre-merge head 25d9f206 opened the Downs room in 597 to 723 ms bare, against the 330 to 430 ms Navmesh.md quoted; callgrind put 79% of it in Ground::nearest; after the fix 128 ms bare, 206 ms among the boxes"
---

**Issue:** `Navmesh.md` quoted the Downs room opening in 330 to 430 ms bare. On the pre-merge head it took 600 to
720 ms, because this branch's ways had since been laid as roads into 2 km buckets. `Movement.md` still quoted
4,429 boxes when there are 7,465. The test behind both numbers is `#[ignore]`d as "a measurement, not a check",
so its own bound (boxes at most double the bare bake) never ran. Run for the merge, it failed at once.

**Suggested improvement:** Before a pull request that changes code a quoted number measures (the ground, the bake,
the movement rules), rerun the measurement test it names and update the number. Or have the check run each
measurement test's bound with a loose limit, so a regression fails CI instead of waiting for a reader.

**Principle:** A measured number is true only at the commit it was measured on; name the command, and rerun it
when the code under it moves.

**Related:** #0005 (tested claims must postdate the last change) is the same rule for "tested" claims.
