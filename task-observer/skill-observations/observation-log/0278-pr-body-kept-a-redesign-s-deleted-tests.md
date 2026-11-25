---
id: 278
title: "After the owner turned a design down mid-PR, the redrafted PR body still listed the deleted design's tests as new tests"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/Recording a Decision.md", "CLAUDE.md"]
siblings_checked: "checked the other places the old design's words lived (the hand-off, Foe Arrivals as Claude Builds Them, Enemies, Open Questions, the patch notes): each was rewritten section by section with the code and held none; only the PR body's test bullet, carried over from the draft before the redesign, kept it"
area: "Pull request descriptions after a design is reversed mid-PR"
date: 2026-11-25
session_context: "PR #211 (foe arrivals): the owner replaced the timed airships with territories; the PR body's 'New tests' bullet still listed eight reinforcements tests deleted with reinforcements_tests.rs, caught on re-reading the whole draft before posting."
parked_until:
resolved:
resolution:
reference:
commands_verified: "grep -n 'fn ' crates/room/src/stands_tests.rs (the territories' tests); ls crates/room/src (no reinforcements*.rs) -> the bullet rewritten before mcp update_pull_request (tested offline)"
---

A redraft edited section by section rewrites the sections the change obviously touches ("What changed", the table)
and carries the rest forward, so a list of tests, files or numbers from the reversed design survives into the new
body and claims tests that no longer exist. It was caught only because the whole draft was re-read before posting.

Proposal for the owner: when a design is reversed on a pull request, the body is checked line by line against the
head's diff from main before it is posted: every test, file and number it names exists on the head. A structural
form would be a check that each backticked path and test name in the body resolves in the head's tree.
