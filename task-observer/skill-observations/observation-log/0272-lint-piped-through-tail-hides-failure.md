---
id: 272
title: "`npx eslint ... | tail -3 && git commit` commits through a lint error: the pipe's status is tail's"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: general shell habit; applies to every check piped for brevity (eslint, tsc, cargo clippy)"
area: "verification before commit"
date: 2026-11-25
session_context: "Audit session: a layout test's short loop name failed ESLint's id-length; the command `npx eslint ... | tail -2; git add -A && git commit` committed it, and the error was seen only in the printed tail; amended at once (ad3df684)."
parked_until:
resolved:
resolution:
reference: "commit ad3df684 (amended)"
commands_verified: "npx eslint client/src/ui/layout.test.ts (1 error before, none after)"
---

**Issue:** A check piped through `tail` for a short output loses its exit status, so a chained commit runs anyway.

**Proposed:** The brief template's "Test results" rule gains: run a check bare or with `set -o pipefail` before any
`&&` that commits; never gate a commit on a piped check.
