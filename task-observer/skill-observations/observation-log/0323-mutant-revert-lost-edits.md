---
id: 323
title: "Reverting a mutation check with `git checkout -- file` also threw away the uncommitted fix in that file"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "unchecked: whether a testing note names how to undo a mutant"
area: "testing, mutation checks"
date: 2026-11-26
session_context: "Reviewing dialogue-click, I added fightBegins to quests.ts uncommitted, mutated one line with sed, then undid it with git checkout -- quests.ts, which restored HEAD and dropped the fix. Caught by git diff --stat and reapplied. Commit (or copy the file) before mutating, or undo the mutant with the reverse sed."
parked_until:
resolved:
resolution:
reference: "~/wt/dialogue-click, 1cd29a56"
commands_verified: "git diff --stat showed quests.ts missing"
---
