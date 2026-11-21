---
id: 100
title: "A gameplay choice the owner did not make was filed as Claude's call instead of asked"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "bible/04-Procedures/Recording a Decision.md"]
siblings_checked: "checked: instance-specific to the project's decision procedure, not a skill"
area: "owner's design choices and Claude's calls"
date: 2026-11-21
session_context: "The owner's combat notes (#135): the owner chose a fixed swing chain; Claude also decided that a stroke out of reach is passed over (at the edge of reach every swing thrusts) and recorded it under Claude's calls. An independent audit flagged it as the owner's to make."
parked_until:
resolved:
resolution:
reference: "PR #135, bible/05-Decisions/The Player's Swings Chain Side Cut, Overhead and Thrust.md"
commands_verified: "none"
---

**Issue:** CLAUDE.md says "Never invent game design ... When a choice is the owner's, ask." A decision note's
"Claude's calls" section gave a home to a choice that changes how the game plays (which stroke a swing takes when
one does not reach), so it was decided and recorded rather than asked, though the owner was being asked three other
questions in the same turn. It reached the owner only because an audit flagged it.

**Suggested improvement:** Before writing a "Claude's calls" line in a decision note, test it: does it change what the
player sees or can do? If so it is a question for the owner, asked with the others; "Claude's calls" holds only how
it is built (tuning that keeps tests' behaviour, code layout). Put that test in Recording a Decision.

**Principle:** A record of choices made on the owner's behalf must not become the place design slips in unasked.
