---
id: 319
title: "A bare tsc passed where CI's full type check failed on the server"
status: superseded
type: methodology
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "header added by the 2026-11-27 review; written without one"
area: "testing"
date: 2026-11-27
session_context: ""
parked_until:
resolved: 2026-11-27
resolution: "by #296 (the same finding; its body is copied there)"
reference: ""
commands_verified: ""
---


`npx tsc -p tsconfig.json --noEmit` (as CLAUDE.local.md's headroom note suggests) passed locally, but CI's
`npm run -s types` failed on server/ashore.test.ts: the root tsconfig does not cover the server. Cost a 50-minute CI
round. Proposal: the headroom note and Toolkit.md say `npm run -s types`, not bare tsc. Also: client network tests
read target/protocol fixtures; run `cargo test -p protocol` first after a schema change.
