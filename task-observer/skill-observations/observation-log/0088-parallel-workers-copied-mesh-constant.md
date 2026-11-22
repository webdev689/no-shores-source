---
id: 88
title: "Two parallel workers: one copied a mesh's parts into a Rust constant while the other rebuilt the mesh"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "crates/room/src/public/fissure.rs"]
siblings_checked: "family: data one worker derives from another's output (the stores' boxes from the stacks' footprints: caught by the controller's inbox note; the spires' blocks from the fissure's parts: caught only by the rules worker's own test after the merge)."
area: "overlook-source, parallel workers"
date: "2026-11-21"
session_context: "Public events perfect pass: rulesfix stood SPIRES from lattice-fissure's parts while assetsfix lowered the spires."
commands_verified: "cargo test -p room its_spires_stand (failed after the merge, passed with the new parts)"
---

- The rules worker copied lattice-fissure's four parts into `SPIRES` and wrote a test comparing them with
  content/modules/modules.json; the assets worker, in parallel, rebuilt the fissure with lower spires. The merge was
  clean; the full check failed on the test, which is what caught it.
- Proposed: a brief that gives two parallel workers a data dependency names it and who owns it, and the dependent
  reads the data at build time (include_str! of the manifest, as crates/city's modules.rs does) instead of copying
  numbers, or the controller sequences the two.
