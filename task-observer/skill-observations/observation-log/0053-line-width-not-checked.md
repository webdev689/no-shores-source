---
id: 53
title: "The 120-character width of comments and notes is held only by review, so workers fix it in an extra round"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["crates/xtask"]
siblings_checked: "none: the target is the repo's checks, not a skill"
area: "repo checks: line width of comments and notes"
date: 2026-11-19
session_context: "Hulls worker's reviewer flagged long comment and note lines that cargo xtask check passed. Again 2026-11-24 (revives branch, #184): a docs auditor found five added note lines past 120 after cargo xtask repo passed, and counted 559 prose lines in bible/02-Systems already past it; Prettier's printWidth does not cover Markdown."
parked_until: "PR #257 merge"
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

**Second instance:** on #184 a docs auditor found added note lines past 120 after `cargo xtask repo` had passed. About
559 lines in `bible/02-Systems` were already past it, so the limit is unenforced across the vault, not just missed once.
