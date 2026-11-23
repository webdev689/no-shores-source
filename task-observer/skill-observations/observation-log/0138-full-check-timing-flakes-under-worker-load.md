---
id: 138
title: "The full check's timing tests fail while workers share the CPUs, so a check meant to clear a push fails on load"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "groundPaint, ruinBudget, audioAway and roomThread tests"
area: "running cargo xtask check beside workers"
date: 2026-11-23
session_context: "Overlook #155: three workers at a load average of 17 on 4 CPUs; the full check failed on 'a chalk zone ... painted in a few tens of ms' (357 ms), a ruin's build-time ratio (3.7x), the audio clock test and the sea worker test. Two were real flakes in main's tests (fixed); the timing ones passed once the workers were done."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: uptime showed load 17.35; the same check passed at load 1.8"
---

**Issue:** The check gates every push, but its timing tests need a quiet machine, so pushes waited hours behind
workers and the stop hook kept asking.

**Suggested improvement:** Run the full check only when no worker runs (or with workers paused between steps); push
the last green head before starting workers; make timing tests compare warmed ratios over several samples.

**Principle:** A gate that measures time measures the machine too: give it the machine.
