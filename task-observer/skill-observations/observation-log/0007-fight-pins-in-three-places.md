---
id: 7
title: "A fight fingerprint is pinned separately in Rust, the page's tests and the server's tests"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "none: the target is the repo's test layout, not a skill"
area: "Agree to the Bit pins across languages"
date: 2026-11-19
session_context: "Hulls worker: every change to a fight's numbers repinned the same hashes in Rust, client and server tests."
parked_until:
resolved:
resolution:
reference:
commands_verified: "NOT RUN: reported by the worker (pins it changed: every fight fingerprint, HULL_FIGHTS, the sea-clash hash in Rust and server/roomDoor.test.ts)"
---

**Issue:** The same fight fingerprint is written into Rust tests, the client's tests and `server/roomDoor.test.ts`. A
change to a fight's numbers means finding and repinning each copy by hand; one missed is a red check after a long run.

**Suggested improvement:** Keep each pinned value once (a small shared file the three test suites read), so a repin is
one edit and the three suites still prove they agree.

**Principle:** A cross-language agreement test should compare each side against one written value, not keep a copy of
it per side.
