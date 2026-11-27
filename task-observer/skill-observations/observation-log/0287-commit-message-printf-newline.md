---
id: 287
title: "A commit message built inline with $(printf '\\n') lost its blank line twice in one session; one went out on a shared branch"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is a project file, not a skill"
area: "writing commit messages from the shell"
date: 2026-11-26
session_context: "No Shores #211's last audit: `git commit -m \"subject$(printf '\\n\\n')body\"` joined subject and body (caught before the push, amended); later `git commit -m \"subject$(printf '\\n')\\nCo-Authored-By...\"` put the trailers in the subject's paragraph and was pushed to the PR's branch, where history is not rewritten. Every other commit that session used `git commit -F - <<'EOF'` and came out right."
parked_until: "PR #239 merge"
resolved:
resolution:
reference:
commands_verified: "run: git log -1 --format='%s|%b' showed the joined subject both times"
---

**Issue:** command substitution strips trailing newlines, so `$(printf '\n\n')` inside `-m` adds nothing; the subject
and body (or the attribution trailers) ran together. The same slip happened twice in one session; the second reached a
shared branch.

**Suggested improvement:** commit messages with a body are written only with `git commit -F - <<'EOF'` (a quoted
heredoc); a pre-commit-msg hook in the kit could refuse a message whose first line holds `Co-Authored-By:` or runs
past 100 characters, as a barrier rather than a rule to remember.

**Principle:** never build multi-line text from `$(...)` output meant to end in newlines; the shell removes them
silently. Write it with a quoted heredoc, and check the result's first line before it is pushed.
