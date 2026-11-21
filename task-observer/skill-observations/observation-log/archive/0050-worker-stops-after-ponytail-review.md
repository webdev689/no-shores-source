---
id: 50
title: "A headless worker ends its run on the ponytail review's reply (twice): an unread reviewer, no final reply"
status: actioned
type: open-source
skill: [ponytail-review]
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "ponytail family: ponytail, ponytail-review — ponytail-review added (its reply reads as a final answer); ponytail excluded (it sets a mode, it ends no turn)"
area: "worker finish: the steps after the review skills"
date: 2026-11-19
session_context: "Controller running three toolkit workers in parallel; the waters worker exited with review fixes uncommitted."
parked_until:
resolved: 2026-11-20
resolution: "run-worker.sh checks the reply for INBOX and OBSERVATIONS lines and the worktree for uncommitted tracked work, resumes once with the finish steps, else logs WORKER <name> UNFINISHED (commit d4ec80a on claude/waters-from-islands); Toolkit.md Workers says so"
reference:
commands_verified: "run: git -C /root/wt/waters status --short (7 files modified, 1 commit); the worker's log held only the ponytail review's text; run-worker.sh --resume with the remaining steps finished it (2 commits, report written)"
---

**Issue:** The brief's finish runs verification, a reviewer, then `ponytail:ponytail-review`, and only then the commit and
report. The worker's last message was the review skill's own summary ("Looks good. Ship."), and `claude -p` ended
there: fixes uncommitted, no report, no final check. A `--resume` with the remaining steps finished it.

Second instance, same worker, round two: it committed first (as told), started its reviewer sub-agent in the
background, ran ponytail-review, and the run ended on that reply. The reviewer's findings were never read; the
final reply (INBOX and OBSERVATIONS lines) never came; audit.py flagged both. The brief's wording had been followed
to the letter both times, so wording is not the fix.

A third worker (held map) reports the cause behind the unread reviewer: its Agent call with `run_in_background:
false` still ran in the background, so the brief's "run the reviewer in the foreground" cannot be obeyed by asking.
The barrier below is the only reliable fix.

**Suggested improvement:** In the brief template, commit before the review skills and make the report the last step,
or say plainly that the review's reply is not the final reply and the numbered steps follow it. Second violation, so a barrier: after `claude -p` returns, run-worker.sh checks the log's last reply for the
"INBOX:" and "OBSERVATIONS:" lines and the worktree for a clean tree; if either is missing it resumes the worker
once with a fixed finish prompt ("read your reviewer's findings in the foreground, fix, check, commit, report, final
reply"), and prints WORKER <name> UNFINISHED if it is still missing after that.

**Principle:** A skill whose output reads like a final answer, placed before the last steps of a headless run, can end
the run early: put the irreversible steps (commit, report) before it, or check for them after the run.
