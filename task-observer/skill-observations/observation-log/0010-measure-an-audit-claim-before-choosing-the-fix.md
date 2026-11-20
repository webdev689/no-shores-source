---
id: 0010
title: "An audit claim's stated reach was wider than its real one; the fix sized to the claim broke four other tests"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: [bible/03-Code/Toolkit.md]
siblings_checked: "none"
area: "acting on a reviewer's finding"
date: 2026-11-20
session_context: "The comprehensive audit of overlook-source#63: a finding that every run leaving a raised place starts with a cliff"
parked_until:
resolved: 2026-11-20
resolution: "Applied to bible/03-Code/Toolkit.md's Audits section (measure each finding with a test first) on https://github.com/Lattymoy/overlook-source/pull/100 (weekly review)"
reference:
commands_verified: "run: the walk-in test written for the claim failed on 2 of 9 runs, not all; the first fix (raise every run to its mouth's level) failed 4 other run tests; the narrower fix passed all 22"
---

**Issue:** A reviewer reported that every run leaving a raised floor starts with a cliff. I fixed it as stated, by
raising every run to its mouth's level, which broke building runs' stairs, ceilings and doors. Only after writing the
missing walk test did it show the defect hit 2 of 9 runs, both open ones; the fix that matched was far narrower.

**Suggested improvement:** For each finding, first write the test that would catch it and run it, so its real reach
is measured before the fix is chosen; size the fix to what the test shows, not to the finding's wording.

**Principle:** A finding's stated scope is a hypothesis; a failing test is its measurement.
