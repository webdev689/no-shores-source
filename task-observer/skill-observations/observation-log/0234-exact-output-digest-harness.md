---
id: 234
title: "Exact-output performance refactors need a before/after digest of every real output; the project has no kept harness for it, so each session rebuilds one"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are project files, not skills"
area: "proving a speedup changes nothing"
date: 2026-11-24
session_context: "The owner's extreme performance pass. The navmesh watershed (pending list), ear-clip (kept ears), links slicing and Ground::nearest (box reject) were each claimed to give the same output to the bit. The unit tests passed either way and could not show it: only a scratch ignored test in room's quest_grounds_tests.rs, which baked every mesh of the first landmass's nodes (77) and printed an FNV digest of each mesh's Debug text, did. Run before the first change and after each, its diff proved every step (commits fc644b75, f5e564f6, c5c54aaa). It was removed before committing, as a golden digest would break on every intended mesh change."
parked_until: "PR #244 merge"
resolved:
resolution:
reference:
commands_verified: "cargo test -q -p room --release scratch_mesh_digests -- --ignored --nocapture (77 digests, identical before and after each change)"
---

**Issue:** A speedup meant to leave results unchanged is only proven by comparing the outputs of real data, all of it, before and after; tests that check behaviour pass for a slightly different mesh too. The project keeps no harness for this, so the harness (bake every real node and place, digest each output's Debug text, sort, diff) is written from scratch each time, and a session that skips it claims "the same to the bit" without the check that shows it.

**Suggested improvement:** Keep one ignored digest test per heavy pure stage (the navmesh bake over the first landmass, the land's heights over a lattice, a node file's bake), each printing `name digest` lines, and name them in Testing.md with the recipe: run on the base, save, run after, `diff`. Never a golden in CI: an intended change must not fail it.

**Principle:** "Same output, faster" is a claim about every input; check it against all the real inputs at hand, digested, before and after, and say how many were compared.
