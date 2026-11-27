---
id: 73
title: "Two sessions resumed the same unfinished work, and one learned it only from list_sessions"
parked_until: "PR #244 merge"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "tools/claude-toolkit/install-all.sh"]
siblings_checked: "family: resuming work (Hand-off.md, wip/HANDOFF.md on a side branch, the session's named branch)."
area: "overlook-source, resuming a session"
date: "2026-11-21"
session_context: "Asked to pick up the Dungeons session's work from a phone screenshot; another session (Practical Bardeen continuation) was already on it."
commands_verified: "list_sessions (mine); list_events kinds user/assistant; git ls-remote"
---
The owner started several sessions at once, each asked to resume work. This one rebuilt Journal Task 1 and set a
worker on Task 2 before list_sessions showed another session already at Task 6 of the same plan, having pushed the
#72 catch-up this session had just checked. The named branch (claude/hopeful-galileo-9ubmb0) existed on no remote.

Proposal: before resuming from a hand-off, list the account's running sessions and read the task summaries of any
started in the last hour; if one names the same branch or plan, stop and ask. A wip/HANDOFF.md could also carry a
"claimed by <session>" line that a resuming session sets and checks.
