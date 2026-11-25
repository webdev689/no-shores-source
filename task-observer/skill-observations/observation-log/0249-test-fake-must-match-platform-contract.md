---
id: 249
title: "A test's stand-in dialog answered an abort as Electron's does not, and hid a bug that recorded working graphics as failed"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "Testing's 'What a good test looks like' has no line on stand-ins; 0199 (body floats hardcoded in tests) is the nearest, a fake drifting from the real thing"
area: "unit tests with injected effects (desktop/src/graphicsWatch.test.ts)"
date: 2026-11-25
session_context: "The desktop app session: the fake ask() resolved null on abort; Electron's showMessageBox resolves with cancelId when its signal aborts ('as if it was cancelled by the user', electron.d.ts). The audit found it; the test failed once the fake did what Electron documents."
parked_until:
resolved:
resolution:
reference:
commands_verified: "node --test desktop/src/graphicsWatch.test.ts: 1 fail with the faithful fake before the fix, 16 pass after"
---

A stand-in for a platform call should do what the platform documents, read from its types or docs when it is
written, or the test passes on behaviour the platform never has. Proposal for the owner: one line in Testing's
"What a good test looks like".
