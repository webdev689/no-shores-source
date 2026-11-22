---
id: 0128
title: "Worker briefs named vitest for client tests (twice, two sessions); the project runs Node's own runner"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the brief template only"
area: "filling a worker brief's test commands"
date: 2026-11-22
session_context: "Overlook third audit: the controller filled the template's test-suite line from memory (npx vitest run); the client's tests run as node --import ./tools/testStyles.mjs --test (package.json). Fixed through each worker's inbox after a local run said 'no tests'. Again on 2026-11-22 (Playlist and encounters session): the controller's brief for two workers said npx vitest run; caught when the controller's own vitest run failed every file, fixed through both inboxes."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: npx vitest run <files> -> 15 failed, no tests; node --import ./tools/testStyles.mjs --test <files> -> 78 pass; second session: npx vitest run client/src/player -> every file FAIL; node --import ./tools/testStyles.mjs --test the same -> runs"
---

**Issue:** The brief's test commands were written from memory, not read from the repository, and named a runner the
project does not use. Three workers started with it.

**Suggested improvement:** The template's project-rules placeholder says to copy the test commands from the project's
own scripts (package.json, Testing note) and run one before handing out the brief.

**Principle:** Commands handed to a worker are copied from the repository and run once first, never recalled.

**Second occurrence (2026-11-22, another session):** the same command written from memory into two briefs. A second
violation calls for a barrier, not a rewording: `run-worker.sh` already refuses a brief with unfilled template lines;
it could also refuse a brief naming `vitest` (or any test command not found in package.json's scripts or the Toolkit
note), naming the right one in its refusal.
