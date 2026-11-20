---
id: 46
title: "The harness's unpushed-commits Stop hook asks for a push while cargo xtask check is still running"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: end-of-turn gates (the harness Stop hook, CLAUDE.md's check-before-push). headroom learn turned the hook's ask into a learned rule (push before finishing) that drops the check; checked, no other sibling."
area: "overlook-source, pushing after a long check"
date: "2026-11-20"
session_context: "Merging claude/f-main (#98) into #75's branch: the turn ended while the 15-minute full check ran in the background."
commands_verified: "headroom learn --project . --apply (run: printed the push-before-finishing rule); cargo xtask check (run: passed at ac12d3bf, then pushed)"
---

**Issue:** Ending a turn while `cargo xtask check` ran in the background, the harness's Stop hook said "57 unpushed commit(s) ... Please push". CLAUDE.md says the check passes before every push, so the push was held and the turn ended with a line why. headroom learn then recorded "push the working branch before finishing so the hook does not force an extra turn", a learned rule that, followed literally, pushes unchecked work.

**Suggested improvement:** One line in CLAUDE.md or the Toolkit note: the Stop hook's unpushed-commits ask waits on a running check; push only once it passes. And review headroom's learned rule so it carries "after `cargo xtask check` passes".

**Principle:** A generic harness nudge and a project gate can disagree; an automatic rule-learner must not turn the nudge into a rule that drops the gate.
