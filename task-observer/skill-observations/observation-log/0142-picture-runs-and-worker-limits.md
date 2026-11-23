---
id: 142
title: "Encounter picture runs: the scratch room ticks only as the page draws, and four workers hit the 2-hour limit"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "encounter-plan.ts is the only encounter picture driver; run-worker.sh is the only worker launcher"
area: "picturing timed game moments headless, and sizing a worker's item to its time limit"
date: 2026-11-23
session_context: "Overlook Playlist session, workers enc2, enc3, enc4, pl2 (OBSERVATIONS lines): enc2, enc3 and pl2 each hit the 2-hour background limit and were resumed with --resume; enc4 ended after ponytail-review without writing its report and was resumed to finish. The workers reported: the local room only ticks when the page draws a frame, so a picture that waits in seconds never reaches a timed moment (a Reckoning, Fury); a teleported Boss takes about 20 frames to be drawn there and a warded Boss runs back to its post; switching the Vite worktree's commit, or editing a client file, reloads Vite and kills a running picture run; moving encounter pieces breaks seal tests that name a dungeon; four builders sharing 4 cores ran `cargo xtask check` themselves until told not to."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: bash tools/claude-toolkit/workers/run-worker.sh /root/wt/enc3 <brief> --resume -> worker finished and wrote ~/wt/reports/enc3.md; audit.py on each worker"
---

**Issue:** Picture work on timed moments needs state hooks, not waits, and a design-pass item with pictures does not fit
one 2-hour worker run; a run that ends mid-item leaves uncommitted work or no report.

**Suggested improvement:** In Toolkit.md's "Encounter pictures": set every timed moment with a QA-only hook
(`room_qa_encounter`, `room_qa_freeze`), wait in frames not seconds, and serve pictures from a Vite worktree nobody edits
or switches during a run. In the worker brief: a picture-heavy item is split into a build item and a picture item, or
budgeted for two runs; the brief says "write the report before the reviewer" so a stopped run still leaves one; and with
more than two workers, the brief says "no full check: the controller runs it after merging" from the start.

**Principle:** A headless picture must set the state it shows; and a worker's last act must not be its only report.
