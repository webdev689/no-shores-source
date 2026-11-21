---
id: 94
title: "The stop hook asks for a push while the full check cannot pass mid-build"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh"]
siblings_checked: "none: the hook is the harness's stop hook, not a skill"
area: "stop hooks and the check-before-push rule"
date: 2026-11-21
session_context: "Background builders were mid-work on a design commit whose wire fields broke the build; the stop hook asked three times to commit and push."
parked_until:
resolved:
resolution:
reference:
commands_verified: "none"
---

**Issue:** The stop hook asks to commit and push whenever the branch has unpushed commits or changes. The project
says the full check must pass before every push. While background builders work, the controller ends a turn with a
commit that cannot pass yet, and the hook asks again at every turn end.

**Suggested improvement:** Let the stop hook accept a marker (a file under .git, or a note in the turn) that says work
is in flight and the check is pending, or have it ask only for commits whose check has passed.

**Principle:** An automatic reminder must yield to the project's own gate, or it trains the agent to ignore it.
