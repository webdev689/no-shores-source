---
id: 186
title: "A rules file sitting at exactly 600 lines (asks.rs) blocked a new refusal code, so two refusals were folded into an existing one's words"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/00-Rules/Rules.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: the earlier session's garrison.rs at 599 lines blocked a one-line comment (observation 151's context); foot.ts now sits at 599"
area: "the Small Files rule meeting a file already at its cap"
date: 2026-11-24
session_context: "Guild outposts session, second audit's fixes: the rooms worker needed two new refusals (a claim at the week's turn, a horn past the accounts' limit). crates/room/src/asks.rs sat at exactly 600 lines, so a new code would break the Small Files rule; under its two-hour limit the worker answered both as OutpostTrouble, and the controller then reworded that refusal so it fits all three causes."
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/fix2-rooms.md (Concerns)"
commands_verified: "read: the rooms worker's report; wc -l crates/room/src/asks.rs"
---

**Issue:** A file at the line cap turns any small addition into a split first. A worker short of time takes the
cheaper path of not adding (here, folding distinct refusals into one), which costs the player precise words.

**Suggested improvement:** In the common brief, add: "a file within 20 lines of the cap is split before the item
starts, as its own commit, so the item's change fits". Optionally a repo check that warns at 580 lines, so a file is
split while nobody is mid-change.
