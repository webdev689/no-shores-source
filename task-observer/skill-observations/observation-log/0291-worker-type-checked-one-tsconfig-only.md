---
id: 291
title: "A worker reported tsc clean having run only tsconfig.json; tsconfig.node.json failed on its test file after merge"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the targets are project files, not skills"
area: "a worker's own checks before reporting"
date: 2026-11-26
session_context: "wreck worker: tsc clean on tsconfig.json; after merging, npx tsc -p tsconfig.node.json failed with TS18047 in wreckTeaching.test.ts (a let narrowed through a const alias). Fixed in a31eef6d."
parked_until:
resolved:
resolution:
reference:
commands_verified: "a31eef6d"
---

**Issue:** The brief says to type-check but not which configs; tests are only in the node config.

**Suggested improvement:** brief-common-template.md: name both commands, npx tsc --noEmit -p tsconfig.json and -p tsconfig.node.json.

**Principle:** A check named loosely gets run partly; name the exact commands.
