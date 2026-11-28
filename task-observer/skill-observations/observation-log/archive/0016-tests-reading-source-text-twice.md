---
id: 16
title: "Workers twice wrote client tests that read Rust source text, against the Tests Check Behaviour rule"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["crates/xtask/src/checks", "bible/00-Rules/Tests Check Behaviour.md"]
siblings_checked: "none: the target is a project rule and its check, not a skill"
area: "test rules enforcement"
date: 2026-11-20
session_context: "Overlook factions round: art-levels' artLevels.test.ts and plaza-welcome's lockedSpaces.test.ts each read a crates/**/*.rs file with readFileSync and regexes to keep the page in step with the rules; both passed review by their workers and were caught only by the controller and an audit"
parked_until: "PR #245 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #245, merged 2026-11-27"
reference:
commands_verified: "none"
---

**Issue:** Two independent workers in one round wrote TypeScript tests that open Rust source files and match their
text, to keep the page's copy of a rule in step with the room's. The rule "Tests pin what the code does, never where
its lines sit" is written and was in both briefs; it is held only in review, and both workers' own reviews passed it.
The controller replaced one with a measured fixture (a Rust test writes what the room does; the client test reads it)
and moved the other's duplicated list into a content file both read.

**Suggested improvement:** This is the second violation in one round, so a barrier, not a rewording: a repo check that
refuses a test file under `client/` reading a path under `crates/` (or any `.rs`) at run time, pointing at the two
accepted patterns: a fixture a Rust test writes under `target/`, or a content file both sides read.

**Principle:** When the same rule is broken twice by different agents despite being in their instructions, the rule
needs a mechanical check with the approved alternatives named in its message.
