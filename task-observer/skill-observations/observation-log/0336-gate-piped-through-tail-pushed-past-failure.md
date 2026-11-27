---
id: 336
title: "The controller gated a push on `cargo xtask repo 2>&1 | tail -1 && git push`: the pipe's exit was tail's, and a failing repo check was pushed"
status: open
type: user-correction
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/git-hooks/pre-push"]
siblings_checked: "checked: #265 and #283 (pipefail-before-commit) name the same slip for commits; #239's pre-push hook runs `cargo xtask repo` itself and would have refused this push"
area: "pushing"
date: 2026-11-27
session_context: "Merging main into #235: a rewrap split a wiki link across lines; the repo check printed the problem, tail printed it, the && saw tail's 0, and the push went out. Caught on reading the output, fixed in the next commit."
parked_until:
resolved:
resolution:
reference: "PR #235 commits 65c84725 then the fix; PR #239 (pre-push hook)"
commands_verified: "cargo xtask repo > file; echo $? printed 0 only after the fix"
---
A RECUR of #265: the rule was in context and broken again. #239's pre-push hook is the barrier; until it merges and
is installed, run a gate bare or under `set -o pipefail`, never through `| tail`.
