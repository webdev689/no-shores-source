---
id: 156
title: "Tightening a repo check: prototype the new rule over the whole corpus and measure false alarms and leaks before writing it"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: applies to every check in crates/xtask/src/checks (vault, html, comments, assets, shaders); only the vault and html checks were tightened this session"
area: "changing a lint or repo check without breaking what it already passes"
date: 2026-11-23
session_context: "Audit leftovers session: the owner approved tightening the vault check (a code: #symbol passed if any word of its file named it, an import included) and the html check. A Python prototype of 'defined, not only named' was run over all 1,610 code: symbols (false alarms) and over 23,566 names files only import (leaks): first cut 0 false alarms but 2,666 leaks (calls at a line's start read as methods); second cut 1 false alarm (a parameter holding a function); third cut 0 false alarms, 572 leaks. The Rust port was then proven live by planting two bad refs and seeing exactly those two flagged."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: python3 defproto.py (scratchpad) -> 0 failing refs, 572 of 23566 import-only names passing; cargo xtask repo -> 'repo checks: 3703 files, no problems'; with two planted refs -> 2 problem(s)"
---

**Issue:** A check's rule was to be tightened across a corpus of 1,610 existing references. Writing the rule straight into the check would have shown only one direction (does the repo still pass?), and a rule loose enough to pass everything can still let most bad cases through: the first cut passed every real reference but also 11% of names files only import.

**Suggested improvement:** In Toolkit.md, "Audits" (or Checks.md beside the table), add: before tightening a check, prototype the new rule in a script and measure it two ways over the whole repository: real cases it would flag (must be none, or each fixed) and a generated set of known-bad cases it should flag (the leak rate, reported in the PR). Then port it and prove the port live by planting one bad case per new rule and seeing exactly those flagged.

**Principle:** A check change is measured like a classifier: its false-alarm count on the real corpus and its miss rate on a generated bad set, both before it lands, then a planted failure to prove the shipped version is the one running.
