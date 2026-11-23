---
id: 169
title: "The worker brief template says graphify-out/ is tracked and to `git checkout -- graphify-out`, but .gitignore ignores it, so the step errors"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "tools/claude-toolkit/git-hooks/pre-commit"]
siblings_checked: "checked: the template's lines 17, 18 and 32 all assume graphify-out/ is tracked; the pre-commit guard's graphify-out refusal is moot while it is ignored"
area: "worker brief template accuracy"
date: 2026-11-23
session_context: "Worker sets (set names and drops), OBSERVATIONS line: 'graphify-out is gitignored in this worktree, so `git checkout -- graphify-out` errors and the brief's step doesn't apply'. .gitignore line 20 ignores graphify-out/. The same worker: the first `graphify update .` took over 120 s, and stdout-only redirects (`> log` without `2>&1`) hid cargo's failures from grep."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: git check-ignore -v graphify-out/graph.json -> .gitignore:20:graphify-out/"
---

**Issue:** The brief template tells every worker that `graphify-out/` is tracked and to run `git checkout -- graphify-out` before commits, rebases and pulls. `.gitignore` now ignores it, so the command errors and each worker spends time working out that the step doesn't apply. The same worker hid cargo's failures by redirecting stdout only: cargo writes errors to stderr.

**Suggested improvement:** Drop the graphify-out checkout lines from the template, keeping "never commit graphify-out", and drop the pre-commit guard's graphify-out check if the ignore makes it moot. Add "send a build's stderr to its log too (`> log 2>&1`)" to the template's test-results line.

**Principle:** A brief template's fixed steps go stale when the repository changes under them. Every stale step costs each reader a detour, so re-check a template's commands when the setup they assume changes.
