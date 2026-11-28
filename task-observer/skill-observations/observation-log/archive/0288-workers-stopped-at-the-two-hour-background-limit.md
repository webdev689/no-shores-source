---
id: 288
title: "Four of six item workers were stopped at the 7200 s background limit before their review, pictures and report"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are project files, not skills"
area: "running item workers in parallel"
date: 2026-11-26
session_context: "Six items for the opening tutorial and keeper screen, four workers at once on a 4-core, 15 GB machine (load 9 to 14). escort, hordes, lessons and screen each committed their build, then were killed at 2 h with no report; each needed a finishing run with a narrowed brief."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: run-worker.sh:8-10, Toolkit.md:81-85 (detached start)"
reference:
commands_verified: "bg tasks bdbdl8uup, bdycgn691, br71pd0da, bpetao3ke killed at the limit; finishing runs b0k0cs1q5, b2u8m9eaz completed"
---

**Issue:** The longest background timeout (2 h) is shorter than a large item takes under four-way load; a killed worker writes no report and its last step's state must be read from git.

**Suggested improvement:** Toolkit.md workers: size an item to finish in about 90 minutes at the expected load, or split it into a build run and a finishing run (review, pictures, report) from the start; the brief tells the worker to commit every 30 minutes and to write the report's skeleton first, filling it as it goes.

**Principle:** A worker's report is the hand-off; write it incrementally so a hard stop loses none of it.
