---
id: 103
title: "A full check run beside other heavy work fails its timing tests; an unquoted heredoc ran a second check"
status: parked
type: open-source
skill: [task-observer]
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "task-observer: its How to Log already says to write bodies with a quoted heredoc (never unquoted); the slip is against that rule, not a gap in it"
area: "running cargo xtask check; writing an observation's body"
date: 2026-11-21
session_context: "The full check on the leak fixes ran while a second worktree ran the whole TypeScript suite; later an observation's body was written while the audio branch's check ran."
parked_until: "PR #242 merge"
resolved:
resolution:
reference:
commands_verified: "run: flames.test.ts 'forty fires ... within about a millisecond a frame' failed at 4.66 ms during the overlap, passed alone, and the whole check passed on an idle machine; the stray check was found in ps under the observation's own shell and stopped after about two minutes"
---

**Issue:** The repo's TypeScript suite holds frame-time budgets (fires packed within about 1 ms a frame). Running a
second suite in another worktree at the same time made one fail at 4.66 ms, and the 25-minute check had to run again.
Then, writing this observation, its body went through an unquoted heredoc (to fill in the id), and a backquoted
`cargo xtask check` in the text ran a second full check beside the real one, the very contention described, until it
was found in `ps` and stopped. task-observer's How to Log already says to use a quoted heredoc: this is a slip
against a written rule, with the rule loaded.

**Suggested improvement:** Toolkit.md, near the check: run `cargo xtask check` with nothing else heavy on the machine
(no second suite, build or headless browser). For task-observer: since the id is the one thing a body needs filled
in, `new-observation.sh` could write the frontmatter's `id:` itself, leaving the body to a quoted heredoc always.

**Principle:** Tests that assert time budgets measure the machine as much as the code; give them the machine alone.
And text that may hold shell syntax is never passed through an expanding quote: fill in values separately.
