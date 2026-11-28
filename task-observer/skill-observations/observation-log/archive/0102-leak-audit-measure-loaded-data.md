---
id: 102
title: "A memory audit that reads allocation sites misses the largest consumer: the data the code loads"
status: declined
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the lesson is the repo's audit procedure (Toolkit.md, Audits), not a skill"
area: "audits, memory"
date: 2026-11-21
session_context: "The owner asked that there be no memory leaks; two read-only audit agents traced allocation sites in the client."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: too narrow, a one-off memory audit. Toolkit.md:74 already says to measure each finding."
reference:
commands_verified: "run: HEAD of all 205 recordings on R2 summed to 107.1 MB of 128 kbps MP3, about 112 minutes, about 2.57 GB decoded at 48 kHz stereo float32 per copy"
---

**Issue:** Two careful audits of allocation sites found real leaks (a 4 MB atlas per place, an audio node a frame,
unclosed bitmaps), and one noted in passing that every recording is decoded at once and kept twice, rating it medium
with its size "not measured". Measuring it, by summing the recordings' sizes on R2, showed it dwarfs everything else:
about 112 minutes of audio, some 2.5 GB decoded, twice over. Reading the code says what is kept; only the data says
how much.

**Suggested improvement:** Toolkit.md, Audits: a memory audit also sizes what the code loads (every file a loader
fetches, times its decoded size), and ranks findings by measured bytes, not by how leaky the code looks.

**Principle:** Memory is dominated by data, not code paths; size the data a loader keeps before ranking the
allocation sites that hold it.
