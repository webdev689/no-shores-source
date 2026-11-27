---
id: 135
title: "Workers' 'each test fails without its fix' held for helpers, not wiring; and three fixes caused regressions only a side-effect review found"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the Toolkit's Audits section only"
area: "calling an audit's fixes done"
date: 2026-11-22
session_context: "Overlook third audit, then the owner asked for an audit of the audit. Two workers reverted each fix's own lines and ran its tests: 46 of 52 Rust and 34 of 47 TypeScript fixes were caught; the 19 others were wiring (a helper tested, the call that puts it in the game not) or had no test. A side-effect review found three of the fixes themselves doing more than meant (a home-waters rule that left a hold in place, sails left furled, a stacked-wall rule too loose), and a reconciliation found a confirmed finding dropped from the PR."
parked_until: "PR #244 merge"
resolved:
resolution:
reference:
commands_verified: "run: the mutation workers' reports (reverted hunk, test run, FAILS/PASSES), ~/wt/reports2/mut-rust.md and mut-ts.md this session"
---

**Issue:** Each worker reported its tests failing without its fix, and a reviewer per worker agreed. Reverting each fix
alone showed one in five unguarded, all at the seam where a tested helper is called from the game. Separately, fixes
judged one at a time changed neighbouring behaviour no reviewer of that worker's diff was asked about.

**Suggested improvement:** Toolkit.md, Audits: before an audit's fixes are called done, (1) a mutation pass that
reverts each fix's source lines alone and runs its tests, (2) a side-effect review of the merged diff briefed only to
look for behaviour beyond each fix's stated change, (3) every finding checked off against the PR's text.

**Principle:** A fix is verified where it is wired in, not where its helper is; and a batch of fixes is reviewed for
what it changes besides what it meant to.
