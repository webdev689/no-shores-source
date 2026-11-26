---
id: 282
title: "A server test file's type errors are not shown by `tsc -p server/tsconfig.json`; only `npm run types` (all five configs) catches them"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "checked: repo-specific (which tsconfig includes server/*.test.ts); no installed skill type-checks this repo"
area: "verification before push"
date: 2026-11-25
session_context: "Audit session (ccr-502bc640-qlks7c): a new test in server/accounts/roster.test.ts assigned a read-only `deps.database`; `npx tsc -p server/tsconfig.json` printed nothing, and the error showed only when `npm run types` ran after merging main."
parked_until:
resolved:
resolution:
reference: "commit dcf2a3a0 (the fix); package.json `types` script"
commands_verified: "npm run -s types (5 errors before the fix, none after)"
---

**Issue:** The server's own tsconfig leaves its tests out, so a per-area type check of a changed server test passes
while the full one fails.

**Proposed:** In Testing.md's "before a push", name `npm run -s types` as the type check to run, never one config.
