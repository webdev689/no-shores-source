---
id: 9
title: "A read-only audit agent, briefed without the builder's conclusions, found ten real faults in a passing branch"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: [bible/03-Code/Toolkit.md]
siblings_checked: "none"
area: "reviewing a large feature before calling it done"
date: 2026-11-20
session_context: "The owner's 'This PR's work again' audit of the height rework on overlook-source#63"
parked_until:
resolved: 2026-11-20
resolution: "Applied to bible/03-Code/Toolkit.md's Audits section on https://github.com/Lattymoy/overlook-source/pull/100 (weekly review)"
reference:
commands_verified: "run: cargo xtask check passed before the audit; every one of the ten findings was read back against the code and nine had a concrete failure (a 6 m trench across the city plaza from the pad seam blend among them)"
---

**Issue:** The height rework passed the full check, yet an independent read-only reviewer, given the files and what
was already fixed but not the builder's reasoning, found ten faults: a pad blend that would trench the city plaza,
works buried under raised floors, climbs started off their floors, grades lost to path simplification.

**Suggested improvement:** After a feature of this size, run one read-only audit agent with a scope, an "already
fixed" list and a findings format (file:line, scenario, confidence), with builds off so it does not compete for the
CPU; verify each finding against the code before fixing.

**Principle:** Passing tests show what was tested; an unanchored reader finds what was not.
