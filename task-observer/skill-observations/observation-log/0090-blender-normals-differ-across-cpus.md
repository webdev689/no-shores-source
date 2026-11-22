---
id: 90
title: "Blender's single-float normals differ across CPUs; a byte-packed normal tips over a rounding edge"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/modules/kit.py", ".github/workflows/modules.yml", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: bakes whose bytes must match across machines (modules: positions' sign of zero, then normals; flora, ships and wreck not checked)."
area: "overlook-source, Blender pipelines"
date: "2026-11-21"
session_context: "Public events perfect pass: modules.yml failed twice on tithe-stores-a; no local switch (glibc hwcaps, numpy SIMD) reproduced it."
commands_verified: "modules-differed artifact from run 44913048676 compared vertex by vertex: 3 vertices, normal y 73 vs 74; jittered-normal bake of three modules identical"
---

- A bake that differs only on CI cannot be found by guessing at local switches; keeping CI's bake as an artifact on a
  failure (now in modules.yml) found it in one run: positions identical, one triangle's normal a byte apart.
- Fix used: the event modules' normals come from the rounded positions in doubles (`_steady_normals`), with
  Blender's normals only choosing the smoothing; proven with Blender's normals jittered by 2e-6.
- Proposed: the same keep-on-failure step in the other Blender workflows that compare bakes (flora, ships, wreck),
  and the same normals rule for any new module a byte-identical bake must hold.
