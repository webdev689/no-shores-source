---
id: 107
title: "A fix to how keys are named was tested only on US codes and broke letters on AZERTY and Dvorak; an audit of the audit caught it"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "bible/03-Code/Testing.md"]
siblings_checked: "none: the lesson is the repo's audit and test practice (Toolkit's Audits, Testing), not a skill"
area: "audits; tests of input handling"
date: 2026-11-22
session_context: "The codebase audit (PR #142) named signs by their US key position so Shift could not rename them; its test used KeyA, Comma and Digit2. An independent read-only audit of the pull request found AZERTY's M (code Semicolon) became ';' and stopped opening the menu, and Dvorak's W, S, V and Z became signs."
parked_until:
resolved:
resolution:
reference: "PR #142, commits 88f1be0a (the regression) and 0ed5b1d1 (the fix)"
commands_verified: "run: node --test client/src/player/input.test.ts fails on 88f1be0a's naming with AZERTY/Dvorak/German cases and passes after 0ed5b1d1"
---

**Issue:** A fix built from a finding about one layout (Shift changing ',' to '<' on US) was tested with that
layout's codes alone. `KeyboardEvent.code` names a physical position, and other layouts put letters where US puts
signs, so mapping codes to US characters broke default binds there. The full check passed; three independent audits
of the pull request, briefed without the builder's conclusions, found it along with fifteen smaller misses.

**Suggested improvement:** Testing.md: a test of keyboard naming or binding carries at least one non-US layout's
event (AZERTY, Dvorak, a German umlaut key). Toolkit's Audits: a large audit's own pull request gets the same narrow,
conclusion-free audit split by language before it is called done, as features do.

**Principle:** A fix derived from one instance needs a test from outside that instance's assumptions; and a sweep of
fixes is itself a change that wants an independent review before it is called done.
