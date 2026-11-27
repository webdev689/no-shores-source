---
id: 296
title: "Type-checking with tsc -p tsconfig.json alone passes while the tests' own project fails: run npm run types"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: package.json types runs five projects (tsconfig.json, tsconfig.node.json, server, site, desktop); the client's test files are only in tsconfig.node.json"
area: "checking types before a push"
date: 2026-11-26
session_context: "#216's audit fixes: the controller and a fixing sub-agent both ran npx tsc -p tsconfig.json --noEmit, clean; cargo xtask check then failed at 'types' on two tests whose assert.deepEqual(list, []) narrowed the list to never[]. A 50-minute check was spent to find it.; 2026-11-26 and 2026-11-27: two more sessions, one costing a 50-minute CI round (#319, folded in), one the first CI run of #232"
parked_until:
resolved:
resolution:
reference: "check3 on b06d383b after the fix; the failure on a152e3fe"
commands_verified: "npm run -s types: run, clean after the fix; npx tsc -p tsconfig.json --noEmit: run, clean before it"
---

**Two more instances (folded in at the 2026-11-27 review):** #319: `npx tsc -p tsconfig.json --noEmit` (as CLAUDE.local.md's headroom note suggests) passed locally, but CI's
`npm run -s types` failed on server/ashore.test.ts: the root tsconfig does not cover the server. Cost a 50-minute CI
round. Proposal: the headroom note and Toolkit.md say `npm run -s types`, not bare tsc. Also: client network tests
read target/protocol fixtures; run `cargo test -p protocol` first after a schema change.
And #232 (2026-11-27): `npx tsc -p tsconfig.json` passed while CI's `npm run -s types` failed on eight errors in three test files; the headroom note in CLAUDE.local.md still names bare tsc. Three sessions now: by the skill's rule, the fix is a barrier, not a sentence.
