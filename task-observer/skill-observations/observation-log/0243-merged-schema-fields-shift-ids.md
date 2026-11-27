---
id: 243
title: "A three-way merge of FlatBuffers schemas put a branch's new fields mid-table, shifting ids main already ships, and no check caught it"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["crates/xtask/src/checks/", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: crates/xtask/src/checks has no schema check; messages.fbs says 'New fields go at the end' only as a comment"
area: "no-shores-source, merging a long-lived branch (#182) onto main"
date: 2026-11-24
session_context: "Merging #182 onto main: git auto-merged crates/protocol/gear.fbs (GearItem.hard inserted after breach, before xp) and messages.fbs (Snapshot.breach before darkness/reviving/outpost) with no conflict. Both moved ids of fields main had deployed. Found by reading the merged schema diff by hand; moved both to the ends. A size test then failed by 4 bytes from the vtable growth."
parked_until: "PR #245 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #245, merged 2026-11-27"
reference:
commands_verified: "git diff HEAD -- crates/protocol/messages.fbs crates/protocol/gear.fbs after the merge"
---
A repo check comparing each table's field order against origin/main (new fields only appended) would catch this
at the merge. Proposed rule change for the owner: add it to `cargo xtask repo`.
