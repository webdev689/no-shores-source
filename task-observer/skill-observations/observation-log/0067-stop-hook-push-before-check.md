---
id: 67
title: "Check-before-push leaks: the Stop hook asks for a push mid-check, and a push chained after reading the log went out on a failed check"
parked_until: "PR #239 merge"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: end-of-turn gates (the harness Stop hook, CLAUDE.md's check-before-push). headroom learn turned the hook's ask into a learned rule (push before finishing) that drops the check; checked, no other sibling."
area: "overlook-source, pushing after a long check"
date: "2026-11-20"
session_context: "Merging claude/f-main (#98) into #75's branch: the turn ended while the 15-minute full check ran in the background."
commands_verified: "cat <check output> && git push (run: the check had exited 1 on an id-length lint and the push went out; the fix was pushed only from `if cargo xtask check; then git push; fi`); headroom learn --project . --apply (run: printed the push-before-finishing rule); cargo xtask check (run: passed at ac12d3bf, then pushed)"
---

**Issue:** Ending a turn while `cargo xtask check` ran in the background, the harness's Stop hook said "57 unpushed commit(s) ... Please push". CLAUDE.md says the check passes before every push, so the push was held and the turn ended with a line why. headroom learn then recorded "push the working branch before finishing so the hook does not force an extra turn", a learned rule that, followed literally, pushes unchecked work.

**Suggested improvement:** One line in CLAUDE.md or the Toolkit note: the Stop hook's unpushed-commits ask waits on a running check; push only once it passes. And review headroom's learned rule so it carries "after `cargo xtask check` passes".

**Principle:** A generic harness nudge and a project gate can disagree; an automatic rule-learner must not turn the nudge into a rule that drops the gate.

**Second instance, same session (own violation):** after the background check on `d3e138a0` finished, one command ran `cat <its output> && git fetch && ... && git push`. The `&&` gated on `cat`, not on the check: the output said `check exit 1` (an `id-length` lint) and the push went out. The rule was written (CLAUDE.md), loaded and remembered; the protection was reading the result, which the chain skipped. Fixed by a follow-up commit pushed only from `if cargo xtask check; then git push; fi`.

**Structural barrier (second violation, so no rewording):** a `pre-push` hook in the kit (`tools/claude-toolkit/git-hooks/`, installed as the pre-commit guard is) refusing a push unless `cargo xtask check` passed at the pushed head, e.g. the check writing `target/checked-<sha>` on success and the hook testing for it. A rule on pushes needs the owner's agreement: propose it, do not add it unasked.

**Restates 0001 and 0026** (found after writing this): 0001 is the same break in an earlier session (`check; push`), and proposed the same pre-push hook; 0026 is headroom learning a push-without-check rule. This session's chained push is the third break of check-before-push across sessions, so the pre-push hook is the fix to review, not more wording.
