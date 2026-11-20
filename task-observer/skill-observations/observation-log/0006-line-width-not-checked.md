---
id: 6
title: "The 120-character width of comments and notes is held only by review, so workers fix it in an extra round"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["crates/xtask"]
siblings_checked: "none: the target is the repo's checks, not a skill"
area: "repo checks: line width of comments and notes"
date: 2026-11-19
session_context: "Hulls worker's reviewer flagged long comment and note lines that cargo xtask check passed."
parked_until:
resolved:
resolution:
reference:
commands_verified: "NOT RUN: reported by the worker (its second commit only rewrapped lines)"
---

**Issue:** The hulls worker's reviewer found comment and note lines past 120 characters after `cargo xtask check` had
passed; a whole commit went to rewrapping them.

**Suggested improvement:** If 120 characters is the repo's width, let the comments check and the vault check enforce it
(a new check needs the owner's agreement, per CLAUDE.md), or drop it from review.

**Principle:** A style limit enforced only by review costs a round every time; enforce it in the gate or stop asking for
it.
