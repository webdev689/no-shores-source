---
id: 322
title: "A test of a ship's swing ratio measured it one second after the wheel went over, while the swing was still limited by its acceleration, so it passed while the settled swing was wrong; a review found it, and a 6-fight paired table had been read as a balance defect"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "none: the target is a project note, not a skill"
area: "testing a rate or a balance claim"
date: 2026-11-24
session_context: "Ships at the Harbourmaster: naval class_tests asserted each hull's swing was its class's share of the Sloop's, read one second after hard over. Swing there is acceleration-limited (turn_accel times the class factor), so the ratio held exactly, while the settled swing went through each hull's own gain (steerage(way/gain)) and differed (Schooner 1.067 for a 1.1 class). An independent read-only review caught it. Separately, measure_fights_by_hull at 6 fights a row showed the Schooner losing far more closing in (1 of 6 against the Sloop's 4); a per-fight probe and 12 fights a row showed most of it was noise, and the rest the same handling cause."
parked_until:
resolved:
resolution:
reference:
commands_verified: "cargo test -p naval --lib held_at_the_same_way (fails on the old helm, passes with the Sloop's gain); cargo test -p room --release measure_fights_by_hull -- --ignored --nocapture --test-threads=1"
---

**Issue:** A rate test read the value during the transient, where a different limit (acceleration) set it, so it proved the factor reached that limit and not the quantity the shipyard showed. A small paired measurement (6 a row) was nearly taken as a balance defect worth retuning.

**Suggested improvement:** In the Testing note: a test of a rate (speed, swing, reload) reads it settled, with what it depends on held equal (here the way), and at several points across its range; a transient reading needs its own named test. A measurement table that drives a tuning call states its sample size, and a surprising row is probed per trial (and with more trials) before any number moves.

**Principle:** Test the quantity a player is shown, at the state it is shown for; a value read where another limit binds can only confirm that limit. Read a small sample's surprise as a question, not an answer.
