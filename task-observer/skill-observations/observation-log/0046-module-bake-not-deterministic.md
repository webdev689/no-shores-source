---
id: 46
title: "A committed module manifest from a worker's last local bake was not what a fresh bake makes: exact booleans reorder faces"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/modules/kit.py", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "family: baked content checked against a committed file in CI (modules workflow; flora's and the wreck's bakes not checked here)."
area: "overlook-source, Blender module bake"
date: "2026-11-20"
session_context: "PR #113 resumed: the hub's chapels baked to new mesh hashes each run with the same triangles."
commands_verified: "bake of chapel-stormcallers twice (hashes differed; vertex and triangle sets equal), then three times after kit._in_order (equal)"
---

- The worker that built the stalls committed the manifest of its last local bake; a fresh bake gave the three chapels
  new hashes, so the `modules` workflow's "bake makes the committed manifest" step would have failed on push.
- Cause: Blender's EXACT boolean hands its faces back in a thread-dependent order. Fixed at export (`kit._in_order`
  sorts each group's vertices and triangles).
- Proposed rule: a brief whose work bakes content CI checks byte-for-byte has the worker bake twice and compare before
  committing the result.

SkillsMP also FAILed in this session's install (no SKILLSMP_API_KEY in the environment it ran on); not needed here.

Later the same session: CI's bake of the pushed manifest differed from the local one in three modules (fountain, well,
bunting), equal triangle counts. Cause taken to be signed zeros: a coordinate one CPU leaves a hair under zero rounds to
-0.0 and packs as other bytes. Fixed with `+ 0.0` after rounding in `kit.exported`; whether CI then agrees is checked
by the next push's `modules` run. The proposed rule stands: a byte-checked bake is compared against CI's before relying
on it, not only against a second local run.
Confirmed: CI's `modules` run on c7ecdb5d made the committed manifest byte for byte and published (run 44842613934).
