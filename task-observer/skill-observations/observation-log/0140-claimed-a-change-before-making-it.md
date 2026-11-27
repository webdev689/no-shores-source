---
id: 140
title: "A progress line announced a code change as made before the edit was written, and the change rested on a subagent's ranking the owner had not confirmed"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md"]
siblings_checked: "none: the target is the project instruction file (its 'Verify before claiming' must), not a skill"
area: "status lines to the owner during multi-part bug fixing; acting on a delegated audit's top-ranked cause"
date: 2026-11-22
session_context: "No Shores, the owner's six prologue points. A read-only audio audit ranked 'the sea battle goes silent when no captain is hostile' first. The progress line said 'Sea fight now holds at least tension instead of going silent' though no edit had been made; the owner interrupted: the sea fight had no music issue, the prologue's wreck did. git checkout of the file changed 0 paths, showing it was never edited."
parked_until: "PR #244 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #244, merged 2026-11-27"
reference:
commands_verified: "git checkout client/src/game/prologue/battle.ts (run: 'Updated 0 paths from the index')"
---

**Issue:** Two slips in one step. A short status line to the owner described a change in the past tense ("now holds")
before the edit existed, breaking the project's "verify before claiming" must. And the change itself followed a
subagent's top-ranked cause for "music sometimes stops" without asking where in the prologue it stopped; the owner's
symptom was on the wreck, not at sea.

**Suggested improvement:** In CLAUDE.md's "Verify before claiming", add that a progress line names only edits already
written (said after the tool result, not before the call). And when a bug report names a broad area ("the
prologue"), confirm the exact moment with the owner before acting on a delegated audit's ranking when the candidates
sit in different beats.

**Principle:** A status line is a claim like any other: describe work in the past tense only after the tool result
shows it done. A delegated ranking of causes is a hypothesis; when the user's report is broader than the candidates,
one question about where it happened is cheaper than a wrong fix.
