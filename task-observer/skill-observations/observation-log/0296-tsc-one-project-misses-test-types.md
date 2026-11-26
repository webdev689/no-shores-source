---
id: 0296
title: "Type-checking with tsc -p tsconfig.json alone passes while the tests' own project fails: run npm run types"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: package.json types runs five projects (tsconfig.json, tsconfig.node.json, server, site, desktop); the client's test files are only in tsconfig.node.json"
area: "checking types before a push"
date: 2026-11-26
session_context: "#216's audit fixes: the controller and a fixing sub-agent both ran npx tsc -p tsconfig.json --noEmit, clean; cargo xtask check then failed at 'types' on two tests whose assert.deepEqual(list, []) narrowed the list to never[]. A 50-minute check was spent to find it."
parked_until:
resolved:
resolution:
reference: "check3 on b06d383b after the fix; the failure on a152e3fe"
commands_verified: "npm run -s types: run, clean after the fix; npx tsc -p tsconfig.json --noEmit: run, clean before it"
---
