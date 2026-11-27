---
id: 82
title: "Porting workers' brief: type-check the tests, delete with rm, and the kit's tools under three parallel workers"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "0015 (picture runs that break) covers headless shots failing; this is about the brief's own steps and three workers at once"
area: "worker briefs: running several porting workers in parallel on 4 CPUs"
date: 2026-11-21
session_context: "The no-HTML port's round one: three workers (hud, gearshell, fighthud) in parallel on the drawn interface's foundation"
parked_until: "PR #242 merge"
resolved:
resolution:
reference: "~/wt/reports/{hud,gearshell,fighthud}.md and their logs' OBSERVATIONS lines"
commands_verified: "read: the three workers' final replies; ran: cargo xtask check after merging (types failed on fighthud's tests that tsc -p . never saw)"
---

**Issue:** The brief told workers to type-check with `npx tsc --noEmit -p .`, which leaves out the test files; one
worker's tests carried six type errors that only `npm run -s types` (the check's stage) found after the merge.
`git rm` staged a deletion into an unrelated foundation commit twice (hud). The rtk grep hook turned `--include`
after `--` into a file name (gearshell). `graphify update` took three minutes with three workers running it at once,
and SwiftShader's live runs ten minutes each. While three workers ran, the full check's timing tests (flames packed
within a millisecond, a chalk zone painted in tens of milliseconds) failed on load alone, so the controller could not
get a clean check until the workers ended.

**Proposal for the owner:** the brief template says `npm run -s types`, and "delete with plain rm"; the controller runs
its full check only while no worker runs, or the timing tests take a margin for a loaded machine (that is a rule
change for the owner).
