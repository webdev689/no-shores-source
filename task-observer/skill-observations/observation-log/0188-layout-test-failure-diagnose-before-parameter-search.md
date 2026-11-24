---
id: 188
title: "A layout test broken by a brief change: diagnose the geometry before searching brief parameters"
status: open
type: internal
skill: ["superpowers:systematic-debugging"]
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: systematic-debugging is the skill that should have fired (second hypothesis rule); instance-specific to No Shores' layout crate otherwise, no propagation."
area: "no-shores-source, Rust layout tests"
date: "2026-11-24"
session_context: "First Breach audit (#182): the Sunken Gate's area in Gullwing Vale's brief broke saltmere_layouts' cave roof test after the base merge."
commands_verified: "search2.sh over position x level (12 combos, ~3 min each) found none passing; a with/without diff of areas, then edge heights, then floor distances found the cause (masses::reach_masses valley cut past the cavern) in four runs; fix a9aecbb7."
---

- The failing test said "a cave roof's top 11.4 stands over its rock 9.3". The first response was a brute-force search
  of the new area's place and level in the brief (about 40 minutes of test runs). No combination passed all three
  layout suites, because the cause was not the placement: a later carving step (a dead mass's valley) did not keep off
  caverns.
- Diffing the layout with and without the change (areas, then the land at the failing edge, then which carve step ran
  after the cavern) found it in four runs. Parameter search on a chaotic layout is a last resort, after one geometry
  diff.
- Small trap on the way: `cargo test` swallows a passing test's eprintln, so the "base" side of a debug diff printed
  nothing until `-- --nocapture` was added; an empty diff side read at first as "no such zone".
- Proposed: Toolkit.md's layout section says to diff the failing geometry with and without the change (with
  `--nocapture`) before searching brief values.
